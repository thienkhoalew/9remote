"use client";

import MermaidViewer from "./MermaidViewer.js";
import MarkdownViewer from "./MarkdownViewer.js";

// Unified renderer for text files with a rendered preview (markdown, mermaid).
// HTML has no branch here: its rendered view is the remote browser pane.
export default function TextPreview({ kind, content, reloadKey = 0 }) {
  if (kind === "mermaid") {
    return <MermaidViewer content={content} reloadKey={reloadKey} />;
  }
  if (kind === "markdown") {
    return <MarkdownViewer content={content} />;
  }
  return null;
}
