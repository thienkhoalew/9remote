// Remote-surface → CDP input tuning for the browser pane.
export const BROWSER_INPUT = {
  // Trailing-edge batch window for moves/wheel; presses, releases and keys flush at once.
  flushMs: 30,
  // Wheel path multiplier (replaces the desktop's 2.5): wheel and touch scroll then both
  // reach emitScroll as ~1.5 units per px, so wheelScale 0.67 lands 1 page px per input px.
  wheelMultiplier: 1,
  wheelScale: 0.67,
  maxClickCount: 3,
  secondaryButton: "right"
};
