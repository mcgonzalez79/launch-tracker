import React, { useEffect } from "react";
import { Theme } from "../theme";

/** Card (supports drag) */
export function Card({
  title,
  children,
  actions,
  theme,
  draggableKey,
  onDragStart,
  onDragOver,
  onDrop,
  fullBleed = false,
  dragHandle = false,
}: {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  theme?: Theme;
  draggableKey?: string;
  onDragStart?: (k: string) => (e: React.DragEvent) => void;
  onDragOver?: (k: string) => (e: React.DragEvent) => void;
  onDrop?: (k: string) => (e: React.DragEvent) => void;
  fullBleed?: boolean;
  /** some places pass dragHandle for a visual affordance */
  dragHandle?: boolean;
}) {
  const wrapProps =
    draggableKey && onDragStart && onDragOver && onDrop
      ? {
          draggable: true,
          onDragStart: onDragStart(draggableKey),
          onDragOver: onDragOver(draggableKey),
          onDrop: onDrop(draggableKey),
        }
      : {};

  return (
    <div
      {...wrapProps}
      className="rounded-2xl shadow"
      style={{
        background: theme?.card ?? "#fff",
        border: `1px solid ${theme?.cardBorder ?? "#e5e7eb"}`,
      }}
    >
      {(title || actions) && (
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${theme?.cardBorder ?? "#e5e7eb"}` }}
        >
          <div className="flex items-center gap-2">
            {dragHandle && (
              <span title="Drag to rearrange" style={{ cursor: "grab", opacity: 0.7 }}>⋮⋮</span>
            )}
            <h3 className="text-sm font-semibold" style={{ color: theme?.text ?? "#0f172a" }}>
              {title}
            </h3>
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className={fullBleed ? "" : "p-4"}>{children}</div>
    </div>
  );
}

/** Top tabs */
export function TopTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 rounded-lg text-sm font-medium"
      style={{
        background: active ? "#ffffff22" : "transparent",
        color: "#fff",
        border: "1px solid #ffffff44",
      }}
    >
      {label}
    </button>
  );
}

/* Icons */
export const IconSun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
    <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" stroke="currentColor" strokeWidth="2" />
  </svg>
);
export const IconMoon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" stroke="currentColor" strokeWidth="2" fill="none" />
  </svg>
);

/** Nice hover tooltip */
export function InfoTooltip({
  label,
  children,
  theme,
  maxWidth = 320,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  theme?: Theme;
  maxWidth?: number;
}) {
  return (
    <div className="relative group inline-flex items-center">
      {label}
      <div
        className="absolute z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
        style={{
          top: "120%",
          right: 0,
          maxWidth,
          background: theme?.tooltipBg ?? "#0f172a",
          color: theme?.tooltipText ?? "#fff",
          borderRadius: 10,
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          padding: 12,
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="text-xs leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

/** Modal */
export function Modal({
  open,
  onClose,
  title,
  children,
  theme,
  width = 860,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  theme?: Theme;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ width, maxWidth: "95vw", background: theme?.card ?? "#fff", border: `1px solid ${theme?.cardBorder ?? "#e5e7eb"}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${theme?.cardBorder ?? "#e5e7eb"}` }}>
          <h3 className="text-sm font-semibold" style={{ color: theme?.text ?? "#0f172a" }}>{title}</h3>
          <button onClick={onClose} className="px-2 py-1 rounded border text-xs" style={{ borderColor: "#e5e7eb" }}>
            Close
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/** KPI (for Dashboard) */
export function KPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl p-3 shadow text-sm" style={{ background: "#ffffff" }}>
      <div className="text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold" style={{ color }}>{value || "-"}</div>
    </div>
  );
}

/** Table helpers */
export function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 pr-4 text-slate-600">{children}</th>;
}
export function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2 pr-4">{children}</td>;
}

/** Empty chart placeholder */
export function EmptyChart({ label = "No data" }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center h-48 rounded-xl border text-sm"
      style={{ borderColor: "#e5e7eb", color: "#94a3b8", background: "repeating-linear-gradient(45deg,#fafafa,#fafafa 10px,#f5f5f5 10px,#f5f5f5 20px)" }}
    >
      {label}
    </div>
  );
}
