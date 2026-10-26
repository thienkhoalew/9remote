"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseRepoDiffPath, isImageFile, GIT_AUTO_REFRESH_EVENTS } from "../constants/fileExplorer.js";
import { useI18n } from "@/shared/i18n";
import DiffBody from "./DiffBody.js";
import ImageDiffView from "./ImageDiffView.js";

// One file's git diff, fetched then handed to DiffBody (or ImageDiffView for images).
export default function DiffView({ diffPath, workspace, fileBus, compact = false }) {
  const { t } = useI18n();
  const { status, repoPath, filePath } = parseRepoDiffPath(diffPath);
  const effectiveWorkspace = repoPath || workspace;
  const isImage = isImageFile(filePath);

  const [loading, setLoading] = useState(!isImage);
  const [diff, setDiff] = useState("");
  const [error, setError] = useState("");
  // Only the latest request may write state, so a slow stale reply can't win.
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError("");
    const r = await fileBus.gitDiff?.(effectiveWorkspace, filePath, status);
    if (reqId !== reqIdRef.current) return;
    if (r?.success) setDiff(r.diff || "");
    else setError(r?.error || "");
    setLoading(false);
  }, [fileBus, effectiveWorkspace, filePath, status]);

  // Deferred a tick so the loading flag is not set synchronously inside the effect.
  useEffect(() => {
    if (isImage) return;
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load, isImage]);

  // An already-open diff tab must not keep showing a stale diff: refetch on the same
  // events the SCM list refreshes on.
  useEffect(() => {
    if (isImage) return;
    const handler = () => load();
    GIT_AUTO_REFRESH_EVENTS.forEach((ev) => window.addEventListener(ev, handler));
    return () => GIT_AUTO_REFRESH_EVENTS.forEach((ev) => window.removeEventListener(ev, handler));
  }, [load, isImage]);

  if (isImage) {
    return (
      <ImageDiffView
        filePath={filePath}
        status={status}
        workspace={effectiveWorkspace}
        fileBus={fileBus}
        compact={compact}
      />
    );
  }

  return (
    <div className={`h-full overflow-auto ${compact ? "p-0" : "p-2 sm:p-3"}`}>
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded px-4 py-2 text-red-400 text-sm mb-3">{error}</div>
      )}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-text-muted text-sm">{t("common.loading")}</div>
      ) : diff ? (
        <DiffBody diff={diff} compact={compact} />
      ) : (
        <div className="flex items-center justify-center h-32 text-text-muted text-sm">{t("git.noChanges")}</div>
      )}
    </div>
  );
}
