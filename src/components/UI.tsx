import React from "react";
import { Theme } from "../theme";

export function Card({ theme, title, children, dragHandle }:{ theme: Theme; title: string; children: React.ReactNode; dragHandle?: boolean }) {
  return (
    <div className="rounded-2xl p-5 shadow" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold tracking-wide" style={{ color: theme.brand }}>{title}</h2>
        <div className="flex items-center gap-3">
          {dragHandle && <span title="Drag to reorder" style={{ color: theme.textDim, cursor: "grab" }}>⋮⋮</span>}
          <div className="h-1 rounded-full w-24" style={{ background: `linear-gradient(90deg, ${theme.brand}, ${theme.brandTint})` }} />
        </div>
      </div>
      {children}
    </div>
  );
}

export function KPI({ theme, label, value, color, tooltip }:{ theme: Theme; label: string; value: string; color: string; tooltip?: string }) {
  return (
    <div className="rounded-2xl p-3 text-sm" style={{ background: theme.panel, border: `1px solid ${theme.kpiBorder}`, color: theme.text }}>
      <div style={{ color: theme.textDim }}>
        {label} {tooltip && <span title={tooltip} style={{ marginLeft: 6, cursor: "help", color: theme.brand }}>ⓘ</span>}
      </div>
      <div className="mt-1 text-lg font-semibold" style={{ color }}>{value || "-"}</div>
    </div>
  );
}

export const EmptyChart = ({ theme }:{ theme: Theme }) =>
  <div style={{ padding: 16, color: theme.textDim }}>No shots in this range.</div>;

export const Th = ({ children, theme }:{ children: React.ReactNode; theme: Theme }) =>
  <th className="py-2 pr-4" style={{ color: theme.textDim }}>{children}</th>;
export const Td = ({ children }:{ children: React.ReactNode }) => <td className="py-2 pr-4">{children}</td>;

export function TopTab({ theme, label, active, onClick }:{ theme: Theme; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="px-3 py-2 rounded-lg text-sm border"
      style={{ background: active ? "#ffffff" : "#ffffff22", borderColor: "#ffffff55", color: active ? theme.brand : "#fff", fontWeight: active ? 600 : 500 }}>
      {label}
    </button>
  );
}

export const ToolbarBtn = ({ theme, label, onClick }:{ theme: Theme; label: React.ReactNode; onClick: ()=>void }) =>
  <button onClick={onClick} className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: theme.border, color: theme.text, background: theme.panel }}>{label}</button>;

export const IconSun = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="#FFD166" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="4" fill="#FFD166"/><g stroke="#fff" strokeLinecap="round"><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></g></svg>);
export const IconMoon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" stroke="currentColor" strokeWidth="1.5"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>);
