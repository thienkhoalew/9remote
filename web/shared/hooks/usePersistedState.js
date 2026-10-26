"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// Same-tab instances of one key: localStorage only syncs across tabs, so peers
// registered here relay writes to each other.
const peersByKey = new Map();

// Generic useState wrapper that persists value to localStorage under `key`.
// Safely handles SSR (no window) and JSON parse errors.
export function usePersistedState(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  // The persist effect runs its FIRST pass on the same commit as the hydrate read —
  // before that read has re-rendered — so writing then would clobber the stored value
  // with initialValue (lost for good if the component unmounts first). Skip one pass
  // per key instead: the first write only happens once a real change follows hydration.
  const skipNextWrite = useRef(true);
  const keyRef = useRef(key);

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    // A reused instance switching keys restarts the skip cycle for the same reason
    if (keyRef.current !== key) { keyRef.current = key; skipNextWrite.current = true; }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw));
    } catch (err) {
      console.warn(`usePersistedState: failed to read "${key}"`, err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Register this instance's setter so same-key peers can relay writes to it
  useEffect(() => {
    if (typeof window === "undefined") return;
    let peers = peersByKey.get(key);
    if (!peers) peersByKey.set(key, (peers = new Set()));
    peers.add(setValue);
    return () => {
      peers.delete(setValue);
      if (!peers.size) peersByKey.delete(key);
    };
  }, [key]);

  // Persist on change
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (skipNextWrite.current) { skipNextWrite.current = false; return; }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn(`usePersistedState: failed to write "${key}"`, err);
    }
    // Relay to same-key instances in this tab — localStorage alone is cross-tab only
    for (const peer of peersByKey.get(key) || []) {
      if (peer !== setValue) peer(value);
    }
  }, [key, value]);

  const reset = useCallback(() => setValue(initialValue), [initialValue]);

  return [value, setValue, reset];
}
