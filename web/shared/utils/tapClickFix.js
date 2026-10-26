// WebKit on macOS mangles the click of a trackpad tap-to-click press: the down/up of
// a tap arrive as one bundle, and the engine either dispatches them out of order (up
// first, so no click is ever synthesized — WebKit bug 219670 family) or hit-tests the
// two presses apart and fires the click on their common ancestor, where the pressed
// element's onClick never sees it (same family as the quirks worked around in
// useDragReorder/dragResize). This repairs only those two failures: it arms solely on
// macOS WebKit, for mouse taps that barely moved, and only acts when the native click
// is missing or provably landed on an ancestor. Every other click path is untouched.
const MOVE_TOLERANCE_PX = 8;
const DBL_WINDOW_MS = 500;
const ORPHAN_PAIR_MS = 100;
// Verdict grace period after up: WebKit never fires a click for a reversed bundle,
// so the check can run as soon as the interaction's events have settled.
const CLICK_WAIT_MS = 0;

function isMacWebKit() {
  if (typeof navigator !== "object") return false;
  const ua = navigator.userAgent || "";
  return /Mac/.test(navigator.platform || ua) && ua.includes("AppleWebKit") && !ua.includes("Chrome");
}

export function installTapClickFix() {
  if (typeof window === "undefined" || !isMacWebKit()) return () => {};

  let tap = null;        // in-flight tap: { target, x, y, moved, up, clicked, synth, timer }
  let orphanUp = null;   // an up that arrived before its down (reversed bundle)
  let lastSynth = null;  // { target, at } — two synthetic clicks pair into a dblclick

  const isMouseTap = (e) => e.pointerType === "mouse" && e.button === 0;
  const near = (x, y) => Math.hypot(x - tap.x, y - tap.y) <= MOVE_TOLERANCE_PX;

  const dispatch = (type, target, detail, x, y) => {
    target.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, detail
    }));
  };

  const synthesizeClick = () => {
    const { target, x, y } = tap;
    tap.clicked = true;
    const now = performance.now();
    const pair = lastSynth && now - lastSynth.at <= DBL_WINDOW_MS && lastSynth.target === target;
    // Flag as ours for the whole (synchronous) dispatch, or our own capture-phase
    // listener would mistake it for a late native duplicate and stop it.
    tap.synth = true;
    dispatch("click", target, pair ? 2 : 1, x, y);
    if (pair) { dispatch("dblclick", target, 2, x, y); lastSynth = null; }
    else lastSynth = { target, at: now };
    tap.synth = false;
  };

  // Verdict one macrotask after up: every event of the interaction has been
  // dispatched by now, so a click that still hasn't arrived was never coming.
  const checkAfterUp = () => {
    if (!tap || tap.clicked || tap.moved || !tap.up) return;
    if (!tap.target.isConnected) return; // unmounted mid-tap — nothing left to deliver to
    synthesizeClick();
  };
  const scheduleCheck = () => {
    clearTimeout(tap.timer);
    tap.timer = setTimeout(checkAfterUp, CLICK_WAIT_MS);
  };

  const onPointerDown = (e) => {
    if (!isMouseTap(e)) { orphanUp = null; return; }
    const pair = orphanUp && performance.now() - orphanUp.at <= ORPHAN_PAIR_MS
      && Math.hypot(e.clientX - orphanUp.x, e.clientY - orphanUp.y) <= MOVE_TOLERANCE_PX;
    orphanUp = null;
    clearTimeout(tap?.timer);
    tap = { target: e.target, x: e.clientX, y: e.clientY, moved: false, up: !!pair, clicked: false, synth: false, timer: null };
    if (pair) scheduleCheck(); // reversed bundle: the up already passed through
  };

  const onPointerMove = (e) => {
    if (tap && !tap.moved && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > MOVE_TOLERANCE_PX) tap.moved = true;
  };

  const onPointerUp = (e) => {
    if (!isMouseTap(e)) return;
    // An up with no press in flight — nothing pending, or the previous tap already
    // completed — is the leading half of a reversed bundle: record it for pairing.
    if (!tap || tap.up || tap.clicked) {
      orphanUp = { x: e.clientX, y: e.clientY, target: e.target, at: performance.now() };
      return;
    }
    if (near(e.clientX, e.clientY)) { tap.up = true; scheduleCheck(); }
    else tap.moved = true;
  };

  const onClick = (e) => {
    if (e.button !== 0 || !tap || tap.synth) return;
    if (tap.clicked) {
      // Late native duplicate of a click we already synthesized.
      if (near(e.clientX, e.clientY)) e.stopPropagation();
      return;
    }
    if (tap.moved || !near(e.clientX, e.clientY)) return;
    const t = e.target;
    if (t === tap.target || tap.target.contains(t)) {
      tap.clicked = true; // native click reached the pressed element — leave it alone
    } else if (t.contains(tap.target) && tap.target.isConnected) {
      // Misrouted to an ancestor: the pressed element's handlers would never run.
      e.stopPropagation();
      e.preventDefault();
      synthesizeClick();
    } else {
      tap.clicked = true; // unrelated click — not ours to judge
    }
  };

  const onCancel = () => {
    clearTimeout(tap?.timer);
    tap = null;
    orphanUp = null;
  };

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onCancel, true);
  window.addEventListener("click", onClick, true);
  return () => {
    clearTimeout(tap?.timer);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    window.removeEventListener("click", onClick, true);
  };
}
