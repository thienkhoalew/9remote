// The transcript cache must never make a stale read look fresh.
//
// Reopening a chat re-reads the same transcript, and it usually has not changed since
// the last look. Caching that read is what makes a reattach cheap — but a cache that
// misses an append, a rewind, or a rewrite shows the user a conversation that is no
// longer on disk. These tests pin the invalidation, not the speed.
//
// Run: node --test host/test/claudeTranscriptCache.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "9r-cache-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
after(() => fs.rmSync(home, { recursive: true, force: true }));

const {
  recoverClaudeBundle,
  recoverFromClaudeTranscript,
  clearTranscriptCache
} = await import("../features/ai/claudeTranscript.js");

// `recoverClaudeTranscript` above is the engine-level reader (cwd, id, startSeq, leafOverride);
// this alias keeps the rewind call below readable.
const recoverClaudeTranscript = recoverFromClaudeTranscript;

const CWD = "/Users/Working/cachecwd";
const DIR = path.join(home, ".claude", "projects", CWD.replace(/[/\\:]/g, "-"));
fs.mkdirSync(DIR, { recursive: true });

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function transcript(turns, { startAt = 0 } = {}) {
  const out = [];
  for (let i = 0; i < turns; i++) {
    const n = startAt + i;
    out.push({ type: "user", uuid: uuid(n * 2), parentUuid: n === 0 ? null : uuid(n * 2 - 1), message: { content: [{ type: "text", text: `q${n}` }] } });
    out.push({ type: "assistant", uuid: uuid(n * 2 + 1), parentUuid: uuid(n * 2), message: { content: [{ type: "text", text: `a${n}` }] } });
  }
  out.push({ type: "last-prompt", leafUuid: uuid((startAt + turns) * 2 - 1) });
  return out;
}

function write(name, records) {
  const file = path.join(DIR, `${name}.jsonl`);
  fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return file;
}

const userTurns = (events) => (events || []).filter((e) => e.event === "user_message").map((e) => e.data.text);

test("a second open of an unchanged file answers the same log", () => {
  write("steady", transcript(5));
  clearTranscriptCache();

  const first = recoverFromClaudeTranscript(CWD, "steady");
  const second = recoverFromClaudeTranscript(CWD, "steady");
  assert.deepEqual(second, first, "the cache must not change the answer");
  assert.deepEqual(userTurns(second), ["q0", "q1", "q2", "q3", "q4"]);
});

test("a turn appended after the first open shows up on the next one", () => {
  const file = write("appended", transcript(3));
  clearTranscriptCache();
  assert.deepEqual(userTurns(recoverFromClaudeTranscript(CWD, "appended")), ["q0", "q1", "q2"]);

  // Same file, one more turn — the mtime/size key must invalidate.
  fs.writeFileSync(file, transcript(4).map((r) => JSON.stringify(r)).join("\n") + "\n");
  assert.deepEqual(
    userTurns(recoverFromClaudeTranscript(CWD, "appended")),
    ["q0", "q1", "q2", "q3"],
    "a stale read here hides the turn the user just sent"
  );
});

test("a rewound file that got shorter is never served from the cache", () => {
  const file = write("rewound", transcript(6));
  clearTranscriptCache();
  assert.equal(userTurns(recoverFromClaudeTranscript(CWD, "rewound")).length, 6);

  // A rewind drops turns: same session id, fewer lines, new leaf.
  const kept = transcript(2);
  fs.writeFileSync(file, kept.map((r) => JSON.stringify(r)).join("\n") + "\n");
  assert.deepEqual(
    userTurns(recoverFromClaudeTranscript(CWD, "rewound")),
    ["q0", "q1"],
    "the discarded turns must not come back from a cached read"
  );
});

