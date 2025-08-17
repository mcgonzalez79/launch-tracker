import React from "react";
import type { Theme } from "../theme";

/* Icons */
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

/* Card */
export function Card({
  title,
  children,
  theme: T,
  pad = true,
}: {
  title?: string;
  children?: React.ReactNode;
  theme: Theme;
  pad?: boolean;
}) {
  return (
    <section
      className="rounded-xl shadow-sm"
      style={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
    >
      {title && (
        <header
          className="px-4 py-2 rounded-t-xl text-sm font-medium"
          style={{ borderBottom: `1px solid ${T.border}`, background: T.panelAlt, color: T.text }}
        >
          {title}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

/* Top Tab */
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
    >
      {label}
    </button>
  );
}

/* Chip (for filters) */
export function Chip({
  label,
  selected,
  onClick,
  theme: T,
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  theme: Theme;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 rounded-md text-xs border"
      style={{
        background: selected ? T.brandMuted : T.panelAlt,
        color: selected ? T.text : T.text,
        borderColor: selected ? T.brand : T.border,
      }}
    >
      {label}
    </button>
  );
}

/* Muted button */
export function MutedButton({
  children,
  onClick,
  theme: T,
}: {
  children: React.ReactNode;
  onClick: () => void;
  theme: Theme;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-md border text-sm"
      style={{ background: T.panel, color: T.text, borderColor: T.border }}
    >
      {children}
    </button>
  );
}

/* Primary button */
export function PrimaryButton({
  children,
  onClick,
  theme: T,
}: {
  children: React.ReactNode;
  onClick: () => void;
  theme: Theme;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-md border text-sm"
      style={{
        background: T.brand,
        color: T.white,
        borderColor: T.brand,
      }}
      onMouseOver={(e) => ((e.currentTarget.style.backgroundColor = T.brandHover))}
      onMouseOut={(e) => ((e.currentTarget.style.backgroundColor = T.brand))}
    >
      {children}
    </button>
  );
}
