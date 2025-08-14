/* Theme + shared colors/ordering + color helpers */
export type Theme = {
  brand: string; brandTint: string; brandSoft: string; white: string;
  text: string; textDim: string; border: string; panel: string;
  blueSoft: string; greenSoft: string; orangeSoft: string;
  kpiBorder: string; gridStripeA: string; gridStripeB: string;
};

export const LIGHT: Theme = {
  // New palette
  brand: "#076652",          // deep teal
  brandTint: "#60B2C2",      // teal tint
  brandSoft: "#ECEAED",      // very light soft bg
  white: "#ffffff",

  text: "#19202F",           // navy for primary text
  textDim: "#518B80",        // muted teal for secondary text

  border: "#E3E5EA",         // subtle light border (derived from #ECEAED)
  panel: "#ffffff",

  // Soft utility fills (kept for components that expect them)
  blueSoft: "#E6F3F6",       // soft tint of #60B2C2
  greenSoft: "#EAF4F1",      // soft tint of #076652
  orangeSoft: "#FFF6EC",     // unchanged (used in some UI accents)

  kpiBorder: "#E3E5EA",
  // Gentle green-ish grid stripes used on some charts
  gridStripeA: "#EAF5F2",
  gridStripeB: "#F4FAF8",
};

export const DARK: Theme = {
  // Keep brand visible on dark backgrounds
  brand: "#60B2C2",          // brighter on dark
  brandTint: "#076652",      // deep teal as secondary
  brandSoft: "#142026",      // soft brand-tinted surface
  white: "#0B0F14",          // app background in dark mode

  text: "#ECEAED",           // light from palette
  textDim: "#518B80",        // muted teal

  border: "#2A3544",
  panel: "#19202F",          // navy panel

  blueSoft: "#0E2230",
  greenSoft: "#0F2420",
  orangeSoft: "#2A1909",

  kpiBorder: "#2A3544",
  // Navy-leaning subtle stripes for dark charts
  gridStripeA: "#121B25",
  gridStripeB: "#0E1620",
};

/* Shot-shape colors */
export const DRAW_BLUE = "#4EA3FF";
export const STRAIGHT_GREEN = LIGHT.brand;
export const FADE_ORANGE = "#F59E0B";

/* Two bars in Gap chart */
export const CARRY_BAR = "#1F77B4";
export const TOTAL_BAR = "#2CA02C";

/* Stable per-club palette */
export const clubPalette = [
  "#1F77B4", "#2CA02C", "#FF7F0E", "#D62728", "#9467BD",
  "#8C564B", "#E377C2", "#17BECF", "#7F7F7F", "#BCBD22",
  "#AEC7E8", "#FFBB78",
];

/* Display order helpers */
export const ORDER = [
  "Driver", "3 Wood", "5 Wood", "7 Wood",
  "2 Hybrid", "3 Hybrid", "4 Hybrid", "5 Hybrid", "5 Hybrid (5 Iron)",
  "3 Iron", "4 Iron", "5 Iron", "6 Iron", "7 Iron", "8 Iron", "9 Iron",
  "Pitching Wedge", "Gap Wedge", "Sand Wedge", "Lob Wedge", "60 (LW)"
];
export const orderIndex = (name: string) => {
  const i = ORDER.findIndex(o => o.toLowerCase() === name.toLowerCase());
  if (i >= 0) return i;
  const lower = name.toLowerCase();
  if (lower.includes("driver")) return 0;
  if (lower.includes("wood")) { const m = lower.match(/(\d+)\s*wood/); return m ? 1 + Number(m[1]) : 4; }
  if (lower.includes("hybrid")) { const m = lower.match(/(\d+)\s*hybrid/); return m ? 10 + Number(m[1]) : 12; }
  if (lower.includes("iron")) { const m = lower.match(/(\d+)\s*iron/); return m ? 20 + Number(m[1]) : 28; }
  if (lower.includes("pitch") || lower.includes("pw")) return 40;
  if (lower.includes("gap")) return 41;
  if (lower.includes("sand") || lower.includes("(sw)")) return 42;
  if (lower.includes("lob") || lower.includes("(lw)")) return 43;
  return 99;
};

export const hexToRgb = (hex: string) => {
  const m = hex.replace("#", "");
  const bigint = parseInt(m.length === 3 ? m.split("").map(c => c + c).join("") : m, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
};
export const alpha = (hex: string, a = 0.25) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
export const colorForClub = (club: string, clubsAll: string[], palette: string[]) => {
  const idx = clubsAll.findIndex(c => c.toLowerCase() === club.toLowerCase());
  if (idx >= 0) return palette[idx % palette.length];
  let h = 0; for (let i = 0; i < club.length; i++) h = (h * 31 + club.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};