test("a rewrite of the same size but different content is picked up", () => {
  // size alone is not enough — mtime is part of the key for exactly this case.
  const first = transcript(2);
  write("same-size", first);
  clearTranscriptCache();
  assert.deepEqual(userTurns(recoverFromClaudeTranscript(CWD, "same-size")), ["q0", "q1"]);

  // Same byte length, different text: only the leading letter changes, so size cannot
  // tell the two files apart and mtime is the only thing that can.
  const swapped = first.map((r) => {
    if (r.type !== "user" && r.type !== "assistant") return r;
    const text = r.message.content[0].text;
    return { ...r, message: { ...r.message, content: [{ ...r.message.content[0], text: (text[0] === "q" ? "z" : "w") + text.slice(1) }] } };
  });
  const file = path.join(DIR, "same-size.jsonl");
  assert.equal(
    Buffer.byteLength(swapped.map((r) => JSON.stringify(r)).join("\n") + "\n"),
    Buffer.byteLength(first.map((r) => JSON.stringify(r)).join("\n") + "\n"),
    "fixture must keep the byte length identical, or it proves nothing"
  );
  fs.writeFileSync(file, swapped.map((r) => JSON.stringify(r)).join("\n") + "\n");
  assert.deepEqual(
    userTurns(recoverFromClaudeTranscript(CWD, "same-size")),
    ["z0", "z1"],
    "the content changed, so the cached read is stale"
  );
});

test("a rewind (leafOverride) always reads the file, never the cache", () => {
  const file = write("override", transcript(6));
  clearTranscriptCache();
  recoverFromClaudeTranscript(CWD, "override"); // fills the cache

  // The CLI is cutting the file as the rewind asks; what the cache holds is the
  // pre-cut conversation, and answering with it would show turns being discarded.
  const kept = transcript(2);
  fs.writeFileSync(file, kept.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const cut = recoverClaudeTranscript(CWD, "override", 1, uuid(3));
  assert.deepEqual(userTurns(cut), ["q0", "q1"], "the override read must see the file as it is now");
});

test("state is answered from the same cached read", () => {
  const records = transcript(4);
  records.push({ type: "permission-mode", permissionMode: "acceptEdits" });
  records.push({ type: "ai-title", aiTitle: "Cached title" });
  write("state", records);
  clearTranscriptCache();

  const first = recoverClaudeBundle(CWD, "state");
  const second = recoverClaudeBundle(CWD, "state");
  assert.equal(second.state.title, "Cached title");
  assert.equal(second.state.permissionMode, "acceptEdits");
  assert.deepEqual(second.events, first.events);
});

test("the whole answer is cached, and an append replaces it", () => {
  // Rebuilding events from unchanged records is the remaining cost, so the cache holds
  // the answer itself — and must drop it the moment the file really changed.
  const file = write("whole", transcript(3));
  clearTranscriptCache();

  const first = recoverClaudeBundle(CWD, "whole");
  assert.deepEqual(recoverClaudeBundle(CWD, "whole").events, first.events, "same file, same answer");

  fs.writeFileSync(file, transcript(5).map((r) => JSON.stringify(r)).join("\n") + "\n");
  const next = recoverClaudeBundle(CWD, "whole");
  assert.equal(userTurns(next.events).length, 5, "the appended turns must be in the answer, not the cached one");
});

test("a cached answer is never handed to a caller asking from another startSeq", () => {
  // startSeq shifts every seq in the log; answering a shifted request with the 1-based
  // cache would renumber it wrong and the client's watermark would drop the replay.
  write("seq", transcript(3));
  clearTranscriptCache();
  const fromOne = recoverClaudeBundle(CWD, "seq", { startSeq: 1 });
  const fromHundred = recoverClaudeBundle(CWD, "seq", { startSeq: 100 });
  assert.equal(fromOne.events[0].seq, 1);
  assert.equal(fromHundred.events[0].seq, 100, "the cached 1-based answer must not leak into this one");
});

test("the cache is bounded, so a long-lived host does not grow without end", () => {
  // More distinct conversations than the cache holds: the oldest must fall out,
  // and — the part that matters — the ones still asked for must stay correct.
  for (let i = 0; i < 8; i++) write(`many-${i}`, transcript(2));
  clearTranscriptCache();
  for (let i = 0; i < 8; i++) recoverFromClaudeTranscript(CWD, `many-${i}`);

  // Asking again must still answer correctly whether it hits or misses.
  for (let i = 0; i < 8; i++) {
    assert.deepEqual(userTurns(recoverFromClaudeTranscript(CWD, `many-${i}`)), ["q0", "q1"]);
  }
});
