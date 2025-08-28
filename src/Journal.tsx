import React, { useEffect, useRef } from "react";
import type { Theme } from "./theme";

type Props = {
  theme: Theme;
  editorRef: React.RefObject<HTMLDivElement>;
  value: string;                       // HTML
  onInputHTML: (html: string) => void;
  sessionLabel: string;                // e.g., "Journal — All Sessions"
  defaultHeightPx: number;             // from Filters panel height for a good starting size
};

export default function JournalView({
  theme: T,
  editorRef,
  value,
  onInputHTML,
  sessionLabel,
  defaultHeightPx,
}: Props) {
  const localRef = useRef<HTMLDivElement | null>(null);

  // keep internal ref synced with external
  useEffect(() => {
    if (editorRef && "current" in editorRef) {
      (editorRef as any).current = localRef.current;
    }
  }, [editorRef]);

  // keep HTML in sync when session changes
  useEffect(() => {
    if (localRef.current && localRef.current.innerHTML !== value) {
      localRef.current.innerHTML = value || "";
    }
  }, [value]);

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    if (localRef.current) {
      onInputHTML(localRef.current.innerHTML);
    }
  };

  const clearContent = () => {
    if (window.confirm("Are you sure you want to clear the journal for this session? This cannot be undone.")) {
      if (localRef.current) {
        localRef.current.innerHTML = "";
        onInputHTML("");
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // paste as plain text -> minimal formatting
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  return (
    <section
      className="rounded-xl border shadow-sm"
      style={{ background: T.panel, color: T.text, borderColor: T.border }}
    >
      <header
        className="px-4 py-2 flex items-center justify-between gap-3 rounded-t-xl"
        style={{ background: T.mode === 'light' ? '#dbe8e1' : T.panelAlt, borderBottom: `1px solid ${T.border}`, color: T.text }}
      >
        <div className="text-sm font-medium">{sessionLabel}</div>
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton label="B" title="Bold" onClick={() => exec("bold")} T={T} />
          <ToolbarButton label="I" title="Italic" onClick={() => exec("italic")} T={T} />
          <ToolbarButton label="U" title="Underline" onClick={() => exec("underline")} T={T} />
          <ToolbarDivider T={T} />
          <ToolbarButton label="• List" title="Bulleted list" onClick={() => exec("insertUnorderedList")} T={T} />
          <ToolbarButton label="1. List" title="Numbered list" onClick={() => exec("insertOrderedList")} T={T} />
          <ToolbarDivider T={T} />
          <ToolbarButton label="H1" title="Heading" onClick={() => exec("formatBlock", "<h3>")} T={T} />
          <ToolbarButton label="P" title="Paragraph" onClick={() => exec("formatBlock", "<p>")} T={T} />
          <ToolbarDivider T={T} />
          <ToolbarButton
            label="Clear"
            title="Clear all content"
            onClick={clearContent}
            T={T}
          />
        </div>
      </header>

      <div className="p-4">
        <div
          ref={localRef}
          role="textbox"
          aria-label="Journal editor"
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => onInputHTML((e.target as HTMLDivElement).innerHTML)}
          onPaste={onPaste}
          className="rounded-lg outline-none prose-area"
          style={{
            minHeight: Math.max(220, Math.round(defaultHeightPx * 0.8)),
            padding: "12px",
            background: T.mode === "light" ? T.panel : T.panel,
            color: T.text,
            border: `1px solid ${T.border}`,
            resize: 'vertical',
          }}
        />
        {/* Subtle tip */}
        <div className="mt-2 text-xs" style={{ color: T.textDim }}>
          Tip: notes auto-save per session. Use the toolbar or <kbd>Ctrl/Cmd+B</kbd>, <kbd>I</kbd>, <kbd>U</kbd>.
        </div>
      </div>
    </section>
  );
}

/* ---------- Toolbar bits ---------- */
function ToolbarButton({
  label,
  title,
  onClick,
  T,
}: {
  label: string;
  title: string;
  onClick: () => void;
  T: Theme;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="px-2 py-1 rounded-md text-xs border"
      style={{
        background: T.panel,
        color: T.text,
        borderColor: T.border,
      }}
      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = T.panelAlt)}
      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = T.panel)}
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
