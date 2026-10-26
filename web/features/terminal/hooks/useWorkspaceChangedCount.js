"use client";

import { useEffect, useState } from "react";
import { WORKSPACE_GIT_POLL_MS } from "../constants/terminalConfig";
import { pollWhileVisible } from "@/shared/utils/visibilityPoll";
import { GIT_AUTO_REFRESH_EVENTS } from "@/features/fileExplorer/constants/fileExplorer.js";

// One changed-file count per workspace root, covering the root repo and every repo under
// it. Ref-counted and shared, so the terminal badge and the git panel read the same
// number from a single poll instead of counting separately and disagreeing.
const entries = new Map(); // rootPath → { state, stop, refs, subs, fileBus, refreshNow }

const EMPTY = { count: 0, perRepo: {} };

const samePerRepo = (a, b) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

function fetchOnce(entry, rootPath, force) {
  entry.fileBus?.gitWorkspaceChangedCount?.(rootPath, undefined, force).then((res) => {
    if (!res?.success) return;
    const count = res.count || 0;
    const perRepo = res.perRepo || {};
    // Unchanged numbers must not re-render every subscribed pane.
    if (entry.state.count === count && samePerRepo(entry.state.perRepo, perRepo)) return;
    entry.state = { count, perRepo };
    entry.subs.forEach((fn) => fn(entry.state));
  });
}

function acquire(rootPath, fileBus) {
  let entry = entries.get(rootPath);
  if (!entry) {
    entry = { state: EMPTY, stop: null, refs: 0, subs: new Set(), fileBus, refreshNow: null };
    entries.set(rootPath, entry);
    // Save/commit/refresh events mean the count may have moved — refetch now instead of
    // waiting for the poll tick. One listener per root, not per subscriber.
    entry.refreshNow = () => fetchOnce(entry, rootPath);
    GIT_AUTO_REFRESH_EVENTS.forEach((ev) => window.addEventListener(ev, entry.refreshNow));
    fetchOnce(entry, rootPath);
    entry.stop = pollWhileVisible(() => fetchOnce(entry, rootPath), WORKSPACE_GIT_POLL_MS);
  }
  entry.refs++;
  return entry;
}

function release(rootPath) {
  const entry = entries.get(rootPath);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  entry.stop?.();
  GIT_AUTO_REFRESH_EVENTS.forEach((ev) => window.removeEventListener(ev, entry.refreshNow));
  entries.delete(rootPath);
}

// Force a refresh for a workspace (after commit / discard / refresh button) without
// waiting for the poll. `force` bypasses the agent-side TTL cache so the number is live.
export function refreshWorkspaceChangedCount(rootPath) {
  const entry = entries.get(rootPath);
  if (entry) fetchOnce(entry, rootPath, true);
}

export function useWorkspaceChangedCount(rootPath, fileBus, { enabled = true } = {}) {
  const [state, setState] = useState(EMPTY);

  useEffect(() => {
    if (!rootPath || !fileBus || !enabled) return;
    const entry = acquire(rootPath, fileBus);
    entry.subs.add(setState);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- latch shared entry state on subscribe; identity-guarded
    setState((prev) => (prev === entry.state ? prev : entry.state));
    return () => {
      entry.subs.delete(setState);
      release(rootPath);
    };
  }, [rootPath, fileBus, enabled]);

  return state;
}
