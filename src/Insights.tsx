import React, { useMemo, useState } from "react";
import { Theme } from "./theme";
import { Shot, ClubRow, mean, stddev, orderIndex, clubColor } from "./utils";
import { Card, InfoTooltip, Modal } from "./components/UI";
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip as RTooltip, Legend,
  ResponsiveContainer, LabelList, Cell
} from "recharts";

/** Benchmarks for proficiency modal (carry, yds). Adjust to your reference */
const BENCHMARKS: Record<string, { Beginner: number; Average: number; Good: number; Advanced: number; PGA: number }> = {
  "Driver": { Beginner: 180, Average: 210, Good: 240, Advanced: 270, PGA: 295 },
  "3 Wood": { Beginner: 160, Average: 190, Good: 215, Advanced: 240, PGA: 260 },
  "4 Hybrid": { Beginner: 150, Average: 175, Good: 195, Advanced: 210, PGA: 225 },
  "5 Hybrid (5 Iron)": { Beginner: 140, Average: 165, Good: 185, Advanced: 200, PGA: 215 },
  "6 Iron": { Beginner: 130, Average: 155, Good: 175, Advanced: 190, PGA: 205 },
  "7 Iron": { Beginner: 120, Average: 145, Good: 165, Advanced: 180, PGA: 195 },
  "8 Iron": { Beginner: 110, Average: 135, Good: 155, Advanced: 170, PGA: 185 },
  "9 Iron": { Beginner: 100, Average: 125, Good: 145, Advanced: 160, PGA: 175 },
  "Pitching Wedge": { Beginner: 90, Average: 115, Good: 135, Advanced: 150, PGA: 165 },
  "60 (LW)": { Beginner: 60, Average: 80, Good: 95, Advanced: 105, PGA: 115 },
};

/** Palette helper */
const lighten = (hex: string, amt = 0.35) => {
  try {
    const n = hex.replace("#", "");
    const num = parseInt(n, 16);
    const r = Math.min(255, Math.round(((num >> 16) & 255) + 255 * amt));
    const g = Math.min(255, Math.round(((num >> 8) & 255) + 255 * amt));
    const b = Math.min(255, Math.round((num & 255) + 255 * amt));
    return `rgb(${r}, ${g}, ${b})`;
  } catch { return hex; }
};

type Props = {
  theme: Theme;
  tableRows: ClubRow[];                   // selection-aware rows
  filteredOutliers: Shot[];               // selection-aware pool
  filteredNoClubOutliers: Shot[];         // selection-independent pool
  allClubs: string[];
  insightsOrder: string[];
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
};

/** Build distance rows for chart */
function buildDistanceRows(rows: ClubRow[]) {
  return rows
    .slice()
    .sort((a, b) => orderIndex(a.club) - orderIndex(b.club))
    .map((r) => ({
      club: r.club,
      carry: Number.isFinite(r.avgCarry) ? Number(r.avgCarry.toFixed(1)) : 0,
      total: Number.isFinite(r.avgTotal) ? Number(r.avgTotal.toFixed(1)) : 0,
      color: clubColor(r.club),
      totalColor: lighten(clubColor(r.club)),
    }));
}

/** Gapping analysis on a pool (independent of the club filter for global warnings) */
function computeGaps(pool: Shot[]) {
  const map = new Map<string, number[]>();
  for (const s of pool) {
    if (s.Club && s.CarryDistance_yds != null) {
      if (!map.has(s.Club)) map.set(s.Club, []);
      map.get(s.Club)!.push(s.CarryDistance_yds);
    }
  }
  const rows = Array.from(map.entries())
    .map(([club, arr]) => ({ club, avgCarry: mean(arr) }))
    .sort((a, b) => orderIndex(a.club) - orderIndex(b.club));

  const warnings: { pair: string; gap: number }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const gap = Math.abs(rows[i].avgCarry - rows[i - 1].avgCarry);
    if (gap < 12) warnings.push({ pair: `${rows[i - 1].club} → ${rows[i].club}`, gap });
  }
  const tightClubs = warnings.length;
  return { warnings, tightClubs, rows };
}

