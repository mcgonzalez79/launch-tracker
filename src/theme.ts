export type Theme = {
  brand: string;
  brandTint: string;
  brandSoft: string;

  appBg: string;
  headerBg: string;
  headerFg: string;

  cardBg: string;
  text: string;
  textDim: string;  // NEW
  border: string;   // NEW
  grid: string;

  kpiCarry: string;
  kpiTotal: string;
  kpiSmash: string;
  kpiSpin: string;
  kpiNeutral: string;
};

export const themeLight: Theme = {
  brand: "#006747",       // Pantone 342 approximation
  brandTint: "#2F8C76",
  brandSoft: "#E6F2EF",

  appBg: "linear-gradient(180deg, #0f172a 0%, #E6F2EF 100%)",
  headerBg: "#006747",
  headerFg: "#ffffff",

  cardBg: "#ffffff",
  text: "#0f172a",
  textDim: "#64748b",
  border: "#e5e7eb",
  grid: "#e5e7eb",

  kpiCarry: "#006747",
  // If you want Total to be green too, set this to brand as well:
  // kpiTotal: "#006747",
  kpiTotal: "#3A86FF",
  kpiSmash: "#EF476F",
  kpiSpin: "#2F8C76",
  kpiNeutral: "#334155",
};

export const themeDark: Theme = {
  brand: "#2F8C76",
  brandTint: "#5FB09B",
  brandSoft: "#0b1220",

  appBg: "#0b1220",
  headerBg: "#0f172a",
  headerFg: "#e2e8f0",

  cardBg: "#111827",
  text: "#e5e7eb",
  textDim: "#94a3b8",
  border: "#374151",
  grid: "#374151",

  kpiCarry: "#34d399",
  kpiTotal: "#60a5fa",
  kpiSmash: "#f472b6",
  kpiSpin: "#86efac",
  kpiNeutral: "#94a3b8",
};
