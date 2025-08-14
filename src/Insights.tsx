import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label, Cell, LineChart, Line
} from "recharts";
import { Card } from "./components/UI";
import { Theme } from "./theme";
import { Shot, ClubRow, mean, stddev, orderIndex } from "./utils";

/* ========= Props ========= */
type Props = {
  theme: Theme;

  // Dashboard-style rows built from the current selection (used by Distance Distribution)
  tableRows: ClubRow[];

  // Respect all filters EXCEPT club selection (used for Highlights and Gapping Warnings so they don't change with club picker)
  filteredNoClubOutliers: Shot[];

  // Respect ALL filters including club selection (used for PR and Progress; PR special-cases single-club selection)
  filteredOutliers: Shot[];

  // Master list of clubs (for color mapping)
  allClubs: string[];

  // Card order + drag handlers (unchanged)
  insightsOrder: string[];
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
};

/* ========= Helpers ========= */
const carryKey: keyof ClubRow = "avgCarry";
const totalKey: keyof ClubRow = "avgTotal";

function byClubRowsFromShots(shots: Shot[]): ClubRow[] {
  const by = new Map<string, Shot[]>();
  shots.forEach(s => {
    if (!s.Club) return;
    if (!by.has(s.Club)) by.set(s.Club, []);
    by.get(s.Club)!.push(s);
  });
  const rows: ClubRow[] = [];
  for (const [club, arr] of by.entries()) {
    const grab = (sel: (s: Shot) => number | undefined) =>
      arr.map(sel).filter((x): x is number => x !== undefined);
    const carry = grab(s => s.CarryDistance_yds);
    rows.push({
      club,
      count: arr.length,
      avgCarry: carry.length ? mean(carry) : 0,
      avgTotal: (grab(s => s.TotalDistance_yds).length ? mean(grab(s => s.TotalDistance_yds)) : 0),
      sdCarry: carry.length ? stddev(carry) : 0,
      avgSmash: (grab(s => s.SmashFactor).length ? mean(grab(s => s.SmashFactor)) : 0),
      avgSpin: (grab(s => s.SpinRate_rpm).length ? mean(grab(s => s.SpinRate_rpm)) : 0),
      avgCS: (grab(s => s.ClubSpeed_mph).length ? mean(grab(s => s.ClubSpeed_mph)) : 0),
      avgBS: (grab(s => s.BallSpeed_mph).length ? mean(grab(s => s.BallSpeed_mph)) : 0),
      avgLA: (grab(s => s.LaunchAngle_deg).length ? mean(grab(s => s.LaunchAngle_deg)) : 0),
      // Face-to-Path for info panels if needed
      avgF2P: (grab(s => (s.ClubFace_deg != null && s.ClubPath_deg != null)
        ? (s.ClubFace_deg - s.ClubPath_deg)
        : undefined).length
        ? mean(grab(s => (s.ClubFace_deg != null && s.ClubPath_deg != null)
            ? (s.ClubFace_deg - s.ClubPath_deg)
            : undefined))
        : 0),
    });
  }
  // driver -> wedges
  return rows.sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
}

function maxBy<T>(arr: T[], sel: (t: T) => number | undefined): T | undefined {
  let best: T | undefined = undefined;
  let bestVal = -Infinity;
  for (const t of arr) {
    const v = sel(t);
    if (v == null) continue;
    if (v > bestVal) {
      bestVal = v;
      best = t;
    }
  }
  return best;
}

/** Score 0..100 based on smash efficiency across all shots (simple model) */
function efficiencyScore0to100(shots: Shot[]): number {
  const smashes = shots.map(s => s.SmashFactor).filter((x): x is number => x != null);
  if (!smashes.length) return 0;
  const avgSmash = mean(smashes);
  // Map 1.20..1.50 roughly to 0..100
  const norm = Math.max(0, Math.min(1, (avgSmash - 1.20) / (1.50 - 1.20)));
  return Math.round(norm * 100);
}

