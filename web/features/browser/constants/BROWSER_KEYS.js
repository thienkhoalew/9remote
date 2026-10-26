// On-screen key pool for the browser pane's control rows. Mirrors REMOTE_KEY_POOL's
// shape (useCustomKeys/KeyCustomizeModal read it) but drops OS keys (Win, desktop
// switch, Ctrl+Alt+Del...) Chrome tabs never want, and keeps page-level combos —
// the host maps copy/cut/paste/selectAll/undo/redo to Chrome editing commands.
export const BROWSER_KEY_POOL = [
  // Modifiers (sticky)
  { id: "ctrl", label: "Ctrl", modifier: "ctrl", type: "modifier" },
  { id: "alt", label: "Alt", modifier: "alt", type: "modifier" },
  { id: "shift", label: "Shift", modifier: "shift", type: "modifier" },
  { id: "cmd", label: "⌘", modifier: "cmd", type: "modifier" },
  // Core
  { id: "esc", label: "Esc", key: "escape", type: "key" },
  { id: "tab", label: "Tab", key: "tab", type: "key" },
  { id: "enter", label: "↵", key: "enter", type: "key", primary: true },
  { id: "backspace", label: "⌫", key: "backspace", type: "key" },
  // Page editing combos — osAdaptive keeps ⌘ on a macOS host.
  { id: "undo", label: "Undo", key: "z", modifiers: ["control"], type: "combo", osAdaptive: true },
  { id: "redo", label: "Redo", key: "z", modifiers: ["control", "shift"], type: "combo", osAdaptive: true },
  { id: "copy", label: "Copy", key: "c", modifiers: ["control"], type: "combo", osAdaptive: true },
  { id: "cut", label: "Cut", key: "x", modifiers: ["control"], type: "combo", osAdaptive: true },
  { id: "paste", label: "Paste", key: "v", modifiers: ["control"], type: "combo", osAdaptive: true },
  { id: "selectAll", label: "All", key: "a", modifiers: ["control"], type: "combo", osAdaptive: true },
  // Navigation keys the page itself handles
  { id: "up", label: "↑", key: "up", type: "arrow" },
  { id: "down", label: "↓", key: "down", type: "arrow" },
  { id: "left", label: "←", key: "left", type: "arrow" },
  { id: "right", label: "→", key: "right", type: "arrow" },
  { id: "home", label: "Home", key: "home", type: "key" },
  { id: "end", label: "End", key: "end", type: "key" },
  { id: "pgup", label: "PgUp", key: "pageup", type: "key" },
  { id: "pgdn", label: "PgDown", key: "pagedown", type: "key" },
  { id: "del", label: "Del", key: "delete", type: "key" }
];

export const BROWSER_DEFAULT_BOTTOM = [
  "esc", "undo", "up", "down", "tab", "ctrl", "alt", "shift", "cmd", "backspace"
];

export const BROWSER_PINNED_KEY_ID = "enter";

export const BROWSER_DEFAULT_EXTRA = [
  ["left", "right", "home", "end", "pgup", "pgdn", "del"],
  ["copy", "cut", "paste", "selectAll", "redo"]
];
