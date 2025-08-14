// Theme + palette + helpers used across App, Dashboard, and Insights

export type Theme = {
  brand: string;
  brandTint: string;  // <- added
  brandSoft: string;

  text: string;
  textSoft: string;
  textDim: string;

  white: string;
  bg: string;

  card: string;
  cardBorder: string;
  border: string;
  kpi: string;

  tooltipBg: string;
  tooltipText: string;

  dispBg: string;
  gridStripeA: string;
  gridStripeB: string;

  blueSoft: string;
  greenSoft: string;
  orangeSoft: string;
};

/** Bar colors used across charts (Dashboard expects these) */
export const CARRY_BAR = "#2563EB"; // blue
export const TOTAL_BAR = "#16A34A"; // green

/** Semi-transparent helper (Dashboard imports) */
export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Club colors & palette (Dashboard imports colorForClub and clubPalette) */
const CLUB_COLORS: Record<string, string> = {
  "Driver": "#2563EB",
  "3 Wood": "#10B981",
  "4 Hybrid": "#F59E0B",
  "5 Hybrid (5 Iron)": "#EF4444",
  "6 Iron": "#8B5CF6",
  "7 Iron": "#0EA5E9",
  "8 Iron": "#14B8A6",
  "9 Iron": "#F97316",
  "Pitching Wedge": "#22C55E",
  "60 (LW)": "#E11D48",
};
export const clubPalette = Object.values(CLUB_COLORS);
export function colorForClub(club: string): string {
  return CLUB_COLORS[club] || "#64748B";
}

/** Light/Dark themes with all required fields */
export const LIGHT: Theme = {
  brand: "#0B7A3B",
  brandTint: "#2F8C76",     // <- pleasant lighter green for accents
  brandSoft: "#E7F5EC",

  text: "#0f172a",
  textSoft: "#475569",
  textDim: "#64748B",

  white: "#ffffff",
  bg: "#F8FAFC",

  card: "#ffffff",
  cardBorder: "#e5e7eb",
  border: "#e5e7eb",
  kpi: "#F1F5F9",

  tooltipBg: "#0f172a",
  tooltipText: "#ffffff",

  dispBg: "#F2F9F5",
  gridStripeA: "#F8FAF9",
  gridStripeB: "#ECF6F0",

  blueSoft: "#DBEAFE",
  greenSoft: "#DCFCE7",
  orangeSoft: "#FFEDD5",
};

export const DARK: Theme = {
  brand: "#23B26D",
  brandTint: "#34D399",     // <- lighter green tint for dark mode
  brandSoft: "#14312A",

  text: "#E5E7EB",
  textSoft: "#94A3B8",
  textDim: "#9CA3AF",

  white: "#0B1220",
  bg: "#0B1220",

  card: "#0F172A",
  cardBorder: "#1F2937",
  border: "#1F2937",
  kpi: "#111827",

  tooltipBg: "#111827",
  tooltipText: "#F1F5F9",

  dispBg: "#0F1A15",
  gridStripeA: "#0C1612",
  gridStripeB: "#0D1A14",

  blueSoft: "#1E293B",
  greenSoft: "#0F1F18",
  orangeSoft: "#1A130B",
};
