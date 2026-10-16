import gi,subprocess,time
gi.require_version('Gtk','3.0')
from gi.repository import Gtk,GLib
window=Gtk.Window(title='9Remote Wayland — input test')
window.set_default_size(520,120)
entry=Gtk.Entry();entry.set_placeholder_text('Automated input test — closes automatically')
window.add(entry);window.show_all();entry.grab_focus();window.present()
started=time.monotonic();child=None;result=1

def tick():
 global child,result
 if child is None:
  if window.is_active():
   child=subprocess.Popen(['node','host/test/gnomeWayland.check.mjs','--live','--type-test'])
  elif time.monotonic()-started>8:
   print('FAIL: test window not focused; no input sent',flush=True);Gtk.main_quit();return False
 elif child.poll() is not None:
  result=0 if child.returncode==0 and entry.get_text()=='9remote Wayland tiếng Việt ✓' else 1
  print('GTK INPUT',repr(entry.get_text()),'PASS' if result==0 else 'FAIL',flush=True)
  Gtk.main_quit();return False
 return True
GLib.timeout_add(100,tick)
Gtk.main();window.destroy();raise SystemExit(result)
