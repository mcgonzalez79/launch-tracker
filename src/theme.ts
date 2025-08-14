export type Theme = {
  brand: string;
  brandSoft: string;
  text: string;
  textSoft: string;
  bg: string;
  card: string;
  cardBorder: string;
  kpi: string;

  tooltipBg: string;
  tooltipText: string;

  // backgrounds used for plots (e.g., dispersion/distance)
  dispBg: string;
};

export const LIGHT: Theme = {
  brand: "#0B7A3B",        // green brand
  brandSoft: "#E7F5EC",
  text: "#0f172a",
  textSoft: "#475569",
  bg: "#F8FAFC",
  card: "#ffffff",
  cardBorder: "#e5e7eb",
  kpi: "#F1F5F9",

  tooltipBg: "#0f172a",
  tooltipText: "#ffffff",

  dispBg: "#F2F9F5",       // light green tint bg (matches dispersion)
};

export const DARK: Theme = {
  brand: "#23B26D",
  brandSoft: "#14312A",
  text: "#E5E7EB",
  textSoft: "#94A3B8",
  bg: "#0B1220",
  card: "#0F172A",
  cardBorder: "#1F2937",
  kpi: "#111827",

  tooltipBg: "#111827",
  tooltipText: "#F1F5F9",

  dispBg: "#0F1A15",
};
