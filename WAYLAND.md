# GNOME Wayland backend

This fork keeps the 9Remote web client and its existing pairing/device approval.
On Linux with `WAYLAND_DISPLAY` and GNOME in `XDG_CURRENT_DESKTOP`, desktop capture
and input use a private Python subprocess connected to Mutter over the session bus.
There is no input daemon, root permission, extra network listener, or Xorg session.
The host starts capture after an authenticated device connects. It retains that
GNOME session across browser reconnects until the host exits or GNOME closes it.
Closing the helper releases held keys/buttons.

## Requirements

Ubuntu 26.04 GNOME: `/usr/bin/python3`, PyGObject, Gst introspection,
GStreamer `pipewiresrc`, `videoconvert`, and `appsink`. These were already installed
on the target machine. On other installs the usual packages are `python3-gi`,
`gir1.2-gstreamer-1.0`, `gstreamer1.0-pipewire`, `gstreamer1.0-plugins-base`.

## Checks

From the repository root:

```sh
node host/test/gnomeWayland.check.mjs
node host/test/gnomeWayland.check.mjs --live
python3 host/test/gnomeWayland.input-check.py
python3 host/test/gnomeWayland.pointer-check.py
```

The first check validates command mapping/rejection. The second captures real
frames and restarts the helper. The third opens a disposable GTK entry and sends
Ctrl+A plus Unicode text only once that test window has focus. Keep the test
window focused while that explicit input check runs.

The normal `host:build` includes `gnome-wayland.py` beside `server.cjs`.
Use the standard host CLI/web pairing flow; no web client changes are required.

## Current limits

- GNOME/Mutter only, primary monitor, maximum 15 captured frames/sec.
- Shares the existing unlocked GNOME session; not a login-screen/unlock service.
- Pointer is embedded in captured frames. Monitor changes while connected require reconnecting.
- Unicode text is pasted through the GNOME clipboard API (it replaces clipboard text).
- Live capture, restart, GTK click, and Vietnamese text input have been verified.
  Mobile web pointer, drag, and scroll behavior still need device acceptance testing.

## This machine's CLI install

`9remote` resolves to `~/.local/bin/9remote`, launching the isolated fork runtime
in `~/.local/share/9remote-wayland/`. `9remote --version` prints
`3.0.40-wayland.1`. This identifies a fork of the current published GitHub source,
not npm's independently versioned official 3.0.43 package. Official registry update
checks are disabled for `-wayland.` builds so an update cannot replace the patch.

The unchanged web client at `9remote.cc` can pair with this host using its connect
link/QR. Host registration, Cloudflare tunnel, device approval, and WebRTC signaling
remain upstream mechanisms; other networks do not require a separately hosted web
fork. Cross-network operation still needs a real external-device acceptance test.
