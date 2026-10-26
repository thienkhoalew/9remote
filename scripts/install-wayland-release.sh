#!/bin/sh
set -eu

cd "$(dirname "$0")"
if [ "$(uname -s)" != Linux ] || [ "$(uname -m)" != x86_64 ]; then
  echo 'This package supports Linux x86_64 only.' >&2
  exit 1
fi
command -v node >/dev/null 2>&1 || { echo 'Node.js 22+ is required.' >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' || {
  echo 'Node.js 22+ is required.' >&2
  exit 1
}
test -f runtime/cli.cjs && test -f runtime/gnome-wayland.py || {
  echo 'Runtime files missing from release archive.' >&2
  exit 1
}

base="$HOME/.local"
dest="$base/share/9remote-wayland"
backup="$dest.previous.$(date +%Y%m%d%H%M%S)"
mkdir -p "$base/share" "$base/bin"
if [ -e "$backup" ]; then echo "Backup path exists: $backup" >&2; exit 1; fi
if [ -e "$dest" ]; then mv "$dest" "$backup"; fi
if ! cp -a runtime "$dest"; then
  rm -rf "$dest"
  if [ -e "$backup" ]; then mv "$backup" "$dest"; fi
  exit 1
fi

launcher="$base/bin/9remote"
if [ -e "$launcher" ] && ! grep -q 'share/9remote-wayland/cli.cjs' "$launcher"; then
  echo "Existing launcher preserved at $launcher; run $dest/cli.cjs with node." >&2
else
  cat > "$launcher" <<'SH'
#!/bin/sh
exec node "$HOME/.local/share/9remote-wayland/cli.cjs" "$@"
SH
  chmod 755 "$launcher"
fi

node "$dest/cli.cjs" --version
echo "Installed. Run: $base/bin/9remote"
if [ -e "$backup" ]; then echo "Previous version: $backup"; fi
