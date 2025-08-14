import React from "react";
import { Theme } from "../theme";

// Lightweight shared UI primitives that only rely on Theme fields we have:
// - theme.cardBg
// - theme.border
// - theme.text
// - theme.kpiCarry / theme.kpiTotal for accents (optional)

export function Card({
  theme, title, children, className, dragHandle
}: {
  theme: Theme;
  title: string;
  children: React.ReactNode;
  className?: string;
  dragHandle?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-4 shadow ${className || ""}`} style={{ background: theme.cardBg }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-wide" style={{ color: theme.text }}>
          {title}
        </h2>
        <div
          className="h-1 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${theme.kpiCarry}, ${theme.kpiTotal})`,
            width: dragHandle ? 48 : 96,
            cursor: dragHandle ? "grab" : "default"
          }}
        />
      </div>
      {children}
    </div>
  );
}

export function KPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-2xl p-3 shadow text-sm"
      style={{ background: "#ffffff", border: `1px solid ${"#e5e7eb"}` }}
    >
      <div style={{ color: "#64748b" }}>{label}</div>
      <div className="mt-1 text-lg font-semibold" style={{ color }}>{value || "-"}</div>
    </div>
  );
}

export function Pill({
  children,
  theme,
  tone = "neutral"
}: {
  children: React.ReactNode;
  theme: Theme;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const bg =
    tone === "good" ? "#dcfce7" :
    tone === "warn" ? "#fef3c7" :
    tone === "bad" ? "#fee2e2" : "#e5e7eb";
  const fg =
    tone === "good" ? "#065f46" :
    tone === "warn" ? "#92400e" :
    tone === "bad" ? "#991b1b" : "#111827";

  return (
    <span
      className="px-2 py-1 rounded-full text-xs"
      style={{ background: bg, color: fg, border: `1px solid ${theme.border}` }}
    >
      {children}
    </span>
  );
}

export function Divider({ theme }: { theme: Theme }) {
  return <div style={{ height: 1, background: theme.border, margin: "8px 0" }} />;
}
