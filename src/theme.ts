// src/theme.ts
export type Theme = {
  name: "light" | "dark";
  // core brand accents
  brand: string;        // primary green
  accent1: string;      // teal
  accent2: string;      // sage
  // surfaces & text
  bg: string;
  panel: string;
  text: string;
  muted: string;
  border: string;
  // chart helpers
  carryBar: string;     // Gap chart: Carry
  totalBar: string;     // Gap chart: Total
  dispersionBg: string; // Dispersion field background
  // status colors used in KPIs / shot-shape boxes
  shotShape: { draw: string; straight: string; fade: string };
};

const PALETTE = {
  lightBG:  "#ECEAED", // swatch 1
  teal:     "#60B2C2", // swatch 2
  green:    "#076652", // swatch 3
  sage:     "#518B80", // swatch 4
  darkBG:   "#19202F", // swatch 5
};

export const themes: Record<Theme["name"], Theme> = {
  light: {
    name: "light",
    brand:  PALETTE.green,
    accent1: PALETTE.teal,
    accent2: PALETTE.sage,

    bg:     PALETTE.lightBG,
    panel:  "#FFFFFF",
    text:   PALETTE.darkBG,
    muted:  "#64748B",          // slate-500-ish
    border: "#E5E7EB",

    // charts
    carryBar: PALETTE.green,
    totalBar: PALETTE.teal,
    dispersionBg:
      "linear-gradient(180deg, rgba(7,102,82,0.06) 0%, rgba(7,102,82,0.02) 100%)",

    // shot-shape chips (unchanged from previous app look)
    shotShape: {
      draw: "#3B82F6",     // blue
      straight: "#22C55E", // green
      fade: "#F97316",     // orange
    },
  },

  dark: {
    name: "dark",
    // Keep the same brand family but bump contrast for dark
    brand:  PALETTE.teal,     // reads brighter on dark
    accent1: PALETTE.green,   // deep green accent
    accent2: PALETTE.sage,

    bg:     PALETTE.darkBG,
    panel:  "#1E2A3A",
    text:   PALETTE.lightBG,
    muted:  "#94A3B8",
    border: "#2B3649",

    carryBar: PALETTE.teal,   // lighter line on dark bg
    totalBar: PALETTE.sage,
    dispersionBg:
      "linear-gradient(180deg, rgba(96,178,194,0.08) 0%, rgba(25,32,47,0.00) 100%)",

    shotShape: {
      draw: "#60A5FA",
      straight: "#34D399",
      fade: "#FB923C",
    },
  },
};

// Convenience getter (your App.tsx likely already does this)
export function pickTheme(mode: "light" | "dark"): Theme {
  return themes[mode];
}
