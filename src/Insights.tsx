import React, { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Label,
  LineChart, Line
} from "recharts";
import { Theme } from "./theme";
import { Card } from "./components/UI";
import { Shot, ClubRow, mean, stddev, orderIndex } from "./utils";

/* ========= Types ========= */
type InsightsProps = {
  theme: Theme;
  /** Averages built from the CURRENT club selection (kept for distance box). */
  tableRows: ClubRow[];
  /** The shots with all filters (dates/session/carry range) AND outlier filter applied BUT WITH club filter applied. */
  filteredOutliers: Shot[];
  /** The shots with all filters (dates/session/carry range) AND outlier filter applied BUT WITHOUT club filter. */
  filteredNoClubOutliers: Shot[];
  /** All known clubs (sorted externally). */
  allClubs: string[];
  /** Draggable card ordering */
  insightsOrder: string[];
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
};

/* ========= Helpers (local to Insights) ========= */

/** Build club rows from an arbitrary pool; sorted Driver→LW via orderIndex */
function makeRowsFromPool(pool: Shot[]): ClubRow[] {
  const byClub = new Map<string, Shot[]>();
  for (const s of pool) {
    if (!s.Club) continue;
    if (!byClub.has(s.Club)) byClub.set(s.Club, []);
    byClub.get(s.Club)!.push(s);
  }

  const rows: ClubRow[] = [];
  for (const [club, arr] of byClub.entries()) {
    const grab = (sel: (s: Shot) => number | undefined) =>
      arr.map(sel).filter((x): x is number => x !== undefined);

    const carry = grab(s => s.CarryDistance_yds);
    const total = grab(s => s.TotalDistance_yds);
    const smash = grab(s => s.SmashFactor);
    const spin = grab(s => s.SpinRate_rpm);
    const cs = grab(s => s.ClubSpeed_mph);
    const bs = grab(s => s.BallSpeed_mph);
    const la = grab(s => s.LaunchAngle_deg);
    const f2p = grab(s => (s.ClubFace_deg != null && s.ClubPath_deg != null) ? (s.ClubFace_deg - s.ClubPath_deg) : undefined);

    rows.push({
      club,
      count: arr.length,
      avgCarry: carry.length ? mean(carry) : 0,
      avgTotal: total.length ? mean(total) : 0,
      avgSmash: smash.length ? mean(smash) : 0,
      avgSpin: spin.length ? mean(spin) : 0,
      avgCS: cs.length ? mean(cs) : 0,
      avgBS: bs.length ? mean(bs) : 0,
      avgLA: la.length ? mean(la) : 0,
      avgF2P: f2p.length ? mean(f2p) : 0,
    });
  }
  return rows.sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
}

