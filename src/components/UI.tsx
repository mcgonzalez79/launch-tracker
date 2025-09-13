import React, { useEffect } from "react";
import type { Theme } from "../theme";
import type { Achievement } from "../achievements";

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

export function IconMenu() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4 6l16 0" />
      <path d="M4 12l16 0" />
      <path d="M4 18l16 0" />
    </svg>
  );
}

export function IconAdjustments() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4 10a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
      <path d="M6 4v4" />
      <path d="M6 12v8" />
      <path d="M10 16a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
      <path d="M12 4v10" />
      <path d="M12 18v2" />
      <path d="M16 7a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
      <path d="M18 4v1" />
      <path d="M18 9v11" />
    </svg>
  );
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
      <div className={`${pad ? "p-4" : ""} min-w-0`}>{children}</div>
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
   Achievement Notification Modal
========================= */
export function AchievementNotificationModal({ achievements, onClose, theme: T }: { achievements: Achievement[], onClose: () => void, theme: Theme }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 10000); // Auto-close after 10 seconds
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg border shadow-lg overflow-hidden" style={{ background: T.panel, borderColor: T.border, color: T.text }} onClick={e => e.stopPropagation()}>
        <header className="p-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.border}`, background: T.panelAlt }}>
          <h3 className="font-semibold text-base">🏆 Achievements Unlocked!</h3>
          <button className="text-xs underline" style={{ color: T.brand }} onClick={onClose}>Close</button>
        </header>
        <div className="p-4 max-h-64 overflow-y-auto text-sm space-y-3">
          {achievements.map(ach => (
            <div key={ach.id}>
              <div className="font-semibold">{ach.name}</div>
              <div className="text-xs" style={{ color: T.textDim }}>{ach.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
