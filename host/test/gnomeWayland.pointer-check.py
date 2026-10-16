import gi,subprocess,time
gi.require_version('Gtk','3.0')
from gi.repository import Gtk,GLib
window=Gtk.Window(title='9Remote Wayland — pointer test')
button=Gtk.Button(label='Checking remote pointer. This test closes automatically.')
window.add(button);window.maximize();window.show_all();window.present()
clicked=0;child=None;started=time.monotonic();result=1

def click(*args):
 global clicked
 clicked+=1
button.connect('clicked',click)
def tick():
 global child,result
 if child is None:
  if window.is_active() and time.monotonic()-started>1:
   code="""import {gnomeWayland as b} from './host/features/remote/adapters/gnomeWayland.js';
try {await b.start();const {width,height}=b.getScreenSize();b.moveMouse(width/2,height/2);b.mouseClick();await new Promise(r=>setTimeout(r,700));}finally{b.stop();}"""
   child=subprocess.Popen(['node','--input-type=module','-e',code])
  elif time.monotonic()-started>8:
   print('FAIL: test window not active; no click sent');Gtk.main_quit();return False
 elif child.poll() is not None:
  result=0 if clicked==1 and child.returncode==0 else 1
  print('POINTER clicks',clicked,'PASS' if result==0 else 'FAIL',flush=True)
  Gtk.main_quit();return False
 return True
GLib.timeout_add(100,tick);Gtk.main();window.destroy();raise SystemExit(result)
