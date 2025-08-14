import React, { useEffect } from "react";
import { Theme } from "./theme";
import { Card, ToolbarBtn } from "./components/UI";

export default function JournalView({ theme, editorRef, value, onInputHTML, sessionLabel, defaultHeightPx }:{
  theme: Theme; editorRef: React.RefObject<HTMLDivElement>; value: string; onInputHTML: (html: string)=>void; sessionLabel: string; defaultHeightPx?: number;
}) {
  const T = theme;
  const HELP_TEXT = "Use the Journal to capture longer-form notes from your sessions: swing thoughts and feels vs. reals, drills and rep counts, shot patterns and misses, goals and next steps, equipment tweaks, course notes, and conditions. Entries auto-save per session.";

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    onInputHTML(editorRef.current?.innerHTML || "");
  };
  const onKeyUp = () => onInputHTML(editorRef.current?.innerHTML || "");
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault(); const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text); onInputHTML(editorRef.current?.innerHTML || "");
  };
  useEffect(() => { if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value || ""; }, [value, editorRef]);
  const RESERVED = 160; const minEditorH = Math.max(420, Math.floor((defaultHeightPx || 420) - RESERVED));

  return (
    <div className="grid grid-cols-1 gap-8">
      <Card theme={T} title={`Journal — ${sessionLabel}`}>
        <div className="mb-4 text-sm rounded-lg px-4 py-3" style={{ background: T.blueSoft, border: `1px solid ${T.border}`, color: T.text }}>
          {HELP_TEXT}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <ToolbarBtn theme={T} label="B" onClick={() => exec("bold")} />
          <ToolbarBtn theme={T} label={<em>I</em>} onClick={() => exec("italic")} />
          <ToolbarBtn theme={T} label={<u>U</u>} onClick={() => exec("underline")} />
          <ToolbarBtn theme={T} label="H2" onClick={() => exec("formatBlock", "H2")} />
          <ToolbarBtn theme={T} label="H3" onClick={() => exec("formatBlock", "H3")} />
          <ToolbarBtn theme={T} label="• List" onClick={() => exec("insertUnorderedList")} />
          <ToolbarBtn theme={T} label="1. List" onClick={() => exec("insertOrderedList")} />
          <ToolbarBtn theme={T} label="Link" onClick={() => { const url = window.prompt("Enter URL"); if (url) exec("createLink", url); }} />
          <ToolbarBtn theme={T} label="Clear" onClick={() => onInputHTML("")} />
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onKeyUp={onKeyUp}
          onBlur={onKeyUp}
          onPaste={onPaste}
          aria-label="Practice journal editor"
          className="rounded-lg p-4 text-sm overflow-auto resize-y"
          style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text, minHeight: `${minEditorH}px`, resize: "vertical" }}
        />
        {!value && <div className="mt-2 text-xs" style={{ color: T.textDim }}>Tip: your journal auto-saves per session. Use the toolbar to format.</div>}
      </Card>
    </div>
  );
}
