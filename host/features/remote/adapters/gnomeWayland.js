import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const useGnomeWayland = process.platform === 'linux' &&
  Boolean(process.env.WAYLAND_DISPLAY) && /gnome/i.test(process.env.XDG_CURRENT_DESKTOP || '');

const helperPath = fileURLToPath(new URL('./gnome-wayland.py', import.meta.url));

export function checkGnomeWayland() {
  execFileSync('/usr/bin/python3', [helperPath, '--check'], { timeout: 10000, stdio: 'pipe' });
}

let child = null;
let starting = null;
let latest = null;
let failure = null;
let lastError = '';

// ponytail: GNOME primary monitor only, 15 fps; add portal selection for other compositors/monitors.
export const gnomeWayland = {
  async start() {
    if (starting) return starting;
    if (child && latest) return;
    failure = null;
    latest = null;
    lastError = '';
    const current = spawn('/usr/bin/python3', [helperPath],
      { stdio: ['pipe', 'pipe', 'pipe'] });
    child = current;
    let pending = null;
    starting = new Promise((resolve, reject) => {
      const fail = (error) => {
        if (child === current) {
          failure = error;
          latest = null;
          child = null;
        }
        clearTimeout(timer);
        current.kill();
        reject(error);
      };
      const timer = setTimeout(() => fail(new Error(`GNOME capture timed out. ${lastError}`)), 15000);
      current.once('error', fail);
      current.stdin.on('error', fail);
      current.stderr.on('data', (data) => {
        lastError = (lastError + data.toString()).slice(-4000);
        console.error(`[GNOME Wayland] ${data.toString().trim()}`);
      });
      current.once('exit', (code, signal) => {
        clearTimeout(timer);
        if (child === current) fail(new Error(`GNOME bridge stopped (${code ?? signal}). ${lastError}`));
      });
      current.stdout.on('readable', () => {
        if (child !== current) { current.stdout.read(); return; }
        try {
          while (true) {
            if (!pending) {
              const header = current.stdout.read(12);
              if (!header) return;
              const width = header.readUInt32BE(0), height = header.readUInt32BE(4), length = header.readUInt32BE(8);
              if (!width || !height || width > 16384 || height > 16384 || length !== width * height * 4 || length > 128 * 1024 * 1024) {
                throw new Error('Invalid GNOME frame dimensions');
              }
              pending = { width, height, length };
            }
            const buffer = current.stdout.read(pending.length);
            if (!buffer) return;
            latest = { buffer, width: pending.width, height: pending.height, channels: 4, format: 'rgba' };
            pending = null;
            clearTimeout(timer);
            resolve();
          }
        } catch (error) { fail(error); }
      });
    });
    try { await starting; } finally { starting = null; }
  },
  stop() {
    const old = child;
    child = null;
    latest = null;
    if (old) {
      old.stdin.end();
      old.stdout.destroy();
      old.kill('SIGTERM');
      const timer = setTimeout(() => old.kill('SIGKILL'), 2000);
      timer.unref();
      old.once('exit', () => clearTimeout(timer));
    }
  },
  capture() {
    if (failure) throw failure;
    if (!latest) throw new Error('GNOME capture is not ready');
    return latest;
  },
  send(command) {
    if (!child || failure) throw failure || new Error('GNOME input is not ready');
    const line = JSON.stringify(command) + '\n';
    if (Buffer.byteLength(line) > 65536 || child.stdin.writableLength > 1024 * 1024) {
      this.stop();
      throw new Error('GNOME input queue exceeded limit; session stopped to release held keys');
    }
    child.stdin.write(line);
  },
  getScreenSize() { const { width, height } = this.capture(); return { width, height }; },
  setMouseDelay() {},
  setKeyboardDelay() {},
  moveMouse(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid pointer coordinates');
    this.send({ op: 'move', x, y });
  },
  dragMouse(x, y) { this.moveMouse(x, y); },
  mouseToggle(state, button = 'left') {
    if (!['left', 'right', 'middle'].includes(button) || !['up', 'down'].includes(state)) throw new Error('Invalid mouse button');
    this.send({ op: 'button', button, down: state === 'down' });
  },
  mouseClick(button = 'left', double = false) {
    for (let n = 0; n < (double ? 2 : 1); n++) { this.mouseToggle('down', button); this.mouseToggle('up', button); }
  },
  scrollMouse(x, y) {
    if (![x, y].every(v => Number.isFinite(v) && Math.abs(v) <= 10000)) throw new Error('Invalid scroll amount');
    this.send({ op: 'scroll', x, y });
  },
  keyToggle(key, state) {
    if (typeof key !== 'string' || key.length > 32 || !['up', 'down'].includes(state)) throw new Error('Invalid key');
    this.send({ op: 'key', key, down: state === 'down' });
  },
  keyTap(key, modifiers = []) {
    if (typeof modifiers === 'string') modifiers = [modifiers];
    if (!Array.isArray(modifiers) || modifiers.length > 8 || !modifiers.every(k => ['control', 'shift', 'alt', 'command', 'super'].includes(k))) throw new Error('Invalid modifiers');
    try {
      for (const modifier of modifiers) this.keyToggle(modifier, 'down');
      this.keyToggle(key, 'down');
      this.keyToggle(key, 'up');
    } finally {
      for (const modifier of [...modifiers].reverse()) this.keyToggle(modifier, 'up');
    }
  },
  typeString(text) {
    if (typeof text !== 'string' || text.length > 10000) throw new Error('Invalid text');
    this.send({ op: 'text', text });
  },
};

process.once('exit', () => child?.kill('SIGTERM'));
