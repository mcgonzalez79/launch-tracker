import React from "react";
import type { Theme } from "../theme";

/* =========================
   Icons
========================= */
export function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 4V2M12 22v-2M4.93 4.93 3.52 3.52M20.48 20.48l-1.41-1.41M4 12H2M22 12h-2M4.93 19.07 3.52 20.48M20.48 3.52l-1.41 1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

export function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    </svg>
  );
}

export function IconInstagram() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" strokeLinecap="round"></line>
    </svg>
  )
}

/* =========================
   Card
========================= */
export function Card({
  title,
  right,
  children,
  theme: T,
  pad = true,
  footer,
}: {
  title?: string;
  right?: React.ReactNode;        // right-aligned content in header (optional)
  children?: React.ReactNode;
  theme: Theme;
  pad?: boolean;
  footer?: React.ReactNode;       // optional footer region
}) {
  return (
    <section
      className="rounded-xl shadow-sm"
      style={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
    >
      {(title || right) && (
        <header
          className="px-4 py-2 rounded-t-xl text-sm font-medium flex items-center justify-between gap-2"
          style={{
            borderBottom: `1px solid ${T.border}`,
            background: T.mode === 'light' ? '#dbe8e1' : T.panelAlt,
            color: T.text
          }}
        >
          <div>{title}</div>
          {right ? <div className="text-xs" style={{ color: T.textDim }}>{right}</div> : null}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
      {footer ? (
        <div
          className="px-4 py-2 rounded-b-xl text-xs"
          style={{ borderTop: `1px solid ${T.border}`, background: T.panelAlt, color: T.textDim }}
        >
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/* =========================
   Top Tabs
========================= */
export function TopTab({
  label,
  active,
  onClick,
  theme: T,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  theme: Theme;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-md text-sm border transition-colors"
      style={{
        background: active ? T.brand : T.panel,
        color: active ? T.white : T.text,
        borderColor: active ? T.brand : T.border,
      }}
      onMouseOver={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = T.panelAlt;
      }}
      onMouseOut={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = T.panel;
      }}
    >
      {label}
    </button>
  );
}

/* =========================
   Chip (filters)
========================= */
export function Chip({
  label,
  selected,
  onClick,
  theme: T,
  title,
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  theme: Theme;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="px-2 py-1 rounded-md text-xs border transition-colors"
      style={{
        background: selected ? T.brandMuted : T.panelAlt,
        color: T.text,
        borderColor: selected ? T.brand : T.border,
      }}
      onMouseOver={(e) => {
        if (selected) e.currentTarget.style.backgroundColor = T.brand;
        else e.currentTarget.style.backgroundColor = T.panel;
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.backgroundColor = selected ? T.brandMuted : T.panelAlt;
      }}
    >
      {label}
    </button>
  );
}

/* =========================
   Buttons
========================= */
const focusRing = (T: Theme) => ({
  boxShadow: `0 0 0 2px ${T.white}, 0 0 0 4px ${T.brandMuted}`,
});

export function MutedButton({
  children,
  onClick,
  theme: T,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  theme: Theme;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className="px-3 py-1 rounded-md border text-sm transition-colors"
      style={{
        background: T.panel,
        color: disabled ? T.textDim : T.text,
        borderColor: T.border,
        opacity: disabled ? 0.7 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseOver={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = T.panelAlt;
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.backgroundColor = T.panel;
      }}
      onFocus={(e) => Object.assign(e.currentTarget.style, focusRing(T))}
      onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  theme: T,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  theme: Theme;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className="px-3 py-1 rounded-md border text-sm transition-colors"
      style={{
        background: disabled ? T.brandMuted : T.brand,
        color: T.white,
        borderColor: disabled ? T.brandMuted : T.brand,
        opacity: disabled ? 0.8 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseOver={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = T.brandHover;
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.backgroundColor = disabled ? T.brandMuted : T.brand;
      }}
      onFocus={(e) => Object.assign(e.currentTarget.style, focusRing(T))}
      onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      {children}
    </button>
  );
}
