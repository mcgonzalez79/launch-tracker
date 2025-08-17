// Huemint-derived palette (light/dark)
// Light seeds: #DBE8E1 (bg tint), #FFFFFF (paper), #13202E (ink), #076652 (brand),
//               #099D00 (accent-green), #C5C8DF (lavender-gray)
export type Theme = {
  mode: "light" | "dark";

  // basics
  bg: string;          // page background
  panel: string;       // cards/panels
  panelAlt: string;    // subtle alt fill for chips/sliders
  text: string;        // primary text
  textDim: string;     // secondary text
  border: string;      // hairline borders
  brand: string;       // primary action color (buttons, active tabs)
  brandHover: string;  // hover state
  brandMuted: string;  // subtle brand tint
  accent: string;      // secondary accent
  white: string;       // pure white for contrast

  // status
  success: string;
  warn: string;
  error: string;

  // charts
  grid: string;
  tick: string;
};

// Light
export const LIGHT: Theme = {
  mode: "light",
  bg: "#f5f8f6",                 // lifted from #DBE8E1
  panel: "#ffffff",              // #FFFFFF
  panelAlt: "#eef2f0",           // light tint of bg
  text: "#13202e",               // ink
  textDim: "#445263",            // dimmed ink
  border: "#d6ded9",             // subtle border
  brand: "#076652",              // brand teal
  brandHover: "#0b7b64",
  brandMuted: "#bfe3dc",
  accent: "#099d00",             // green accent
  white: "#ffffff",

  success: "#0b9a4a",
  warn: "#b88000",
  error: "#c0362c",

  grid: "#e7ece9",
  tick: "#9aa7b5",
};

// Dark
export const DARK: Theme = {
  mode: "dark",
  bg: "#0f1720",                 // deepened from #13202E
  panel: "#152232",
  panelAlt: "#1a2a3d",
  text: "#eaf0ff",
  textDim: "#a9b6c6",
  border: "#27384d",
  brand: "#0d8a72",              // lifted brand to pop on dark
  brandHover: "#10a386",
  brandMuted: "#1f3f51",
  accent: "#38b000",             // readable green
  white: "#ffffff",

  success: "#2ddc83",
  warn: "#e0a94f",
  error: "#ef6a5a",

  grid: "#233449",
  tick: "#8aa0b8",
};

// Natural club ordering helper for sorting (Driver -> woods -> hybrids -> irons -> wedges -> putter)
export function orderIndex(club: string): number {
  const name = (club || "").toLowerCase().replace(/\s+/g, "");
  const table = [
    "driver", "1w", "2w", "3w", "4w", "5w", "7w", "9w",
    "1h","2h","3h","4h","5h","6h",
    "1i","2i","3i","4i","5i","6i","7i","8i","9i",
    "pw","gw","aw","sw","lw",
    "putter","pt"
  ];
  const alias: Record<string,string> = {
    "3wood":"3w","5wood":"5w","7wood":"7w","9wood":"9w",
    "3hybrid":"3h","4hybrid":"4h","5hybrid":"5h",
    "3iron":"3i","4iron":"4i","5iron":"5i","6iron":"6i","7iron":"7i","8iron":"8i","9iron":"9i",
    "pitchingwedge":"pw","gapwedge":"gw","approachwedge":"aw","sandwedge":"sw","lobwedge":"lw"
  };
  const key = alias[name] || name;
  const idx = table.indexOf(key);
  return idx >= 0 ? idx : 100 + (key[0]?.charCodeAt(0) ?? 0);
}
