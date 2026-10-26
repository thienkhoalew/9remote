# Install 9Remote GNOME Wayland fork

This release supports Ubuntu 26.04, GNOME Wayland, and x86_64. It controls the
current unlocked desktop. Each person gets their own key and device approvals.

Install Node.js 22 or newer and these Ubuntu packages:

```sh
sudo apt install python3-gi gir1.2-gstreamer-1.0 gstreamer1.0-pipewire gstreamer1.0-plugins-base
```

Download `9remote-wayland-3.0.43-linux-x64.tar.gz` from the release, then:

```sh
tar -xzf 9remote-wayland-3.0.43-linux-x64.tar.gz
cd 9remote-wayland-3.0.43-linux-x64
./install.sh
~/.local/bin/9remote --version
~/.local/bin/9remote
```

Expected version: `3.0.43-wayland.1`. If `~/.local/bin` is on `PATH`, use
`9remote` directly. The installer saves a prior fork runtime beside the new one
with a timestamp. User pairing data in `~/.9remote` is untouched.

To connect from another network, open the host's pairing link in the 9Remote
website and approve the new device on the host. The web client is served by
9remote.cc; no separate forked web deployment is needed.

GNOME Wayland capture uses the primary monitor at up to 15 fps. A locked
desktop cannot be unlocked through this backend. See the
[Wayland backend notes](https://github.com/thienkhoalew/9remote/blob/wayland-gnome/WAYLAND.md)
for technical details and checks.
