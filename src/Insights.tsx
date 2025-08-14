import React, { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, Legend,
  ResponsiveContainer, LineChart, Line, ReferenceLine
} from "recharts";
import { Card } from "./components/UI";
import { Theme } from "./theme";
import { Shot, ClubRow, mean, stddev, orderIndex } from "./utils";

/* ========= Types ========= */
type Props = {
  theme: Theme;

  /** Table rows built from the current (club-filtered) dataset — used for the Distance Distribution bars */
  tableRows: ClubRow[];

  /** Current selection (respects clubs & filters & outliers) — used for PR and Progress */
  filteredOutliers: Shot[];

  /** All-club (ignores club selection; still respects dates/outliers) — used for Highlights & Gapping Warnings */
  filteredNoClubOutliers: Shot[];

  /** Consistent full list of clubs (ordered Driver → LW) so colors stay stable */
  allClubs: string[];

  /** Reordering state/handlers come from App so order persists in localStorage */
  insightsOrder: string[];
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
};

/* ========= Palette ========= */
const CLUB_PALETTE = [
  "#1f77b4", "#00A980", "#FFB703", "#EF476F", "#8E44AD",
  "#2ECC71", "#E67E22", "#00B8D9", "#F94144", "#577590",
  "#F72585", "#7209B7", "#3A86FF", "#43AA8B", "#90BE6D"
];
const CARRY_BAR = "#3A86FF";
const TOTAL_BAR = "#00A980"; // green for Total in Insights distance chart

const fmt1 = (n?: number) => (n == null ? "-" : n.toFixed(1));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/* ========= Helpers ========= */
function colorForClub(club: string, allClubs: string[]) {
  const idx = allClubs.findIndex(c => c === club);
  return CLUB_PALETTE[(idx >= 0 ? idx : 0) % CLUB_PALETTE.length];
}

function byClub(shots: Shot[]) {
  const m = new Map<string, Shot[]>();
  for (const s of shots) {
    if (!s.Club) continue;
    if (!m.has(s.Club)) m.set(s.Club, []);
    m.get(s.Club)!.push(s);
  }
  return m;
}

/** Simple global efficiency score out of 100 (all data). Combine Smash & Spin deviation heuristics. */
function efficiencyScoreAll(all: Shot[]) {
  if (!all.length) return { score: 0, detail: "No data." };

  const smashVals = all
    .map(s => s.SmashFactor ?? (s.BallSpeed_mph && s.ClubSpeed_mph ? s.BallSpeed_mph / s.ClubSpeed_mph : undefined))
    .filter((x): x is number => x != null);
  const spinVals = all.map(s => s.SpinRate_rpm).filter((x): x is number => x != null);

  const smash = smashVals.length ? mean(smashVals) : 0;
  const spin = spinVals.length ? mean(spinVals) : 0;

  // Smash: 1.25–1.52→0..1
  const smashNorm = clamp((smash - 1.25) / (1.52 - 1.25), 0, 1);
  // Spin: 3500 rpm as a loose middle; ±2000 → 0..1
  const spinNorm = clamp(1 - Math.abs(spin - 3500) / 2000, 0, 1);

  const score = Math.round((0.6 * smashNorm + 0.4 * spinNorm) * 100);
  const detail = `Combines avg Smash (${smash.toFixed(3)}) and Spin (${Math.round(spin)} rpm) vs. broad targets.`;
  return { score, detail };
}

/** Classify distance level for a single-club selection (PR card auxiliary label) */
function distanceTier(avgTotal?: number) {
  if (avgTotal == null || isNaN(avgTotal)) return "—";
  if (avgTotal < 120) return "Beginner";
  if (avgTotal < 160) return "Average";
  if (avgTotal < 190) return "Good";
  if (avgTotal < 230) return "Advanced";
  return "PGA Tour";
}

