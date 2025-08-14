// Theme + palette + helpers that Dashboard/Insights expect

export type Theme = {
  brand: string;
  brandSoft: string;

  text: string;
  textSoft: string;

  white: string;   // used by App.tsx
  bg: string;

  card: string;
  cardBorder: string;
  border: string;  // alias used by some components
  kpi: string;

  tooltipBg: string;
  tooltipText: string;

  // backgrounds used for charts (e.g., dispersion / insights distance bg)
  dispBg: string;
};

/** Bar colors used across charts (Dashboard expects these) */
export const CARRY_BAR = "#2563EB"; // blue
export const TOTAL_BAR = "#16A34A"; // green (as requested)

/** Semi-transparent helper (used in Dashboard) */
export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Club colors & palette (Dashboard imports colorForClub and clubPalette) */
const CLUB_COLORS: Record<string, string> = {
  "Driver": "#2563EB",              // blue
  "3 Wood": "#10B981",              // emerald
  "4 Hybrid": "#F59E0B",            // amber
  "5 Hybrid (5 Iron)": "#EF4444",   // red
  "6 Iron": "#8B5CF6",              // violet
  "7 Iron": "#0EA5E9",              // sky
  "8 Iron": "#14B8A6",              // teal
  "9 Iron": "#F97316",              // orange
  "Pitching Wedge": "#22C55E",      // green
  "60 (LW)": "#E11D48",             // rose
};
export const clubPalette = Object.values(CLUB_COLORS);
export function colorForClub(club: string): string {
  return CLUB_COLORS[club] || "#64748B"; // slate fallback
}

/** Light/Dark themes */
export const LIGHT: Theme = {
  brand: "#0B7A3B",
  brandSoft: "#E7F5EC",

  text: "#0f172a",
  textSoft: "#475569",

  white: "#ffffff",
  bg: "#F8FAFC",

  card: "#ffffff",
  cardBorder: "#e5e7eb",
  border: "#e5e7eb",
  kpi: "#F1F5F9",

  tooltipBg: "#0f172a",
  tooltipText: "#ffffff",

  dispBg: "#F2F9F5",
};

export const DARK: Theme = {
  brand: "#23B26D",
  brandSoft: "#14312A",

  text: "#E5E7EB",
  textSoft: "#94A3B8",

  white: "#0B1220",
  bg: "#0B1220",

  card: "#0F172A",
  cardBorder: "#1F2937",
  border: "#1F2937",
  kpi: "#111827",

  tooltipBg: "#111827",
  tooltipText: "#F1F5F9",

  dispBg: "#0F1A15",
};
