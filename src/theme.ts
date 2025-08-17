// theme.ts
export type Theme = {
  mode: "light" | "dark";
  // surfaces & text
  bg: string;
  panel: string;
  text: string;
  textDim: string;
  border: string;
  kpiBorder: string;
  // brand
  brand: string;
  brandTint: string;
  brandAccent: string;
  // misc commonly used colors
  white: string;
  blueSoft: string;
};

// ------------------------------
// Club colors (kept stable)
// If you previously had a custom palette, paste it here to preserve exact colors.
// ------------------------------
export const clubPalette: string[] = [
  // These are sane defaults; replace with your previous values if needed.
  "#2563EB", "#059669", "#D97706", "#DC2626", "#7C3AED",
  "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#9333EA",
  "#22C55E", "#3B82F6"
];

/**
 * Stable per-club color selector. Works with Filters (color chips) and charts that rely on club color.
 * If the club order changes, the same club still hashes to the same color.
 */
export function colorForClub(club: string, clubs?: string[], palette: string[] = clubPalette): string {
  // Prefer index within the current "clubs" list for stability across a page load,
  // otherwise fall back to a deterministic hash of the club name.
  let idx = -1;
  if (clubs && clubs.length) idx = clubs.indexOf(club);
  if (idx < 0) {
    let h = 0;
    for (let i = 0; i < club.length; i++) h = (h * 31 + club.charCodeAt(i)) >>> 0;
    idx = h;
  }
  return palette[Math.abs(idx) % palette.length];
}

// ------------------------------
// Huemint palette mapping
// https://huemint.com/bootstrap-basic/#palette=dbe8e1-ffffff-13202e-076652-099d00-c5c8df
// ------------------------------
const H = {
  mint:  "#DBE8E1", // soft mint background
  white: "#FFFFFF",
  navy:  "#13202E", // deep navy for text/dark bg
  teal:  "#076652", // primary brand in light
  green: "#099D00", // accent brand
  grayL: "#C5C8DF"  // cool gray-lavender for borders
};

// LIGHT: mint wash background + white cards, navy text, teal primary, green accent
export const LIGHT: Theme = {
  mode: "light",
  bg: H.mint,
  panel: H.white,
  text: H.navy,
  textDim: "#4B5563",       // slate-ish for secondary text
  border: H.grayL,
  kpiBorder: "#E5E7EB",     // subtle KPI borders (tailwind slate-200-ish)
  brand: H.teal,
  brandTint: "#10B981",     // soft tint used in Card header accent bars, etc.
  brandAccent: H.green,
  white: H.white,
  blueSoft: "#E8F1FF",      // gentle info stripe for Journal help
};

// DARK: deep navy background + slightly lighter panels, minty text, flip brand emphasis
export const DARK: Theme = {
  mode: "dark",
  bg: H.navy,
  panel: "#1A2A3A",
  text: H.mint,
  textDim: "#A7B0B8",
  border: "#2C3B4B",
  kpiBorder: "#314355",
  brand: H.green,           // a touch brighter in dark for contrast
  brandTint: "#34D399",     // tint used in small accents
  brandAccent: H.teal,
  white: H.white,
  blueSoft: "#0B2239",      // subtle dark info stripe
};