/** Efficiency score 0–100 across a pool (selection-independent when called with filteredNoClubOutliers) */
function efficiencyScore(pool: Shot[]) {
  if (!pool.length) return 0;
  const smash = pool.map((s) => s.SmashFactor).filter((x): x is number => x != null);
  const f2p = pool
    .map((s) => (s.ClubFace_deg != null && s.ClubPath_deg != null ? s.ClubFace_deg - s.ClubPath_deg : undefined))
    .filter((x): x is number => x != null);

  const smashScore = smash.length ? Math.max(0, Math.min(1, mean(smash) / 1.50)) : 0;
  const faceScore = f2p.length ? Math.max(0, 1 - Math.min(1, mean(f2p.map((v) => Math.abs(v))) / 5)) : 0;
  const score = Math.round((0.7 * smashScore + 0.3 * faceScore) * 100);
  return score;
}

/** Proficiency (by total distance) using benchmarks */
function proficiencyForClub(club: string, total: number) {
  const b = BENCHMARKS[club];
  if (!b) return { level: "N/A", color: "#94a3b8" };
  if (total >= b.PGA) return { level: "PGA Tour", color: "#0ea5e9" };
  if (total >= b.Advanced) return { level: "Advanced", color: "#22c55e" };
  if (total >= b.Good) return { level: "Good", color: "#a3e635" };
  if (total >= b.Average) return { level: "Average", color: "#f59e0b" };
  return { level: "Beginner", color: "#ef4444" };
}

