#!/usr/bin/python3
"""Private stdio bridge to Mutter; no listening socket or root input access."""
import json
import math
import os
import signal
import struct
import sys
import time

import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gio, GLib, GLibUnix, Gst

RD = 'org.gnome.Mutter.RemoteDesktop'
SC = 'org.gnome.Mutter.ScreenCast'
KEYS = {'enter': 0xff0d, 'tab': 0xff09, 'escape': 0xff1b, 'backspace': 0xff08,
        'delete': 0xffff, 'insert': 0xff63, 'home': 0xff50, 'end': 0xff57,
        'pageup': 0xff55, 'pagedown': 0xff56, 'up': 0xff52, 'down': 0xff54,
        'left': 0xff51, 'right': 0xff53, 'space': 0x20,
        'control': 0xffe3, 'shift': 0xffe1, 'alt': 0xffe9,
        'command': 0xffeb, 'super': 0xffeb, 'capslock': 0xffe5}
KEYS.update({f'f{i}': 0xffbd + i for i in range(1, 25)})
BUTTONS = {'left': 272, 'right': 273, 'middle': 274}


def keysym(key):
    if key in KEYS:
        return KEYS[key]
    if len(key) == 1:
        code = ord(key)
        return code if code <= 0xff else 0x1000000 | code
    raise ValueError(f'Unsupported key: {key}')


