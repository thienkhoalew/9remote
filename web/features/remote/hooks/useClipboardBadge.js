"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { REMOTE_CONFIG } from "@/features/remote/constants/REMOTE_CONFIG";

// Host clipboard text + a "new" flag that auto-clears (drives the toolbar bell).
// push() is stable and dedupes by hash, so bus listeners can hold it across renders.
export function useClipboardBadge() {
  const [text, setText] = useState("");
  const [isNew, setNew] = useState(false);
  const lastHashRef = useRef(null);

  const push = useCallback((next, hash) => {
    if (hash && hash === lastHashRef.current) return;
    lastHashRef.current = hash || null;
    setText(next || "");
    setNew(true);
  }, []);

  useEffect(() => {
    if (!isNew) return;
    const id = setTimeout(() => setNew(false), REMOTE_CONFIG.clipboardBadgeTimeout);
    return () => clearTimeout(id);
  }, [isNew, text]);

  return { text, isNew, setNew, push };
}
