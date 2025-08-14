import React, { useEffect, useRef, useState } from "react";
import { Theme } from "./theme";

type Props = { theme: Theme };

export default function JournalView({ theme }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string>(() => localStorage.getItem("launch-tracker:journal") || "");

  useEffect(() => {
    localStorage.setItem("launch-tracker:journal", html);
  }, [html]);

  // Auto placeholder handling
  const placeholder = "Use the journal to capture longer-form notes: range sessions, feels, drills, course notes, and goals. You can use the H2/H3 buttons, lists, and formatting in your toolbar if present.";

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="rounded-2xl p-4 shadow" style={{ background: theme.cardBg }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-wide" style={{ color: theme.text }}>Journal</h2>
          <div className="h-1 rounded-full w-24" style={{ background: theme.brand }} />
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => setHtml(editorRef.current?.innerHTML || "")}
          style={{
            minHeight: 280,
            outline: "none",
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            padding: 12,
            background: "#fff",
            color: "#111827",
          }}
          dangerouslySetInnerHTML={{ __html: html || `<p style="color:#9ca3af">${placeholder}</p>` }}
        />
        <div className="mt-2 text-xs" style={{ color: theme.textDim }}>
          Content is saved locally in your browser (no cloud storage).
        </div>
      </div>
    </div>
  );
}
