// Shared types + helpers

export type Shot = {
  SessionId?: string;
  Timestamp?: string;
  Club: string;
  Swings?: number;

  ClubSpeed_mph?: number;
  AttackAngle_deg?: number;
  ClubPath_deg?: number;
  ClubFace_deg?: number;
  FaceToPath_deg?: number;

  BallSpeed_mph?: number;
  SmashFactor?: number;

  LaunchAngle_deg?: number;
  LaunchDirection_deg?: number;

  Backspin_rpm?: number;
  Sidespin_rpm?: number;
  SpinRate_rpm?: number;
  SpinRateType?: string;

  SpinAxis_deg?: number;
  ApexHeight_yds?: number;

  CarryDistance_yds?: number;
  CarryDeviationAngle_deg?: number;
  CarryDeviationDistance_yds?: number;

  TotalDistance_yds?: number;
  TotalDeviationAngle_deg?: number;
  TotalDeviationDistance_yds?: number;
};

export type ClubRow = {
  club: string;
  count: number;
  avgCarry: number;
  avgTotal: number;
  sdCarry?: number;   // optional to avoid strict type errors
  avgSmash: number;
  avgSpin: number;
  avgCS: number;
  avgBS: number;
  avgLA: number;
  avgF2P?: number;    // optional face-to-path avg
};

// Club ordering from longest to shortest typical set
const CLUB_ORDER = [
  "Driver",
  "3 Wood", "5 Wood",
  "4 Hybrid", "5 Hybrid", "5 Hybrid (5 Iron)",
  "5 Iron", "6 Iron", "7 Iron", "8 Iron", "9 Iron",
  "Pitching Wedge", "PW", "Gap Wedge", "GW", "Sand Wedge", "SW",
  "60 (LW)", "Lob Wedge", "LW"
];

// Exported ordering helper
export function orderIndex(name: string): number {
  if (!name) return 9999;
  const idx = CLUB_ORDER.findIndex(
    c => c.toLowerCase() === name.toLowerCase()
  );
  if (idx >= 0) return idx;

  // Fallback: try to parse iron number (e.g., "7 Iron")
  const m = name.match(/(\d+)\s*iron/i);
  if (m) {
    const num = parseInt(m[1], 10);
    // map 3-9 iron after woods/hybrids roughly
    return 100 + num;
  }

  // Put unknowns after known set but keep stable
  return 500 + name.toLowerCase().charCodeAt(0);
}

// Simple stats
export function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
export function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, v) => a + (v - m) * (v - m), 0) / arr.length);
}
