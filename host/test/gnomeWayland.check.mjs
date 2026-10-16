import assert from 'node:assert/strict';
import { gnomeWayland as bridge, checkGnomeWayland } from '../features/remote/adapters/gnomeWayland.js';

const commands = [];
const send = bridge.send;
bridge.send = command => commands.push(command);
try {
  bridge.keyTap('a', ['control']);
  assert.deepEqual(commands, [
    { op: 'key', key: 'control', down: true }, { op: 'key', key: 'a', down: true },
    { op: 'key', key: 'a', down: false }, { op: 'key', key: 'control', down: false },
  ]);
  assert.throws(() => bridge.moveMouse(NaN, 1));
  assert.throws(() => bridge.scrollMouse(Infinity, 0));
  assert.throws(() => bridge.keyTap('a', ['invalid']));
  assert.throws(() => bridge.mouseToggle('down', 'invalid'));
  assert.throws(() => bridge.typeString('x'.repeat(10001)));
  commands.length = 0;
  bridge.mouseClick('left', true);
  assert.deepEqual(commands.map(c => c.down), [true, false, true, false]);
} finally { bridge.send = send; }

if (process.argv.includes('--live')) {
  checkGnomeWayland();
  try {
    for (let i = 0; i < 2; i++) {
      await bridge.start();
      const frame = bridge.capture();
      assert.equal(frame.buffer.length, frame.width * frame.height * 4);
      assert.equal(frame.format, 'rgba');
      assert(frame.width > 0 && frame.height > 0);
      if (process.argv.includes('--type-test')) {
        bridge.keyTap('a', ['control']);
        bridge.typeString('9remote Wayland tiếng Việt ✓');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      console.log(`PASS: live GNOME frame ${frame.width}x${frame.height}, restart ${i + 1}`);
      bridge.stop();
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  } finally { bridge.stop(); }
}
console.log('PASS: GNOME input mapping and invalid input checks');
