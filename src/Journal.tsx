import React, { useCallback, useEffect, useRef } from "react";
import type { Theme } from "./theme";

/* =========================
   Props
========================= */
type Props = {
  theme: Theme;
  editorRef: React.RefObject<HTMLDivElement>;
  value: string;                       // HTML string
  onInputHTML: (html: string) => void; // upstream state setter in App.tsx
  sessionLabel: string;                // e.g., "Journal — All Sessions"
  defaultHeightPx: number;             // desired default height (match Filters panel)
};

/* =========================
   Component
========================= */
export default function JournalView({ theme: T, editorRef, value, onInputHTML, sessionLabel, defaultHeightPx }: Props) {
  const internalRef = useRef<HTMLDivElement | null>(null);

  // keep a stable pointer to the editable element
  const getEditor = () => (editorRef?.current ?? internalRef.current)!;

  /* ---------- Sync incoming value → DOM ---------- */
  useEffect(() => {
    const el = getEditor();
    if (!el) return;
    // only update DOM when incoming value differs to avoid resetting caret unexpectedly
    if (el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

  /* ---------- Utilities ---------- */
  const selectionInsideEditor = useCallback(() => {
    const el = getEditor();
    const sel = window.getSelection?.();
    if (!el || !sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    let node: Node | null = range.commonAncestorContainer;
    while (node) {
      if (node === el) return true;
      node = node.parentNode;
    }
    return false;
  }, []);

  const focusEditor = useCallback(() => {
    const el = getEditor();
    if (!el) return;
    el.focus();
    // place caret at end if nothing selected inside
    const sel = window.getSelection?.();
    if (sel && sel.rangeCount === 0) {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }, []);

  const exec = useCallback((command: string, value?: string) => {
    const el = getEditor();
    if (!el) return;
    if (!selectionInsideEditor()) focusEditor();
    // document.execCommand is deprecated but still broadly supported in contentEditable contexts
    try {
      document.execCommand(command, false, value ?? undefined);
      // after formatting, emit updated HTML
      onInputHTML(el.innerHTML);
      el.focus();
    } catch {
      // no-op
    }
  }, [onInputHTML, selectionInsideEditor, focusEditor]);

  const clearEditor = useCallback(() => {
    const el = getEditor();
    if (!el) return;
    el.innerHTML = "";
    onInputHTML("");
    el.focus();
  }, [onInputHTML]);

  /* ---------- Input handler ---------- */
  const handleInput: React.FormEventHandler<HTMLDivElement> = (e) => {
    onInputHTML((e.target as HTMLDivElement).innerHTML);
  };

  /* ---------- Styles ---------- */
  const fixedHeight = Math.max(320, Math.floor(defaultHeightPx));
  const editorHeight = Math.max(200, fixedHeight - 90);
  const sectionStyle: React.CSSProperties = {
    background: T.panel,
    color: T.text,
    borderColor: T.border,
    height: fixedHeight, // lock height to avoid feedback loop with Filters measurement
    overflow: "hidden",
  };

  const headerStyle: React.CSSProperties = {
    background: T.panelAlt,
    borderBottom: `1px solid ${T.border}`,
    color: T.text,
  };

  const buttonCommon: React.CSSProperties = {
    background: T.panel,
    color: T.text,
    borderColor: T.border,
  };

  return (
    <section className="rounded-xl border shadow-sm" style={sectionStyle}>
      <header className="px-4 py-2 rounded-t-xl" style={headerStyle}>
        <div className="text-sm font-medium">{sessionLabel}</div>
      </header>

      {/* Toolbar */}
      <div className="px-3 py-2 border-b flex items-center gap-1" style={{ borderColor: T.border }}>
        <ToolbarButton label="H1" title="Heading 1" onClick={() => exec("formatBlock", "H1")} T={T} style={buttonCommon} />
        <ToolbarButton label="P" title="Paragraph" onClick={() => exec("formatBlock", "P")} T={T} style={buttonCommon} />
        <ToolbarDivider T={T} />
        <ToolbarButton label="B" title="Bold" onClick={() => exec("bold")} T={T} style={buttonCommon} />
        <ToolbarButton label="I" title="Italic" onClick={() => exec("italic")} T={T} style={buttonCommon} />
        <ToolbarDivider T={T} />
        <ToolbarButton label="• List" title="Bulleted list" onClick={() => exec("insertUnorderedList")} T={T} style={buttonCommon} />
        <ToolbarButton label="1. List" title="Numbered list" onClick={() => exec("insertOrderedList")} T={T} style={buttonCommon} />
        <ToolbarDivider T={T} />
        <ToolbarButton label="Clear" title="Clear all" onClick={clearEditor} T={T} style={buttonCommon} />
      </div>

      {/* Editor */}
      <div className="p-3">
        <div
          ref={editorRef ?? internalRef}
          className="prose max-w-none outline-none"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          style={{
            height: editorHeight, // fixed editor viewport; scroll internally
            padding: 8,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            background: T.panel,
            color: T.text,
            overflowY: "auto",
          }}
        />
        {/* Hint */}
        <div className="text-xs mt-2" style={{ color: T.textDim }}>
          Tip: Use the toolbar or keyboard shortcuts (Ctrl/Cmd+B, Ctrl/Cmd+I). Lists and headings apply to the current selection.
        </div>
      </div>
    </section>
  );
}

/* =========================
   Toolbar bits
========================= */
function ToolbarButton({ label, title, onClick, T, style }: { label: string; title: string; onClick: () => void; T: Theme; style?: React.CSSProperties; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="px-2 py-1 rounded-md text-xs border"
      style={style}
      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = T.panelAlt)}
      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = (style && style.background) ? String(style.background) : T.panel)}
      onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 2px ${T.brandMuted}`)}
      onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      {label}
    </button>
  );
}

function ToolbarDivider({ T }: { T: Theme }) {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 20,
        background: T.border,
        display: "inline-block",
        margin: "0 4px",
      }}
    />
  );
}
