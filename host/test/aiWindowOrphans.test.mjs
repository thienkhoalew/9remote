// A replay window must never open on a sub-agent's cards.
//
// `tool_child` / `tool_result_child` are nested under a `tool_start` card; the client
// reducer drops them when that parent is not in the same window. A turn that ran a
// heavy sub-agent can put hundreds of those events in the last 32KB — the parent's
// `tool_start` is then megabytes away, out of budget, and the old tail-snapping kept
// the orphaned children. The pane opened with zero messages: the whole chat looked
// unloadable.
//
// The fix cannot always reach the parent (a turn can be megabytes wide). What it must
// never do is ship children whose parent is missing — a window of fewer, coherent
// events beats a bigger one the client throws away.
//
// Run: node --test host/test/aiWindowOrphans.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { aiTailStart, replayWindow, windowBytes } = await import("../features/ai/aiEventSlice.js");

const MAX = 32 * 1024;

/** An event shaped like the wire ones, padded to `bytes` total. */
function ev(event, data, bytes = 200) {
  const base = { seq: 0, event, data };
  const pad = Math.max(0, bytes - JSON.stringify(base).length);
  return { seq: 0, event, data: { ...data, pad: "x".repeat(pad) } };
}

/** A conversation turn: prompt, a parent tool card, then N sub-agent events. */
function turnWithSubagents({ seq, children = 200, resultBytes = 900 }) {
  const out = [];
  let n = seq;
  out.push(ev("user_message", { text: "do the thing" }, 120));
  out.push(ev("delta", { text: "working" }, 120));
  out.push(ev("tool_start", { id: "parent-1", name: "Task", input: {} }, 200));
  out.push(ev("thinking", { text: "thinking" }, 120));
  for (let i = 0; i < children; i++) {
    out.push(ev("tool_child", { id: `child-${i}`, name: "Read", parentToolUseId: "parent-1", status: "running" }, 200));
    out.push(ev("tool_result_child", { id: `child-${i}`, name: "Read", parentToolUseId: "parent-1", output: "r".repeat(resultBytes) }, resultBytes));
  }
  out.push(ev("tool_result", { id: "parent-1", name: "Task", status: "done" }, 200));
  out.push(ev("turn_complete", { stats: {} }, 120));
  return out.map((e) => ({ ...e, seq: ++n }));
}

const isChild = (e) => e.event === "tool_child" || e.event === "tool_result_child";

/** The reducer's rule: a child with no parent card in the same list is dropped. */
function orphansIn(window) {
  const parents = new Set(
    window.filter((e) => e.event === "tool_start" && e.data?.id).map((e) => e.data.id)
  );
  return window.filter((e) => isChild(e) && !parents.has(e.data?.parentToolUseId));
}

test("a heavy sub-agent tail does not open the window on orphaned children", () => {
  // The children alone are far past the byte budget, so the parent cannot be reached.
  const log = turnWithSubagents({ seq: 0, children: 300 });
  const { events } = replayWindow(log, MAX);

  assert.ok(events.length > 0, "the window must not be empty");
  assert.deepEqual(orphansIn(events), [], "every sub-agent card in the window needs its parent card");
});

test("the window still fits the byte budget after the orphans are dropped", () => {
  const log = turnWithSubagents({ seq: 0, children: 300 });
  const { events } = replayWindow(log, MAX);
  assert.ok(windowBytes(events) <= MAX, `window is ${windowBytes(events)} bytes, budget ${MAX}`);
});

test("a turn whose parent IS reachable keeps its sub-agent cards", () => {
  // Small enough that the whole turn fits: dropping the children here would lose
  // real content, so the fix must be conditional, not a blanket exclusion.
  const log = turnWithSubagents({ seq: 0, children: 3, resultBytes: 200 });
  const { events } = replayWindow(log, MAX);
  assert.ok(events.some(isChild), "the children belong to a parent that is in the window");
  assert.deepEqual(orphansIn(events), []);
});

test("a window that already starts clean is left alone", () => {
  // No sub-agents at all — the ordinary case must keep its exact tail.
  const log = [];
  let n = 0;
  for (let i = 0; i < 40; i++) {
    log.push(ev("user_message", { text: `q${i}` }, 120));
    log.push(ev("delta", { text: `a${i}` }, 120));
    log.push(ev("tool_start", { id: `t${i}`, name: "Bash", input: {} }, 200));
    log.push(ev("tool_result", { id: `t${i}`, name: "Bash", output: "ok" }, 200));
    log.push(ev("turn_complete", { stats: {} }, 120));
  }
  for (const e of log) e.seq = ++n;

  const { events } = replayWindow(log, MAX);
  assert.deepEqual(orphansIn(events), []);
  assert.ok(events.length > 0);
  // The last event of the log is always in the window.
  assert.equal(events.at(-1).seq, log.at(-1).seq);
});

test("a log made only of orphaned children opens empty rather than broken", () => {
  // Pathological: no parent anywhere (a truncated log). The client cannot draw any
  // of it, so the honest answer is nothing — and `hasMore` still says more exists.
  const log = [];
  let n = 0;
  for (let i = 0; i < 50; i++) {
    log.push(ev("tool_result_child", { id: `c${i}`, parentToolUseId: "missing", output: "x".repeat(400) }, 400));
    log[n].seq = ++n;
  }
  const win = replayWindow(log, MAX);
  assert.deepEqual(win.events, []);
  assert.equal(win.hasMore, true, "the range before this one is still fetchable");
});

test("a tail of nothing but sub-agent cards opens on the prompt that started it", () => {
  const log = turnWithSubagents({ seq: 0, children: 300 });
  // The last prompt in the log is the one this sub-agent work belongs to.
  const promptIdx = log.map((e, i) => [e.event, i]).filter(([e]) => e === "user_message").at(-1)[1];
  assert.equal(aiTailStart(log, MAX), promptIdx, "the cut lands on the prompt, not mid-sub-agent");
});