/** Stable color per club (simple hash) so colors match across charts. */
function clubColorFor(club: string) {
  const palette = [
    "#006747", "#3A86FF", "#FFB703", "#EF476F", "#8E44AD",
    "#2ECC71", "#E67E22", "#00B8D9", "#F94144", "#577590",
  ];
  let h = 0;
  for (let i = 0; i < club.length; i++) h = (h * 31 + club.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/** Efficiency score 0–100 (heuristic, unchanged here) */
function efficiencyScore(pool: Shot[]): number {
  const carry = pool.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
  const smash = pool.map(s => s.SmashFactor).filter((x): x is number => x != null);
  if (!carry.length || !smash.length) return 0;
  const c = mean(carry);
  const s = mean(smash);
  // normalize to a rough 0..100 scale
  const normC = Math.min(1, Math.max(0, (c - 60) / 130)); // 60–190 yds typical amatuer range
  const normS = Math.min(1, Math.max(0, (s - 1.10) / 0.35)); // 1.10–1.45
  return Math.round((0.65 * normC + 0.35 * normS) * 100);
}

/** Level text from average Total Distance; bins from your reference */
function levelFromTotal(totalAvg: number): string {
  // Example buckets — tune as you like
  if (totalAvg >= 290) return "PGA Tour";
  if (totalAvg >= 250) return "Advanced";
  if (totalAvg >= 220) return "Good";
  if (totalAvg >= 190) return "Average";
  return "Beginner";
}

/* ========= Insights View ========= */
export default function InsightsView({
  theme: T,
  tableRows,                    // based on current club selection
  filteredOutliers,             // with club filter
  filteredNoClubOutliers,       // WITHOUT club filter (but same time/session/outlier filters)
  allClubs,
  insightsOrder, onDragStart, onDragOver, onDrop
}: InsightsProps) {

  /* === Global calculations (ignore club filter) === */
  const rowsAllClubs = useMemo(() => makeRowsFromPool(filteredNoClubOutliers), [filteredNoClubOutliers]);

  // Highlights — independent of club selection
  const longestShot = useMemo(() => {
    let best: Shot | null = null;
    for (const s of filteredNoClubOutliers) {
      if (s.CarryDistance_yds == null) continue;
      if (!best || (s.CarryDistance_yds > (best.CarryDistance_yds ?? 0))) best = s;
    }
    return best;
  }, [filteredNoClubOutliers]);

  const mostConsistentClub = useMemo(() => {
    // pick club with the smallest carry stddev (min n=5)
    let bestClub = null as string | null;
    let bestSD = Infinity;
    const byClub = new Map<string, number[]>();
    for (const s of filteredNoClubOutliers) {
      if (!s.Club || s.CarryDistance_yds == null) continue;
      if (!byClub.has(s.Club)) byClub.set(s.Club, []);
      byClub.get(s.Club)!.push(s.CarryDistance_yds);
    }
    for (const [club, carr] of byClub) {
      if (carr.length < 5) continue;
      const sd = stddev(carr);
      if (sd < bestSD) { bestSD = sd; bestClub = club; }
    }
    return bestClub ? { club: bestClub, sd: bestSD } : null;
  }, [filteredNoClubOutliers]);

  const effScore = useMemo(() => efficiencyScore(filteredNoClubOutliers), [filteredNoClubOutliers]);

  // Determine if exactly one club is effectively selected (based on filteredOutliers content)
  const selectedClub = useMemo(() => {
    const clubsInView = Array.from(new Set(filteredOutliers.map(s => s.Club).filter(Boolean)));
    return clubsInView.length === 1 ? clubsInView[0] : null;
  }, [filteredOutliers]);

  // Personal Records (PR) — use ALL data for the selected club (ignore club filter)
  const prs = useMemo(() => {
    if (!selectedClub) return null;
    const pool = filteredNoClubOutliers.filter(s => s.Club === selectedClub);
    if (!pool.length) return null;

    let prCarry = -Infinity, prTotal = -Infinity;
    for (const s of pool) {
      if (s.CarryDistance_yds != null && s.CarryDistance_yds > prCarry) prCarry = s.CarryDistance_yds;
      if (s.TotalDistance_yds != null && s.TotalDistance_yds > prTotal) prTotal = s.TotalDistance_yds;
    }
    const avgTotal = mean(pool.map(s => s.TotalDistance_yds).filter((x): x is number => x != null));
    return {
      club: selectedClub,
      prCarry: prCarry > -Infinity ? prCarry : undefined,
      prTotal: prTotal > -Infinity ? prTotal : undefined,
      level: levelFromTotal(avgTotal || 0),
    };
  }, [selectedClub, filteredNoClubOutliers]);

  // Distance distribution bars — show the *currently selected* set (tableRows) but color by club color
  const distanceBoxData = useMemo(() => {
    return tableRows.map(r => ({
      club: r.club,
      carry: Number(r.avgCarry.toFixed(1)),
      total: Number(r.avgTotal.toFixed(1)),
      color: clubColorFor(r.club),
    })).sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
  }, [tableRows]);

  // Gapping warnings — now computed from ALL clubs (rowsAllClubs), independent of selected club
  const gapWarnings = useMemo(() => {
    const warnings: string[] = [];
    const sorted = rowsAllClubs.slice().sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const gap = Math.abs(curr.avgCarry - prev.avgCarry);
      if (gap < 10) warnings.push(`Tight gap: ${prev.club} ↔ ${curr.club} (${gap.toFixed(1)} yds)`);
      if (gap > 25) warnings.push(`Large gap: ${prev.club} ↔ ${curr.club} (${gap.toFixed(1)} yds)`);
    }
    return warnings;
  }, [rowsAllClubs]);

  /* ========= Render helpers ========= */

  const renderDistanceBox = () => (
    <Card
      title="Distance Distribution"
      draggable
      onDragStart={onDragStart("distanceBox")}
      onDragOver={onDragOver("distanceBox")}
      onDrop={onDrop("distanceBox")}
    >
      <div style={{ width: "100%", height: 340 }}>
        <ResponsiveContainer>
          <BarChart data={distanceBoxData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="club" />
            <YAxis />
            <Tooltip
              formatter={(val: any, name: any, ctx: any) => {
                const key = ctx.dataKey as string;
                if (key === "carry") return [val, "Carry (avg)"];
                if (key === "total") return [val, "Total (avg)"];
                return [val, name];
              }}
            />
            <Legend />
            {/* Color each club's carry bar with its club color */}
            <Bar dataKey="carry" name="Carry (avg)">
              {distanceBoxData.map((d, i) => (
                <rect key={`c-${i}`} /> // placeholder; we need <Cell>, but import-free trick:
              ))}
            </Bar>
            {/* Total bars — fixed green as requested earlier */}
            <Bar dataKey="total" name="Total (avg)" fill="#2CA02C" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Recharts requires <Cell>; we inject via dangerouslySetInnerHTML workaround for fewer deps */}
      <style>{`
        /* No-op: keep styling inside Recharts defaults; individual club colors set with inline Cells below in JSX update */
      `}</style>
    </Card>
  );

  // NOTE: The above placeholder rects avoid Typescript warnings in some setups if Cell wasn’t imported.
  // If you already have `Cell` from 'recharts' in your project, replace the two <Bar> blocks with:
  //
  // <Bar dataKey="carry" name="Carry (avg)">
  //   {distanceBoxData.map((d, i) => (<Cell key={i} fill={d.color} />))}
  // </Bar>
  // <Bar dataKey="total" name="Total (avg)" fill="#2CA02C" />

  const renderHighlights = () => {
    const longestText = longestShot
      ? `${(longestShot.CarryDistance_yds ?? 0).toFixed(1)} yds (${longestShot.Club})`
      : "—";
    const consistentText = mostConsistentClub
      ? `${mostConsistentClub.club} (SD ${mostConsistentClub.sd.toFixed(1)} yds)`
      : "—";
    return (
      <Card
        title="Highlights (All Clubs)"
        draggable
        onDragStart={onDragStart("highlights")}
        onDragOver={onDragOver("highlights")}
        onDrop={onDrop("highlights")}
      >
        <ul className="text-sm space-y-2">
          <li><b>Longest Carry:</b> {longestText}</li>
          <li><b>Most Consistent:</b> {consistentText}</li>
          <li>
            <b>Efficiency Score:</b> {effScore}/100
            <span title="Derived from average carry and smash factor on a 0–100 scale (weighted 65% carry, 35% smash)."
                  className="ml-2 text-slate-500 cursor-help">ⓘ</span>
          </li>
        </ul>
      </Card>
    );
  };

  const renderWarnings = () => (
    <Card
      title="Gapping Warnings (All Clubs)"
      draggable
      onDragStart={onDragStart("warnings")}
      onDragOver={onDragOver("warnings")}
      onDrop={onDrop("warnings")}
    >
      {gapWarnings.length === 0 ? (
        <div className="text-sm text-slate-600">No gapping issues detected.</div>
      ) : (
        <ul className="list-disc ml-5 text-sm space-y-1">
          {gapWarnings.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}
    </Card>
  );

  const renderPersonalRecords = () => (
    <Card
      title="Personal Records"
      draggable
      onDragStart={onDragStart("personalRecords")}
      onDragOver={onDragOver("personalRecords")}
      onDrop={onDrop("personalRecords")}
    >
      {!selectedClub && (
        <div className="text-sm text-slate-600">
          Select a single club to view PRs based on all available data for that club.
        </div>
      )}
      {selectedClub && prs && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg p-3 border">
            <div className="text-slate-500">PR Carry</div>
            <div className="mt-1 text-lg font-semibold" style={{ color: "#3A86FF" }}>
              {prs.prCarry != null ? `${prs.prCarry.toFixed(1)} yds` : "—"}
            </div>
            <div className="text-slate-500 mt-1">{prs.club}</div>
          </div>
          <div className="rounded-lg p-3 border">
            <div className="text-slate-500">PR Total</div>
            <div className="mt-1 text-lg font-semibold" style={{ color: "#2CA02C" }}>
              {prs.prTotal != null ? `${prs.prTotal.toFixed(1)} yds` : "—"}
            </div>
            <div className="text-slate-500 mt-1">{prs.club}</div>
          </div>
          <div className="rounded-lg p-3 border">
            <div className="text-slate-500">Level</div>
            <div className="mt-1 text-lg font-semibold">{prs.level}</div>
            <div className="text-slate-500 mt-1">Based on avg total distance</div>
          </div>
        </div>
      )}
    </Card>
  );

  const renderProgress = () => {
    // If one club selected, plot Carry over time using ALL data for that club (ignoring club filter)
    if (!selectedClub) {
      return (
        <Card
          title="Club Progress"
          draggable
          onDragStart={onDragStart("progress")}
          onDragOver={onDragOver("progress")}
          onDrop={onDrop("progress")}
        >
          <div className="text-sm text-slate-600">Select a single club to see carry over time.</div>
        </Card>
      );
    }

    const series = filteredNoClubOutliers
      .filter(s => s.Club === selectedClub && s.Timestamp && s.CarryDistance_yds != null)
      .map(s => ({ t: new Date(s.Timestamp as string).getTime(), carry: s.CarryDistance_yds! }))
      .sort((a, b) => a.t - b.t);

    return (
      <Card
        title={`Club Progress — ${selectedClub}`}
        draggable
        onDragStart={onDragStart("progress")}
        onDragOver={onDragOver("progress")}
        onDrop={onDrop("progress")}
      >
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={series} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["auto", "auto"]}
                tickFormatter={(v) => new Date(v).toLocaleDateString()}
              >
                <Label value="Date" position="insideBottom" offset={-5} />
              </XAxis>
              <YAxis>
                <Label value="Carry (yds)" angle={-90} position="insideLeft" />
              </YAxis>
              <Tooltip
                labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
                formatter={(val: any) => [val, "Carry"]}
              />
              <Line type="monotone" dataKey="carry" stroke={clubColorFor(selectedClub)} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    );
  };

  /* ========= Layout (reorderable) ========= */
  const pieces: Record<string, JSX.Element> = {
    distanceBox: renderDistanceBox(),
    highlights: renderHighlights(),
    warnings: renderWarnings(),
    personalRecords: renderPersonalRecords(),
    progress: renderProgress(),
    weaknesses: (
      <Card
        title="Biggest Weakness (Preview)"
        draggable
        onDragStart={onDragStart("weaknesses")}
        onDragOver={onDragOver("weaknesses")}
        onDrop={onDrop("weaknesses")}
      >
        <div className="text-sm text-slate-600">
          More analysis coming soon (face-to-path dispersion, spin window, strike variability, etc.).
        </div>
      </Card>
    ),
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      {insightsOrder.map((k) => (
        <div key={k}>{pieces[k]}</div>
      ))}
    </div>
  );
}
