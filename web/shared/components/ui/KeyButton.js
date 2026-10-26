"use client";

// Shared key button for on-screen control rows (Remote Desktop / browser pane).
// onMouseDown.preventDefault() — prevents focus-steal so native keyboard stays on.
export default function Btn({ active, primary, pinned, children, className = "", onClick, ...rest }) {
  const base = "shrink-0 px-1 h-8 rounded-brand text-xs font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed min-w-[34px] flex items-center justify-center";
  const normal = "bg-surface-2 hover:bg-surface-3 text-text transition-all duration-150 ease-out active:scale-[0.94]";
  const activeCls = "bg-brand-500 text-white shadow-sm transition-all duration-150 ease-out active:scale-[0.94]";
  const primaryCls = "bg-green-600 hover:bg-green-700 text-white shadow-sm transition-all duration-150 ease-out active:scale-[0.94]";
  const pinnedCls = "bg-brand-500/15 hover:bg-brand-500/25 text-brand-400 transition-all duration-150 ease-out active:scale-[0.94]";
  const variant = active ? activeCls : pinned ? pinnedCls : primary ? primaryCls : normal;
  return (
    <button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`${base} ${variant} ${className}`}
      style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
      {...rest}
    >
      {children}
    </button>
  );
}
