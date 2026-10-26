import test from "node:test";
import assert from "node:assert/strict";
import { createEmitters } from "../features/browser/hooks/useBrowserBus.js";

// Emitters over a fake bus: every browser:input emit is captured; acks can carry clipboard.
function setup({ ack = {} } = {}) {
  const sent = [];
  const calls = { secondary: [], clip: [] };
  const bus = { emit: (ev, payload, cb) => { sent.push({ ev, ...payload }); cb?.(ack); } };
  const ctx = {
    busRef: { current: bus }, targetId: "t1", profile: "p",
    frameRef: { current: { meta: { deviceWidth: 1000, deviceHeight: 500 } } },
    getCanvas: () => ({ width: 2000, height: 1000 }),
    onSecondaryClick: (x, y) => calls.secondary.push([x, y]),
    onClipboard: (t) => calls.clip.push(t)
  };
  const st = { queue: [], timer: null, held: null, pos: { x: 0, y: 0 }, clickCount: 1, lastPress: { at: 0, x: 0, y: 0, count: 0 } };
  return { e: createEmitters(() => ctx, st), sent, calls, st };
}
const events = (sent) => sent.flatMap((s) => s.events);

test("percent maps to page CSS px; press/release carry the same point", () => {
  const { e, sent } = setup();
  e.emitMouseClick(50, 50);
  assert.deepEqual(events(sent).map((x) => [x.type, x.x, x.y]), [["press", 500, 250], ["release", 500, 250]]);
});

test("two quick presses at one spot become clickCount 2 (word select)", () => {
  const { e, sent } = setup();
  e.emitMouseClick(10, 10);
  e.emitMouseClick(10, 10);
  assert.deepEqual(events(sent).filter((x) => x.type === "press").map((x) => x.clickCount), [1, 2]);
});

test("right click goes to the context menu, never to the page", () => {
  const { e, sent, calls } = setup();
  e.emitMousePress(50, 50, "right");
  e.emitMouseClick(50, 50, "right");
  assert.equal(sent.length, 0);
  assert.deepEqual(calls.secondary, [[500, 250]]);
});

test("drag move is flagged and flushes with the release in order", () => {
  const { e, sent } = setup();
  e.emitMousePress(0, 0);
  e.emitMouseMove(10, 10);
  e.emitMouseRelease(10, 10);
  const types = events(sent).map((x) => `${x.type}${x.drag ? ":drag" : ""}`);
  assert.deepEqual(types, ["press", "move:drag", "release"]);
});

test("scroll deltas coalesce and keep direction (down/right positive)", () => {
  const { e, sent, st } = setup();
  e.emitScroll("down", 30);
  e.emitScroll("down", 30);
  e.emitScroll("left", 15, true);
  clearTimeout(st.timer);
  e.emitKeyPress("a", []); // non-lazy event flushes the queue
  const wheels = events(sent).filter((x) => x.t === "wheel");
  // vertical + horizontal bursts merge into ONE wheel event carrying both deltas
  assert.equal(wheels.length, 1);
  assert.ok(wheels[0].deltaY > 30 * 0.67, "two down bursts accumulate");
  assert.ok(wheels[0].deltaX < 0, "left is negative");
});

test("copy ack hands the selected text to onClipboard", () => {
  const { e, calls } = setup({ ack: { ok: true, clipboard: "hello" } });
  e.emitKeyPress("c", ["control"]);
  assert.deepEqual(calls.clip, ["hello"]);
});