export default function InsightsView({
  theme,
  tableRows,
  filteredOutliers,
  filteredNoClubOutliers,
  allClubs,
  insightsOrder,
  onDragStart,
  onDragOver,
  onDrop,
}: Props) {
  const [showProfModal, setShowProfModal] = useState(false);

  /* Distance distribution (selection-aware) */
  const distRows = useMemo(() => buildDistanceRows(tableRows), [tableRows]);

  /* Highlights (selection-independent) */
  const longest = useMemo(() => {
    let best: { club: string; carry: number; total?: number } | null = null;
    for (const s of filteredNoClubOutliers) {
      if (s.CarryDistance_yds != null) {
        if (!best || s.CarryDistance_yds > best.carry) {
          best = { club: s.Club, carry: s.CarryDistance_yds, total: s.TotalDistance_yds };
        }
      }
    }
    return best;
  }, [filteredNoClubOutliers]);

  const mostConsistent = useMemo(() => {
    const map = new Map<string, number[]>();
    filteredNoClubOutliers.forEach((s) => {
      if (s.Club && s.CarryDistance_yds != null) {
        if (!map.has(s.Club)) map.set(s.Club, []);
        map.get(s.Club)!.push(s.CarryDistance_yds);
      }
    });
    let best: { club: string; sd: number; n: number } | null = null;
    for (const [club, arr] of map.entries()) {
      if (arr.length < 8) continue;
      const sd = stddev(arr);
      if (!best || sd < best.sd) best = { club, sd, n: arr.length };
    }
    return best;
  }, [filteredNoClubOutliers]);

  const effScore = useMemo(() => efficiencyScore(filteredNoClubOutliers), [filteredNoClubOutliers]);

  /* Gaps (selection-independent) */
  const gaps = useMemo(() => computeGaps(filteredNoClubOutliers), [filteredNoClubOutliers]);

  /* Proficiency text (selection-aware: take the first club in distRows as context) */
  const prof = useMemo(() => {
    const first = distRows[0];
    if (!first) return { club: "", level: "N/A", color: "#94a3b8" };
    const avgTotal = first.total;
    const p = proficiencyForClub(first.club, avgTotal);
    return { club: first.club, ...p };
  }, [distRows]);

  /* Cards map (draggable) */
  const CARDS: Record<string, { title: string; render: () => React.ReactNode }> = {
    distanceBox: {
      title: "Distance Distribution (by Club)",
      render: () => (
        <Card
          theme={theme}
          title="Distance Distribution (by Club)"
          draggableKey="distanceBox"
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          actions={
            <InfoTooltip theme={theme} label={<span className="text-xs underline decoration-dotted">What am I seeing?</span>}>
              Each row shows average <b>Carry</b> and <b>Total</b> distance by club (current selection).
              Bars adopt your club colors; hover to see values.
            </InfoTooltip>
          }
        >
          <div style={{ width: "100%", height: 380, background: theme.dispBg }}>
            <ResponsiveContainer>
              <BarChart data={distRows} margin={{ left: 20, right: 20, top: 10, bottom: 10 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="club" width={140} />
                <RTooltip formatter={(v: any, n: any) => [`${v} yds`, n]} labelFormatter={() => ""} />
                <Legend />
                <Bar dataKey="carry" name="Carry" isAnimationActive={false} radius={[0, 6, 6, 0]} fillOpacity={0.95}>
                  {distRows.map((d, i) => (
                    <Cell key={`c-${i}`} fill={d.color} />
                  ))}
                  <LabelList dataKey="carry" position="insideRight" formatter={(v: any) => `${v}`} />
                </Bar>
                <Bar dataKey="total" name="Total" isAnimationActive={false} radius={[0, 6, 6, 0]}>
                  {distRows.map((d, i) => (
                    <Cell key={`t-${i}`} fill={d.totalColor} />
                  ))}
                  <LabelList dataKey="total" position="right" formatter={(v: any) => `${v}`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ),
    },

    highlights: {
      title: "Highlights",
      render: () => (
        <Card
          theme={theme}
          title="Highlights"
          draggableKey="highlights"
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          actions={
            <InfoTooltip theme={theme} label={<span className="text-xs underline decoration-dotted">How is efficiency scored?</span>}>
              The Efficiency Score combines <b>Smash Factor</b> (target ≈ 1.50) and <b>Face-to-Path</b> consistency.
              A perfect 100 indicates high energy transfer and centered face-path alignment over your data (all sessions).
            </InfoTooltip>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-xs text-slate-500 mb-1">Longest Carry</div>
              <div className="text-lg font-semibold" style={{ color: theme.brand }}>
                {longest ? `${longest.carry.toFixed(1)} yds` : "-"}
              </div>
              <div className="text-xs text-slate-500">{longest ? `(${longest.club})` : ""}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Most Consistent (Carry SD)</div>
              <div className="text-lg font-semibold">
                {mostConsistent ? `${mostConsistent.sd.toFixed(1)} yds` : "-"}
              </div>
              <div className="text-xs text-slate-500">
                {mostConsistent ? `${mostConsistent.club} • n=${mostConsistent.n}` : ""}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Efficiency Score</div>
              <div className="text-lg font-semibold">{effScore}/100</div>
            </div>
          </div>
        </Card>
      ),
    },

    warnings: {
      title: "Gapping Warnings (All Clubs)",
      render: () => (
        <Card
          theme={theme}
          title="Gapping Warnings (All Clubs)"
          draggableKey="warnings"
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          actions={
            <InfoTooltip theme={theme} label={<span className="text-xs underline decoration-dotted">What is a tight gap?</span>}>
              We compute average carry per club using <b>all sessions</b>, ignoring current club filters.
              Adjacent clubs with less than <b>12 yards</b> separation are flagged here.
            </InfoTooltip>
          }
        >
          <div className="text-sm">
            <div className="mb-2">
              <b>{gaps.tightClubs}</b> tight gap{gaps.tightClubs === 1 ? "" : "s"} detected.
            </div>
            <ul className="list-disc pl-5 space-y-1">
              {gaps.warnings.length ? (
                gaps.warnings.map((w, i) => (
                  <li key={i}>
                    {w.pair}: <span className="font-medium">{w.gap.toFixed(1)} yds</span>
                  </li>
                ))
              ) : (
                <li>No tight gaps detected.</li>
              )}
            </ul>
          </div>
        </Card>
      ),
    },

    personalRecords: {
      title: "Personal Records & Proficiency",
      render: () => (
        <Card
          theme={theme}
          title="Personal Records & Proficiency"
          draggableKey="personalRecords"
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          actions={
            <div className="flex items-center gap-2">
              <InfoTooltip theme={theme} label={<span className="text-xs underline decoration-dotted">Proficiency levels?</span>}>
                Proficiency compares your <b>Total</b> distance to reference ranges by skill level (Beginner → PGA Tour).
                Click “View chart” to see the club-by-club benchmarks.
              </InfoTooltip>
              <button onClick={() => setShowProfModal(true)} className="px-2 py-1 rounded text-xs border" style={{ borderColor: theme.cardBorder }}>
                View chart
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-xs text-slate-500 mb-1">PR Carry</div>
              <div className="text-lg font-semibold" style={{ color: "#3B82F6" }}>
                {Math.max(...distRows.map((d) => d.carry), 0).toFixed(1)} yds
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">PR Total</div>
              <div className="text-lg font-semibold" style={{ color: "#10B981" }}>
                {Math.max(...distRows.map((d) => d.total), 0).toFixed(1)} yds
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Proficiency</div>
              <div className="text-lg font-semibold" style={{ color: prof.color }}>
                {prof.level} <span className="text-xs text-slate-500">({prof.club})</span>
              </div>
            </div>
          </div>

          <Modal
            open={showProfModal}
            onClose={() => setShowProfModal(false)}
            title="Average Club Distances by Skill Levels (Carry, yds)"
            theme={theme}
          >
            <div style={{ width: "100%", height: 520 }}>
              <ResponsiveContainer>
                <BarChart
                  data={Object.keys(BENCHMARKS)
                    .sort((a, b) => orderIndex(a) - orderIndex(b))
                    .map((club) => ({ club, ...BENCHMARKS[club] }))}
                  layout="vertical"
                  margin={{ left: 140, right: 10, top: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="club" type="category" width={140} />
                  <Legend />
                  <RTooltip />
                  <Bar dataKey="Beginner" fill="#ef4444" />
                  <Bar dataKey="Average" fill="#f59e0b" />
                  <Bar dataKey="Good" fill="#a3e635" />
                  <Bar dataKey="Advanced" fill="#22c55e" />
                  <Bar dataKey="PGA" fill="#0ea5e9" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Modal>
        </Card>
      ),
    },

    // Placeholder row for future progress card
    progress: {
      title: "Club Progress (Distance Over Time)",
      render: () => (
        <Card
          theme={theme}
          title="Club Progress (Distance Over Time)"
          draggableKey="progress"
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <div className="text-sm text-slate-500">
            Tip: filter to one club to see a clear distance trend. (This card will render your line chart when ready.)
          </div>
        </Card>
      ),
    },

    weaknesses: {
      title: "Biggest Weakness (All Clubs)",
      render: () => {
        const by = new Map<string, number[]>();
        filteredNoClubOutliers.forEach((s) => {
          const f2p =
            s.ClubFace_deg != null && s.ClubPath_deg != null
              ? s.ClubFace_deg - s.ClubPath_deg
              : undefined;
          if (s.Club && f2p != null) {
            if (!by.has(s.Club)) by.set(s.Club, []);
            by.get(s.Club)!.push(Math.abs(f2p));
          }
        });
        let worst: { club: string; val: number } | null = null;
        for (const [club, arr] of by.entries()) {
          if (!arr.length) continue;
          const v = mean(arr);
          if (!worst || v > worst.val) worst = { club, val: v };
        }
        return (
          <Card
            theme={theme}
            title="Biggest Weakness (Face-to-Path)"
            draggableKey="weaknesses"
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <div className="text-sm">
              {worst ? (
                <>
                  Highest average face-to-path error: <b>{worst.club}</b>{" "}
                  <span className="text-slate-500">({worst.val.toFixed(2)}°)</span>
                </>
              ) : (
                "No face-to-path data available."
              )}
            </div>
          </Card>
        );
      },
    },
  };

  return (
    <div className="grid grid-cols-12 gap-8">
      {insightsOrder.map((key) => {
        const item = CARDS[key];
        if (!item) return null;
        return (
          <div key={key} className="col-span-12">
            {item.render()}
          </div>
        );
      })}
    </div>
  );
}