/* ========= Component ========= */
export default function InsightsView({
  theme,
  tableRows,
  filteredNoClubOutliers,
  filteredOutliers,
  allClubs,
  insightsOrder,
  onDragStart,
  onDragOver,
  onDrop,
}: Props) {
  /* ---------- Colors ---------- */
  // Two-series bars (gap chart-style) — keep stable, matches dashboard convention
  const CARRY_BAR = theme.insightsCarry ?? "#3A86FF"; // blue default
  const TOTAL_BAR = theme.insightsTotal ?? "#2ECC71";  // green default

  // Per-club coloring (same order as Filters)
  const clubColor = (club: string) => {
    const idx = allClubs.findIndex(c => c === club);
    // fallbacks if theme doesn't provide a club palette helper
    const palette =
      theme.clubPalette ||
      ["#006747","#3A86FF","#FFB703","#EF476F","#8E44AD","#2ECC71","#E67E22","#00B8D9","#F94144","#577590"];
    return palette[(idx >= 0 ? idx : 0) % palette.length];
  };

  /* ---------- Datasets ---------- */

  // A) Global rows (ALL CLUBS, ignore club selection) — used for:
  //    - Highlights (longest carry, consistency, efficiency)
  //    - Gapping Warnings (tight/overlap)
  const globalRows: ClubRow[] = useMemo(
    () => byClubRowsFromShots(filteredNoClubOutliers),
    [filteredNoClubOutliers]
  );

  // B) Distance Distribution bars (respect current selection)
  //    Use the incoming tableRows as-is; just ensure consistent ordering.
  const distRows = useMemo(
    () => (tableRows || []).slice().sort((a, b) => orderIndex(a.club) - orderIndex(b.club)),
    [tableRows]
  );

  // C) Single-club detection from current selection
  const selectedClubsSet = useMemo(() => new Set(filteredOutliers.map(s => s.Club)), [filteredOutliers]);
  const singleSelectedClub = useMemo(() => (selectedClubsSet.size === 1 ? Array.from(selectedClubsSet)[0] : null), [selectedClubsSet]);

  // D) Personal Records base:
  //    - If exactly one club selected, compute that club’s PR from ALL shots of that club (ignoring club selector)
  //    - Otherwise, use the current selection (filteredOutliers)
  const prDataset: Shot[] = useMemo(() => {
    if (singleSelectedClub) {
      return filteredNoClubOutliers.filter(s => s.Club === singleSelectedClub);
    }
    return filteredOutliers;
  }, [singleSelectedClub, filteredNoClubOutliers, filteredOutliers]);

  /* ---------- Highlights (global / club-agnostic) ---------- */
  const longestShot = useMemo(
    () => maxBy(filteredNoClubOutliers, s => s.CarryDistance_yds),
    [filteredNoClubOutliers]
  );

  const mostConsistent = useMemo(() => {
    // pick club with lowest carry SD (min 5 shots)
    let best: { club: string; sd: number; n: number } | null = null;
    for (const r of globalRows) {
      if (r.count < 5) continue;
      if (best == null || r.sdCarry < best.sd) {
        best = { club: r.club, sd: r.sdCarry, n: r.count };
      }
    }
    return best;
  }, [globalRows]);

  const efficiencyScore = useMemo(
    () => efficiencyScore0to100(filteredNoClubOutliers),
    [filteredNoClubOutliers]
  );

  /* ---------- Gapping Warnings (global / club-agnostic) ---------- */
  const gapWarnings = useMemo(() => {
    const rows = globalRows;
    const warnings: { tight: string[]; overlap: string[] } = { tight: [], overlap: [] };
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (!a.avgCarry || !b.avgCarry) continue;
      const diff = b.avgCarry - a.avgCarry; // since rows are sorted driver -> wedges, b is the "shorter" club
      if (diff < 0) {
        warnings.overlap.push(`${a.club} / ${b.club}`);
      } else if (diff < 12) {
        warnings.tight.push(`${a.club} / ${b.club} (${diff.toFixed(1)} yds)`);
      }
    }
    return warnings;
  }, [globalRows]);

  /* ---------- Personal Records (PR) based on prDataset ---------- */
  const prCarry = useMemo(() => maxBy(prDataset, s => s.CarryDistance_yds), [prDataset]);
  const prTotal = useMemo(() => maxBy(prDataset, s => s.TotalDistance_yds), [prDataset]);

  // Progress series (respect current selection; if single club, clearer)
  const progressSeries = useMemo(() => {
    const arr = filteredOutliers
      .filter(s => (singleSelectedClub ? s.Club === singleSelectedClub : true))
      .filter(s => s.Timestamp && s.CarryDistance_yds != null)
      .slice()
      .sort((a, b) => new Date(a.Timestamp!).getTime() - new Date(b.Timestamp!).getTime())
      .map(s => ({ time: new Date(s.Timestamp!).toLocaleString(), carry: s.CarryDistance_yds!, club: s.Club }));
    return arr;
  }, [filteredOutliers, singleSelectedClub]);

  /* ---------- Cards ---------- */
  const renderDistanceDistribution = () => (
    <Card title="Distance Distribution (by Club)">
      <div style={{ width: "100%", height: 360 }}>
        <ResponsiveContainer>
          <BarChart data={distRows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="club" />
            <YAxis />
            <Tooltip
              formatter={(v: any, n: any) => [typeof v === "number" ? v.toFixed(n === "avgSmash" ? 3 : 1) : v, n === "avgCarry" ? "Carry (avg)" : n === "avgTotal" ? "Total (avg)" : n]}
            />
            <Legend />
            {/* Carry — per-club color */}
            <Bar dataKey={carryKey} name="Carry (avg)">
              {distRows.map((r, i) => (
                <Cell key={`c-${r.club}-${i}`} fill={clubColor(r.club)} />
              ))}
            </Bar>
            {/* Total — single, consistent color */}
            <Bar dataKey={totalKey} name="Total (avg)" fill={TOTAL_BAR} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );

  const renderHighlights = () => (
    <Card title="Highlights (All Clubs)">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-slate-500">Longest Carry</div>
          <div className="mt-1 text-lg font-semibold">
            {longestShot?.CarryDistance_yds != null
              ? `${longestShot.CarryDistance_yds.toFixed(1)} yds`
              : "-"}
            {longestShot?.Club ? ` (${longestShot.Club})` : ""}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Most Consistent Club</div>
          <div className="mt-1 text-lg font-semibold">
            {mostConsistent ? `${mostConsistent.club} — SD ${mostConsistent.sd.toFixed(1)} (${mostConsistent.n} shots)` : "-"}
          </div>
        </div>
        <div title="Efficiency is a simple 0–100 score based on average Smash Factor across all shots (≈1.20→0, 1.50→100).">
          <div className="text-slate-500">Efficiency Score</div>
          <div className="mt-1 text-lg font-semibold">{efficiencyScore}</div>
        </div>
      </div>
    </Card>
  );

  const renderWarnings = () => (
    <Card title="Gapping Warnings (All Clubs)">
      <div className="text-sm space-y-2">
        <div>
          <div className="font-semibold mb-1">Tight Gaps (&lt; 12 yds)</div>
          {gapWarnings.tight.length ? (
            <ul className="list-disc pl-5">
              {gapWarnings.tight.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          ) : (
            <div className="text-slate-500">None detected.</div>
          )}
        </div>
        <div>
          <div className="font-semibold mb-1">Overlaps / Out-of-Order</div>
          {gapWarnings.overlap.length ? (
            <ul className="list-disc pl-5">
              {gapWarnings.overlap.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          ) : (
            <div className="text-slate-500">None detected.</div>
          )}
        </div>
      </div>
    </Card>
  );

  const renderPersonalRecords = () => (
    <Card title={`Personal Records${singleSelectedClub ? ` — ${singleSelectedClub}` : ""}`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-slate-500">PR Carry</div>
          <div className="mt-1 text-lg font-semibold">
            {prCarry?.CarryDistance_yds != null ? `${prCarry.CarryDistance_yds.toFixed(1)} yds` : "-"}
            {prCarry?.Club && !singleSelectedClub ? ` (${prCarry.Club})` : ""}
          </div>
        </div>
        <div>
          <div className="text-slate-500">PR Total</div>
          <div className="mt-1 text-lg font-semibold">
            {prTotal?.TotalDistance_yds != null ? `${prTotal.TotalDistance_yds.toFixed(1)} yds` : "-"}
            {prTotal?.Club && !singleSelectedClub ? ` (${prTotal.Club})` : ""}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Progress (by Carry)</div>
          <div className="mt-2" style={{ width: "100%", height: 100 }}>
            <ResponsiveContainer>
              <LineChart data={progressSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" hide />
                <YAxis hide />
                <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)} yds`, "Carry"]} />
                <Line type="monotone" dataKey="carry" stroke={theme.brand} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Card>
  );

  const renderWeaknesses = () => {
    // Simple heuristic over all clubs: lowest avg smash or excessive spin
    const rows = globalRows;
    let lowSmash: ClubRow | undefined;
    let highSpin: ClubRow | undefined;
    for (const r of rows) {
      if (!lowSmash || r.avgSmash < lowSmash.avgSmash) lowSmash = r;
      if (!highSpin || r.avgSpin > highSpin.avgSpin) highSpin = r;
    }
    return (
      <Card title="Biggest Weakness (All Clubs — heuristic)">
        <div className="text-sm space-y-2">
          <div>
            <span className="font-semibold">Low Smash:</span>{" "}
            {lowSmash ? `${lowSmash.club} (${lowSmash.avgSmash.toFixed(3)})` : "-"}
          </div>
          <div>
            <span className="font-semibold">High Spin:</span>{" "}
            {highSpin ? `${highSpin.club} (${Math.round(highSpin.avgSpin)} rpm)` : "-"}
          </div>
          <div className="text-slate-500">
            Tip: low smash → centered contact and face/path; high spin → loft/deloft, strike, ball, or head loft.
          </div>
        </div>
      </Card>
    );
  };

  /* ---------- Render ordered cards ---------- */
  const renderByKey = (k: string) => {
    switch (k) {
      case "distanceBox": return renderDistanceDistribution();
      case "highlights": return renderHighlights();
      case "warnings": return renderWarnings();
      case "personalRecords": return renderPersonalRecords();
      case "progress": return renderPersonalRecords(); // progress is shown inside PR; keep key for order compatibility
      case "weaknesses": return renderWeaknesses();
      default: return null;
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      {insightsOrder.map((k) => (
        <div
          key={k}
          draggable
          onDragStart={onDragStart(k)}
          onDragOver={onDragOver(k)}
          onDrop={onDrop(k)}
        >
          {renderByKey(k)}
        </div>
      ))}
    </div>
  );
}
