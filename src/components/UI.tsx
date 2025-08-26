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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7.4 2.1C8.7 2.1 9.9 2.1 11.1 2.1C12.3 2.1 13.5 2.1 14.7 2.1C15.9 2.1 17.1 2.2 18.2 2.5C19.4 2.8 20.4 3.3 21.2 4.2C22.1 5 22.6 6 22.9 7.2C23.2 8.3 23.3 9.5 23.3 10.7C23.3 11.9 23.3 13.1 23.3 14.3C23.3 15.5 23.2 16.7 22.9 17.8C22.6 19 22.1 20 21.2 20.8C20.4 21.7 19.4 22.2 18.2 22.5C17.1 22.8 15.9 22.9 14.7 22.9C13.5 22.9 12.3 22.9 11.1 22.9C9.9 22.9 8.7 22.9 7.4 22.9C6.2 22.9 5 22.8 3.9 22.5C2.8 22.2 1.8 21.7 1 20.8C0.1 20 0 19 0 17.8C0 16.7 0 15.5 0 14.3C0 13.1 0 11.9 0 10.7C0 9.5 0.1 8.3 0.4 7.2C0.7 6 1.2 5 2.1 4.2C2.9 3.3 3.9 2.8 5 2.5C6.2 2.2 7.4 2.1 8.6 2.1H7.4ZM12 5.5C8.4 5.5 5.5 8.4 5.5 12C5.5 15.6 8.4 18.5 12 18.5C15.6 18.5 18.5 15.6 18.5 12C18.5 8.4 15.6 5.5 12 5.5ZM19 7.5C18.3 7.5 17.8 7 17.8 6.2C17.8 5.5 18.3 5 19 5C19.8 5 20.2 5.5 20.2 6.2C20.2 7 19.8 7.5 19 7.5ZM12 7C14.7 7 17 9.3 17 12C17 14.7 14.7 17 12 17C9.3 17 7 14.7 7 12C7 9.3 9.3 7 12 7Z" fill="currentColor"/>
    </svg>
  );
}

export function IconMenu() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}


/* =========================
   Layout & Components
========================= */

// Top tabs for navigation
export function TopTab({ label, isActive, onClick, T }: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  T: Theme;
}) {
  return (
    <button
      type="button"
      className={`px-4 py-2 rounded-t-md text-sm font-medium transition-colors ${isActive ? "" : "hover:bg-opacity-80"}`}
      style={{
        background: isActive ? T.brand : T.brandMuted,
        color: isActive ? T.white : T.text,
        border: "1px solid transparent",
        borderBottom: "none",
        borderTopColor: isActive ? T.brand : T.brandMuted,
        borderLeftColor: isActive ? T.brand : T.brandMuted,
        borderRightColor: isActive ? T.brand : T.brandMuted,
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// Reusable card container
type CardProps = {
  children: React.ReactNode;
  title: string;
  theme: Theme;
  className?: string;
  right?: React.ReactNode;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
};
export function Card({ children, title, theme: T, className = "", right, onDragStart, onDragOver, onDrop }: CardProps) {
  const isSpecialHeader = title === "Filters" || title === "Scorecard";
  const headerStyle = {
    borderColor: T.border,
    ...(isSpecialHeader && { background: "#dbe8e1" }),
  };
  return (
    <div
      className={`rounded-lg shadow-sm border overflow-hidden ${className}`}
      style={{ background: T.panel, borderColor: T.border }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-2 border-b"
        style={headerStyle}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <h3 className="text-sm font-medium" style={{ color: T.text }}>
          {title}
        </h3>
        {right && <div>{right}</div>}
      </div>
      {/* Body */}
      <div className="p-4">{children}</div>
    </div>
  );
}


// Reusable form section
export function FormSection({ title, children, theme: T }: { title: string; children: React.ReactNode; theme: Theme; }) {
  return (
    <div>
      <h4 className="text-sm font-medium mb-2" style={{ color: T.textDim }}>{title}</h4>
      {children}
    </div>
  );
}

// Little secondary button
export function SecondaryButton({
  children,
  onClick,
  theme: T,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  theme: Theme;
  title?: string;
  disabled?: boolean;
}) {
  const focusRing = (T: Theme) => ({
    outline: "none",
    boxShadow: `0 0 0 2px ${T.brand}`,
  });
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className="px-3 py-1 rounded-md border text-sm transition-colors"
      style={{
        background: T.panel,
        color: T.text,
        borderColor: T.border,
        opacity: disabled ? 0.6 : 1,
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
      onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 2px ${T.brand}`)}
      onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      {children}
    </button>
  );
}