class Bridge:
    def __init__(self):
        Gst.init(None)
        self.bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self.loop = GLib.MainLoop()
        self.pipeline = None
        self.rd = None
        self.started = False
        self.held_keys = set()
        self.held_buttons = set()
        self.width = self.height = 0
        self.last_frame = 0
        self.input_buffer = b''
        self.commands = []
        self.pasting = False
        self.clipboard_text = b''

    def call(self, service, path, interface, method, signature=None, args=()):
        value = GLib.Variant(signature, args) if signature else None
        return self.bus.call_sync(service, path, interface, method, value,
                                  None, Gio.DBusCallFlags.NONE, 5000, None).unpack()

    def remote(self, method, signature=None, args=()):
        return self.call(RD, self.rd, RD + '.Session', method, signature, args)

    def start(self):
        self.rd = self.call(RD, '/org/gnome/Mutter/RemoteDesktop', RD, 'CreateSession')[0]
        session_id = self.call(RD, self.rd, 'org.freedesktop.DBus.Properties',
                               'Get', '(ss)', (RD + '.Session', 'SessionId'))[0]
        sc = self.call(SC, '/org/gnome/Mutter/ScreenCast', SC, 'CreateSession',
                       '(a{sv})', ({'remote-desktop-session-id': GLib.Variant('s', session_id)},))[0]
        self.stream = self.call(SC, sc, SC + '.Session', 'RecordMonitor', '(sa{sv})',
                                ('', {'cursor-mode': GLib.Variant('u', 1)}))[0]
        self.bus.signal_subscribe(SC, SC + '.Stream', 'PipeWireStreamAdded', self.stream,
                                  None, Gio.DBusSignalFlags.NONE, self.pipewire_ready)
        self.bus.signal_subscribe(RD, RD + '.Session', 'Closed', self.rd,
                                  None, Gio.DBusSignalFlags.NONE, lambda *args: self.loop.quit())
        self.remote('Start')
        self.started = True
        self.remote('EnableClipboard', '(a{sv})', ({},))
        self.bus.signal_subscribe(RD, RD + '.Session', 'SelectionTransfer', self.rd,
                                  None, Gio.DBusSignalFlags.NONE, self.clipboard_transfer)
        GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_IN | GLib.IO_HUP, self.input_ready)
        GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, self.stop_loop)
        GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, self.stop_loop)
        self.loop.run()

    def stop_loop(self):
        self.loop.quit()
        return False

    def pipewire_ready(self, connection, sender, path, interface, signal_name, parameters):
        node = parameters.unpack()[0]
        self.pipeline = Gst.parse_launch(
            f'pipewiresrc path={node} do-timestamp=true ! videoconvert ! '
            'video/x-raw,format=RGBA ! appsink name=frames emit-signals=true max-buffers=1 drop=true sync=false async=false')
        self.pipeline.get_by_name('frames').connect('new-sample', self.frame)
        bus = self.pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect('message::error', self.pipeline_error)
        self.pipeline.set_state(Gst.State.PLAYING)

    def pipeline_error(self, bus, message):
        error, debug = message.parse_error()
        print(f'PipeWire: {error}', file=sys.stderr, flush=True)
        self.loop.quit()

    def frame(self, sink):
        sample = sink.emit('pull-sample')
        now = time.monotonic()
        if now - self.last_frame < 1 / 15:
            return Gst.FlowReturn.OK
        caps = sample.get_caps().get_structure(0)
        width, height = caps.get_value('width'), caps.get_value('height')
        buffer = sample.get_buffer()
        data = buffer.extract_dup(0, buffer.get_size())
        if len(data) != width * height * 4:
            print('Unexpected RGBA stride', file=sys.stderr, flush=True)
            self.loop.quit()
            return Gst.FlowReturn.ERROR
        self.width, self.height = width, height
        try:
            sys.stdout.buffer.write(struct.pack('!III', width, height, len(data)))
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()
        except BrokenPipeError:
            os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
            self.loop.quit()
            return Gst.FlowReturn.EOS
        self.last_frame = now
        return Gst.FlowReturn.OK

    def key(self, symbol, down):
        self.remote('NotifyKeyboardKeysym', '(ub)', (symbol, down))
        if down:
            self.held_keys.add(symbol)
        else:
            self.held_keys.discard(symbol)

    def button(self, button, down):
        self.remote('NotifyPointerButton', '(ib)', (button, down))
        if down:
            self.held_buttons.add(button)
        else:
            self.held_buttons.discard(button)

    def release(self):
        for symbol in list(self.held_keys):
            self.key(symbol, False)
        for button in list(self.held_buttons):
            self.button(button, False)

    def input_ready(self, fd, condition):
        chunk = os.read(fd, 65536)
        if not chunk:
            return self.stop_loop()
        self.input_buffer += chunk
        if len(self.input_buffer) > 131072:
            print('Wayland input buffer exceeded limit', file=sys.stderr, flush=True)
            return self.stop_loop()
        while b'\n' in self.input_buffer:
            line, self.input_buffer = self.input_buffer.split(b'\n', 1)
            try:
                if len(line) > 65536:
                    raise ValueError('Input command too large')
                if len(self.commands) >= 4096:
                    print('Too many queued input commands; closing session', file=sys.stderr, flush=True)
                    return self.stop_loop()
                self.commands.append(json.loads(line))
            except Exception as error:
                print(f'Wayland input: {error}', file=sys.stderr, flush=True)
        self.drain_commands()
        return True

    def drain_commands(self):
        while self.commands and not self.pasting:
            try:
                self.command(self.commands.pop(0))
            except Exception as error:
                print(f'Wayland input: {error}', file=sys.stderr, flush=True)

    def clipboard_transfer(self, connection, sender, path, interface, signal_name, parameters):
        mime, serial = parameters.unpack()
        try:
            result, fds = self.bus.call_with_unix_fd_list_sync(
                RD, self.rd, RD + '.Session', 'SelectionWrite', GLib.Variant('(u)', (serial,)),
                None, Gio.DBusCallFlags.NONE, 5000, None, None)
            fd = fds.get(result.unpack()[0])
            try:
                data = memoryview(self.clipboard_text)
                while data:
                    data = data[os.write(fd, data):]
            finally:
                os.close(fd)
            self.remote('SelectionWriteDone', '(ub)', (serial, True))
        except Exception as error:
            print(f'Wayland clipboard: {error}', file=sys.stderr, flush=True)

    def paste_text(self, text):
        self.clipboard_text = text.encode('utf-8')
        self.remote('SetSelection', '(a{sv})',
                    ({'mime-types': GLib.Variant('as', ['text/plain;charset=utf-8', 'text/plain'])},))
        self.pasting = True
        def paste():
            try:
                self.key(keysym('control'), True)
                self.key(ord('v'), True)
                self.key(ord('v'), False)
            finally:
                self.key(keysym('control'), False)
            GLib.timeout_add(300, complete)
            return False
        def complete():
            self.pasting = False
            self.drain_commands()
            return False
        GLib.timeout_add(30, paste)

    def command(self, data):
        op = data['op']
        if op == 'move':
            x, y = float(data['x']), float(data['y'])
            if not math.isfinite(x) or not math.isfinite(y):
                raise ValueError('Invalid pointer coordinates')
            self.remote('NotifyPointerMotionAbsolute', '(sdd)',
                        (self.stream, max(0, min(self.width - 1, x)), max(0, min(self.height - 1, y))))
        elif op == 'button':
            self.button(BUTTONS[data['button']], data['down'] is True)
        elif op == 'scroll':
            x, y = float(data['x']), float(data['y'])
            if not all(math.isfinite(v) and abs(v) <= 10000 for v in (x, y)):
                raise ValueError('Invalid scroll amount')
            self.remote('NotifyPointerAxis', '(ddu)', (x, -y, 0))
            self.remote('NotifyPointerAxis', '(ddu)', (0., 0., 1))
        elif op == 'key':
            self.key(keysym(data['key']), data['down'] is True)
        elif op == 'text':
            text = data['text']
            if not isinstance(text, str) or len(text) > 10000:
                raise ValueError('Invalid text')
            if any(ord(char) > 127 for char in text):
                self.paste_text(text)
            else:
                for char in text:
                    symbol = keysym({'\n': 'enter', '\r': 'enter', '\t': 'tab'}.get(char, char))
                    self.key(symbol, True)
                    self.key(symbol, False)
        elif op == 'release':
            self.release()
        else:
            raise ValueError('Unknown input command')

    def close(self):
        if self.pipeline:
            self.pipeline.set_state(Gst.State.NULL)
        if self.started:
            try:
                self.release()
                self.remote('Stop')
            except GLib.Error:
                pass


if __name__ == '__main__':
    if '--check' in sys.argv:
        Gst.init(None)
        for name in ('pipewiresrc', 'videoconvert', 'appsink'):
            if not Gst.ElementFactory.find(name):
                raise SystemExit(f'Missing GStreamer plugin: {name}')
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        for name in (RD, SC):
            result = bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
                                  'org.freedesktop.DBus', 'NameHasOwner',
                                  GLib.Variant('(s)', (name,)), None, 0, 5000, None)
            if not result.unpack()[0]:
                raise SystemExit(f'GNOME service not available: {name}')
        raise SystemExit(0)
    bridge = Bridge()
    try:
        bridge.start()
    except Exception as error:
        print(f'GNOME Wayland: {error}', file=sys.stderr, flush=True)
        sys.exit(1)
    finally:
        bridge.close()
