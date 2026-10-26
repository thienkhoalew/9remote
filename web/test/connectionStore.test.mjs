import assert from "node:assert/strict";
import { useConnectionStore } from "../shared/stores/connectionStore.js";

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

test("initial state defaults", () => {
  useConnectionStore.getState().reset();
  const state = useConnectionStore.getState();
  assert.equal(state.bus, null);
  assert.equal(state.connected, false);
  assert.equal(state.connectionMode, "tunnel");
  assert.equal(state.carrier, "ws");
});

test("setConnection updates multiple fields", () => {
  const dummyBus = { emit: () => {} };
  useConnectionStore.getState().setConnection({
    bus: dummyBus,
    connected: true,
    connectionMode: "webrtc",
    carrier: "rtc"
  });
  const state = useConnectionStore.getState();
  assert.equal(state.bus, dummyBus);
  assert.equal(state.connected, true);
  assert.equal(state.connectionMode, "webrtc");
  assert.equal(state.carrier, "rtc");
});

test("setCarrier updates carrier independently", () => {
  useConnectionStore.getState().setCarrier("ws");
  assert.equal(useConnectionStore.getState().carrier, "ws");
});

test("setConnected updates connected independently", () => {
  useConnectionStore.getState().setConnected(false);
  assert.equal(useConnectionStore.getState().connected, false);
});

test("reset restores clean defaults", () => {
  useConnectionStore.getState().reset();
  const state = useConnectionStore.getState();
  assert.equal(state.bus, null);
  assert.equal(state.connected, false);
  assert.equal(state.carrier, "ws");
});

test("hostOffline flag: default off, set by verdict, cleared by reset", () => {
  useConnectionStore.getState().reset();
  assert.equal(useConnectionStore.getState().hostOffline, false);
  useConnectionStore.getState().setHostOffline(true);
  assert.equal(useConnectionStore.getState().hostOffline, true);
  useConnectionStore.getState().setHostOffline(false);
  assert.equal(useConnectionStore.getState().hostOffline, false);
  useConnectionStore.getState().setHostOffline(true);
  useConnectionStore.getState().reset();
  assert.equal(useConnectionStore.getState().hostOffline, false, "reset must drop the offline verdict — it belongs to the dropped connection");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