/* ========= Cards ========= */
function DistanceDistributionCard({ theme, tableRows, allClubs }: { theme: Theme; tableRows: ClubRow[]; allClubs: string[] }) {
  // Ensure rows follow Driver → LW order for consistent y axis
  const data = useMemo(
    () => [...tableRows].sort((a, b) => orderIndex(a.club) - orderIndex(b.club)),
    [tableRows]
  );

  return (
    <Card theme={theme} title="Distance Distribution (by Club)">
      <div style={{ width: "100%", height: 360 }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 18, right: 18, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="club" width={120} />
            <Tooltip
              formatter={(value: any, name: any) =>
                [typeof value === "number" ? value.toFixed(1) + " yds" : value, name]
              }
            />
            <Legend />
            <Bar dataKey="avgCarry" name="Carry (avg)" fill={CARRY_BAR} />
            <Bar dataKey="avgTotal" name="Total (avg)" fill={TOTAL_BAR} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function HighlightsCard({
  theme, allData
}: {
  theme: Theme; allData: Shot[];
}) {
  const { longestCarry, longestClub, mostConsistentClub, eff } = useMemo(() => {
    const all = allData;
    // Longest carry (global)
    let longestCarry = 0;
    let longestClub = "-";
    for (const s of all) {
      const c = s.CarryDistance_yds ?? -Infinity;
      if (c > longestCarry) { longestCarry = c; longestClub = s.Club || "-"; }
    }

    // Most consistent: min SD of carry among clubs with >= 5 shots
    const m = byClub(all);
    let bestClub = "-";
    let bestSD = Number.POSITIVE_INFINITY;
    for (const [club, arr] of m) {
      const carries = arr.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
      if (carries.length < 5) continue;
      const sd = stddev(carries);
      if (sd < bestSD) { bestSD = sd; bestClub = club; }
    }

    const eff = efficiencyScoreAll(all);
    return { longestCarry, longestClub, mostConsistentClub: bestClub, eff };
  }, [allData]);

  return (
    <Card theme={theme} title="Highlights (All Sessions / All Clubs)">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-slate-500">Longest Carry</div>
          <div className="text-lg font-semibold">{fmt1(longestCarry)} yds <span className="text-slate-500">({longestClub})</span></div>
        </div>
        <div>
          <div className="text-slate-500">Most Consistent Club</div>
          <div className="text-lg font-semibold">{mostConsistentClub}</div>
          <div className="text-xs text-slate-500">Based on lowest Carry SD (≥5 shots)</div>
        </div>
        <div>
          <div className="text-slate-500">Efficiency Score</div>
          <div className="text-lg font-semibold" title={eff.detail}>{eff.score}/100</div>
          <div className="text-xs text-slate-500">Hover to see how it’s calculated</div>
        </div>
      </div>
    </Card>
  );
}

function GappingWarningsCard({
  theme, allData
}: {
  theme: Theme; allData: Shot[];
}) {
  // Compute on ALL data (ignores current club selection)
  const summary = useMemo(() => {
    const m = byClub(allData);
    const rows: { club: string; avgCarry: number }[] = [];
    for (const [club, arr] of m) {
      const carries = arr.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
      if (!carries.length) continue;
      rows.push({ club, avgCarry: mean(carries) });
    }
    // sort in physical order
    rows.sort((a, b) => orderIndex(a.club) - orderIndex(b.club));

    const gaps: { a: string; b: string; diff: number }[] = [];
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1], cur = rows[i];
      const diff = Math.abs(cur.avgCarry - prev.avgCarry);
      gaps.push({ a: prev.club, b: cur.club, diff });
    }

    const tight = gaps.filter(g => g.diff > 0 && g.diff < 12);
    const wide  = gaps.filter(g => g.diff > 25);

    return { rows, gaps, tight, wide };
  }, [allData]);

  return (
    <Card theme={theme} title="Gapping Warnings (All Clubs)">
      <div className="text-sm space-y-3">
        <div>
          <div className="font-semibold mb-1">Tight Gaps (&lt; 12 yds)</div>
          {summary.tight.length ? (
            <ul className="list-disc ml-5">
              {summary.tight.map((g, i) => (
                <li key={i}>{g.a} → {g.b}: {g.diff.toFixed(1)} yds</li>
              ))}
            </ul>
          ) : <div className="text-slate-500">None</div>}
        </div>

        <div>
          <div className="font-semibold mb-1">Wide Gaps (&gt; 25 yds)</div>
          {summary.wide.length ? (
            <ul className="list-disc ml-5">
              {summary.wide.map((g, i) => (
                <li key={i}>{g.a} → {g.b}: {g.diff.toFixed(1)} yds</li>
              ))}
            </ul>
          ) : <div className="text-slate-500">None</div>}
        </div>
      </div>
    </Card>
  );
}

function PersonalRecordsCard({
  theme, selectedData
}: {
  theme: Theme; selectedData: Shot[];
}) {
  // PRs respect current selection (clubs, date, etc.)
  const { prCarry, prTotal, avgTotal, tier } = useMemo(() => {
    if (!selectedData.length) return { prCarry: undefined, prTotal: undefined, avgTotal: undefined, tier: "—" as string };

    let prCarry = -Infinity, prTotal = -Infinity;
    let sumTotal = 0, cntTotal = 0;

    for (const s of selectedData) {
      const c = s.CarryDistance_yds; if (c != null && c > prCarry) prCarry = c;
      const t = s.TotalDistance_yds; if (t != null && t > prTotal) prTotal = t;
      if (t != null) { sumTotal += t; cntTotal++; }
    }
    const avgTotal = cntTotal ? sumTotal / cntTotal : undefined;
    return {
      prCarry: prCarry === -Infinity ? undefined : prCarry,
      prTotal: prTotal === -Infinity ? undefined : prTotal,
      avgTotal,
      tier: distanceTier(avgTotal)
    };
  }, [selectedData]);

  return (
    <Card theme={theme} title="Personal Records (current selection)">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-slate-500">PR Carry</div>
          <div className="text-lg font-semibold">{fmt1(prCarry)} yds</div>
        </div>
        <div>
          <div className="text-slate-500">PR Total</div>
          <div className="text-lg font-semibold">{fmt1(prTotal)} yds</div>
        </div>
        <div>
          <div className="text-slate-500">Distance Tier</div>
          <div className="text-lg font-semibold">{tier}</div>
        </div>
      </div>
    </Card>
  );
}

function ProgressCard({
  theme, selectedData
}: {
  theme: Theme; selectedData: Shot[];
}) {
  // Show carry over time for the current selection.
  const series = useMemo(() => {
    const points = selectedData
      .filter(s => s.Timestamp && s.CarryDistance_yds != null)
      .map(s => ({ x: new Date(s.Timestamp!), y: s.CarryDistance_yds! }))
      .sort((a, b) => +a.x - +b.x);
    return points.map(p => ({ date: p.x.toISOString().slice(0, 10), carry: p.y }));
  }, [selectedData]);

  return (
    <Card theme={theme} title="Club Progress (Carry over Time)">
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={series} margin={{ left: 8, right: 18, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="carry" stroke="#3A86FF" strokeWidth={2} dot={false} />
            <ReferenceLine y={series.length ? mean(series.map(d => d.carry)) : undefined} stroke="#94a3b8" strokeDasharray="4 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function WeaknessesCard({
  theme, allData
}: {
  theme: Theme; allData: Shot[];
}) {
  // Simple heuristic: club with lowest Smash vs its peers (≥5 shots)
  const finding = useMemo(() => {
    const m = byClub(allData);
    let worstClub = "-";
    let worstSmash = Number.POSITIVE_INFINITY;

    for (const [club, arr] of m) {
      const smash = arr
        .map(s => s.SmashFactor ?? (s.BallSpeed_mph && s.ClubSpeed_mph ? s.BallSpeed_mph / s.ClubSpeed_mph : undefined))
        .filter((x): x is number => x != null);
      if (smash.length < 5) continue;
      const avg = mean(smash);
      if (avg < worstSmash) { worstSmash = avg; worstClub = club; }
    }

    return { worstClub, worstSmash: worstSmash === Number.POSITIVE_INFINITY ? undefined : worstSmash };
  }, [allData]);

  return (
    <Card theme={theme} title="Biggest Weakness (All Data)">
      <div className="text-sm">
        {finding.worstSmash == null ? (
          <div className="text-slate-500">Not enough data yet.</div>
        ) : (
          <>
            <div><span className="font-semibold">{finding.worstClub}</span> shows the lowest average Smash.</div>
            <div className="text-slate-500">Avg Smash: {finding.worstSmash.toFixed(3)}</div>
          </>
        )}
      </div>
    </Card>
  );
}

/* ========= Main View ========= */
export default function InsightsView(props: Props) {
  const {
    theme, tableRows, filteredOutliers, filteredNoClubOutliers,
    allClubs, insightsOrder, onDragStart, onDragOver, onDrop
  } = props;

  // Render a card by key
  const renderCard = (key: string) => {
    switch (key) {
      case "distanceBox":
        return <DistanceDistributionCard theme={theme} tableRows={tableRows} allClubs={allClubs} />;
      case "highlights":
        return <HighlightsCard theme={theme} allData={filteredNoClubOutliers} />;
      case "warnings":
        return <GappingWarningsCard theme={theme} allData={filteredNoClubOutliers} />;
      case "personalRecords":
        return <PersonalRecordsCard theme={theme} selectedData={filteredOutliers} />;
      case "progress":
        return <ProgressCard theme={theme} selectedData={filteredOutliers} />;
      case "weaknesses":
        return <WeaknessesCard theme={theme} allData={filteredNoClubOutliers} />;
      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8">
      {/* Drop zone grid: use two columns on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {insightsOrder.map((k) => (
          <div
            key={k}
            draggable
            onDragStart={onDragStart(k)}
            onDragOver={(e) => { e.preventDefault(); onDragOver(k)(e); }}
            onDrop={onDrop(k)}
            style={{ cursor: "move" }}
          >
            {renderCard(k)}
          </div>
        ))}
      </div>
    </div>
  );
}
