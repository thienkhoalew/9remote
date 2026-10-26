"use client";

// HTML preview renders in the remote browser pane only: the host mints a preview
// session served from a loopback-only origin (its own port, apart from the host
// UI), Chrome on the host loads it, and the tiles stream back over the normal
// transport. Surfaces only dispatch the event; workspace/layout.js owns the bus
// and the view switch.
export const BROWSER_OPEN_URL_EVENT = "browser:openUrl";

// Mint a preview session for filePath and hand the entry URL to the browser
// pane. Resolves { ok: true } or { ok: false, error } — the caller surfaces it.
export async function openHtmlPreviewInBrowser(fileBus, filePath) {
  const res = await fileBus.previewStart(filePath);
  if (!res?.success || !res?.localUrl) {
    return { ok: false, error: res?.error || null };
  }
  window.dispatchEvent(new CustomEvent(BROWSER_OPEN_URL_EVENT, { detail: { url: res.localUrl } }));
  return { ok: true };
}
