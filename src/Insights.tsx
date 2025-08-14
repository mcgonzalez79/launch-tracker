import React, { useMemo, useState, useEffect } from "react";
import { Theme } from "./theme";
import { Card } from "./components/UI";
import {
  Shot, ClubRow, orderIndex, mean
} from "./utils";
import {
  ResponsiveContainer, CartesianGrid, Tooltip, Legend,
  XAxis, YAxis, ComposedChart, Bar, Scatter, LabelList, LineChart, Line
} from "recharts";

/* ================== Benchmarks for proficiency ================== */
type Skill = "Beginner" | "Average" | "Good" | "Advanced" | "PGATour";

const BENCHMARKS: Record<string, Record<Skill, number>> = {
  "Driver":           { Beginner: 170, Average: 200, Good: 230, Advanced: 260, PGATour: 295 },
  "3 Wood":           { Beginner: 155, Average: 180, Good: 205, Advanced: 230, PGATour: 260 },
  "4 Hybrid":         { Beginner: 145, Average: 170, Good: 190, Advanced: 210, PGATour: 230 },
  "5 Hybrid (5 Iron)":{ Beginner: 135, Average: 160, Good: 180, Advanced: 200, PGATour: 220 },
  "6 Iron":           { Beginner: 125, Average: 150, Good: 170, Advanced: 185, PGATour: 205 },
  "7 Iron":           { Beginner: 115, Average: 140, Good: 160, Advanced: 175, PGATour: 195 },
  "8 Iron":           { Beginner: 105, Average: 130, Good: 150, Advanced: 165, PGATour: 180 },
  "9 Iron":           { Beginner: 95,  Average: 120, Good: 140, Advanced: 155, PGATour: 170 },
  "Pitching Wedge":   { Beginner: 85,  Average: 110, Good: 130, Advanced: 145, PGATour: 160 },
  "60 (LW)":          { Beginner: 65,  Average: 85,  Good: 100, Advanced: 110, PGATour: 120 },
};

function benchmarksToRows(clubsOrdered: string[]) {
  return clubsOrdered
    .filter((c) => BENCHMARKS[c])
    .map((club) => ({ club, ...BENCHMARKS[club] }));
}

/* ================== Helpers ================== */
function percentile(arr: number[], p: number) {
  if (!arr.length) return NaN;
  const a = [...arr].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

function formatYDS(v?: number) { return v == null || isNaN(v) ? "-" : `${v.toFixed(1)} yds`; }

/* Efficiency / proficiency score vs. benchmarks (0..100) */
function proficiencyScore(pool: Shot[]): { score: number; label: string } {
  const byClub = new Map<string, number[]>();
  pool.forEach((s) => {
    const v = s.TotalDistance_yds ?? s.CarryDistance_yds;
    if (v == null) return;
    if (!byClub.has(s.Club)) byClub.set(s.Club, []);
    byClub.get(s.Club)!.push(v);
  });
  if (!byClub.size) return { score: 0, label: "Beginner" };

  const scores: number[] = [];
  byClub.forEach((vals, club) => {
    const ref = BENCHMARKS[club];
    if (!ref) return;
    const avg = mean(vals);
    const b = ref.Beginner, p = ref.PGATour;
    const s = Math.max(0, Math.min(100, ((avg - b) / (p - b)) * 100));
    scores.push(s);
  });
  if (!scores.length) return { score: 0, label: "Beginner" };

  const overall = mean(scores);
  const label =
    overall < 20 ? "Beginner" :
    overall < 40 ? "Average" :
    overall < 60 ? "Good" :
    overall < 80 ? "Advanced" : "PGA Tour";
  return { score: overall, label };
}

/* PRs for a single club (include outliers) */
function personalRecordsForClub(poolRaw: Shot[], club: string) {
  let bestCarry: Shot | null = null;
  let bestTotal: Shot | null = null;
  for (const s of poolRaw) {
    if (s.Club !== club) continue;
    if (s.CarryDistance_yds != null) {
      if (!bestCarry || s.CarryDistance_yds > (bestCarry.CarryDistance_yds ?? -Infinity)) bestCarry = s;
    }
    if (s.TotalDistance_yds != null) {
      if (!bestTotal || s.TotalDistance_yds > (bestTotal.TotalDistance_yds ?? -Infinity)) bestTotal = s;
    }
  }
  return { bestCarry, bestTotal };
}

/* Gap warnings across ALL clubs (ignores club filter) */
function gapWarnings(pool: Shot[], thresholdTight = 12, thresholdWide = 30) {
  const byClub = new Map<string, number[]>();
  pool.forEach((s) => {
    if (s.CarryDistance_yds == null) return;
    if (!byClub.has(s.Club)) byClub.set(s.Club, []);
    byClub.get(s.Club)!.push(s.CarryDistance_yds);
  });

  const rows: { club: string; avgCarry: number }[] = [];
  byClub.forEach((arr, club) => rows.push({ club, avgCarry: mean(arr) }));
  rows.sort((a, b) => orderIndex(a.club) - orderIndex(b.club));

  const tight: string[] = [];
  const wide: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const gap = Math.abs(rows[i].avgCarry - rows[i - 1].avgCarry);
    if (gap < thresholdTight) tight.push(`${rows[i - 1].club} ↔ ${rows[i].club} (${gap.toFixed(1)} yds)`);
    if (gap > thresholdWide) wide.push(`${rows[i - 1].club} ↔ ${rows[i].club} (${gap.toFixed(1)} yds)`);
  }
  return { tight, wide, totalTight: tight.length };
}

/* Simple modal for Benchmarks chart */
function Modal({
  theme, title, open, onClose, children, width = 760
}: { theme: Theme; title: string; open: boolean; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", width, maxWidth: "95vw", maxHeight: "85vh", borderRadius: 12, overflow: "hidden", boxShadow: "0 15px 40px rgba(0,0,0,0.25)" }}
      >
        <div style={{ padding: "12px 16px", background: theme.brand, color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ background: "#ffffff22", color: "#fff", border: "1px solid #ffffff55", borderRadius: 8, padding: "4px 8px" }}
          >
            Close
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

/* ================== Insights View ================== */
type Props = {
  theme: Theme;
  tableRows: ClubRow[];                  // avg table from filteredOutliers
  filteredOutliers: Shot[];              // respects club filter
  filteredNoClubOutliers: Shot[];        // ignores club filter
  filteredNoClubRaw?: Shot[];            // ignores club filter & outliers (raw) — for PRs
  allClubs: string[];
  selectedClubs: string[];               // <-- NEW: to know current selection
  insightsOrder: string[];
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
};

export default function InsightsView({
  theme, tableRows, filteredOutliers, filteredNoClubOutliers, filteredNoClubRaw,
  allClubs, selectedClubs, insightsOrder, onDragStart, onDragOver, onDrop
}: Props) {

  /* ===== Distance Distribution (bullet-style) ===== */
  type DistMode = "Total" | "Carry";
  const [distMode, setDistMode] = useState<DistMode>("Total");

  const distClubs = useMemo(
    () => [...new Set(filteredOutliers.map(s => s.Club))].sort((a, b) => orderIndex(a) - orderIndex(b)),
    [filteredOutliers]
  );

  const distRows = useMemo(() => {
    const byClub = new Map<string, number[]>();
    const key: keyof Shot = distMode === "Total" ? "TotalDistance_yds" : "CarryDistance_yds";
    filteredOutliers.forEach((s) => {
      const v = s[key] as number | undefined;
      if (v == null) return;
      if (!byClub.has(s.Club)) byClub.set(s.Club, []);
      byClub.get(s.Club)!.push(v);
    });

    const rows = [...byClub.entries()].map(([club, arr]) => {
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      const avg = mean(arr);
      const p25 = percentile(arr, 0.25);
      const p75 = percentile(arr, 0.75);
      return { club, min, max, avg, p25, p75, range: max - min, iqr: p75 - p25 };
    });

    rows.sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
    return rows;
  }, [filteredOutliers, distMode]);

  const distMax = useMemo(() => {
    const vals = distRows.flatMap(r => [r.max]);
    return vals.length ? Math.ceil(Math.max(...vals) / 10) * 10 : 200;
  }, [distRows]);

  /* ===== Proficiency (independent of club selection) ===== */
  const prof = useMemo(() => proficiencyScore(filteredNoClubOutliers), [filteredNoClubOutliers]);
  const profTip = "Efficiency score compares your average total distance to reference ranges across clubs, normalized to 0–100.";

  /* ===== Gap Warnings — ALL clubs ===== */
  const gw = useMemo(() => gapWarnings(filteredNoClubOutliers), [filteredNoClubOutliers]);

  /* ===== Benchmarks modal ===== */
  const [showBench, setShowBench] = useState(false);
  const benches = useMemo(() => benchmarksToRows([...allClubs].sort((a, b) => orderIndex(a) - orderIndex(b))), [allClubs]);

  /* ===== Personal Records (selected club; include outliers) ===== */
  const selectedClub = selectedClubs.length === 1 ? selectedClubs[0] : null;
  const prSel = useMemo(() => {
    if (!selectedClub) return { bestCarry: null as Shot | null, bestTotal: null as Shot | null };
    const pool = (filteredNoClubRaw && filteredNoClubRaw.length ? filteredNoClubRaw : filteredNoClubOutliers);
    return personalRecordsForClub(pool, selectedClub);
  }, [selectedClub, filteredNoClubRaw, filteredNoClubOutliers]);

  /* ===== Club Progress (selected club; carry over time) ===== */
  const progressRows = useMemo(() => {
    if (!selectedClub) return [];
    const pool = filteredOutliers.filter(s => s.Club === selectedClub && s.Timestamp);
    if (!pool.length) return [];
    // average by day
    const byDay = new Map<string, number[]>();
    pool.forEach(s => {
      const d = new Date(s.Timestamp!);
      if (isNaN(d.getTime())) return;
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const v = s.CarryDistance_yds ?? s.TotalDistance_yds;
      if (v == null) return;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(v);
    });
    const rows = [...byDay.entries()].map(([day, arr]) => ({ day, avg: mean(arr) }))
      .sort((a, b) => a.day.localeCompare(b.day));
    return rows;
  }, [selectedClub, filteredOutliers]);

  return (
    <div className="grid grid-cols-1 gap-8">
      {insightsOrder.map((key) => {
        if (key === "distanceBox") return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
            <Card theme={theme} title={`Distance Distribution by Club — ${distMode} (yds)`}>
              <div className="mb-3">
                <button
                  onClick={() => setDistMode(distMode === "Total" ? "Carry" : "Total")}
                  className="px-3 py-2 text-sm rounded-md"
                  style={{ background: theme.brand, color: "#fff" }}
                >
                  Switch to {distMode === "Total" ? "Carry" : "Total"}
                </button>
              </div>

              {/* Dark panel like your screenshot */}
              <div style={{
                width: "100%", height: 420, borderRadius: 12, overflow: "hidden",
                background: "linear-gradient(180deg,#1f2937 0%, #0b0f16 100%)", padding: 12
              }}>
                <ResponsiveContainer>
                  <ComposedChart
                    data={distRows}
                    layout="vertical"
                    margin={{ top: 10, right: 25, bottom: 10, left: 110 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.12)" />
                    <XAxis
                      type="number"
                      domain={[0, distMax]}
                      tick={{ fill: "rgba(255,255,255,0.8)" }}
                      axisLine={{ stroke: "rgba(255,255,255,0.4)" }}
                      tickLine={{ stroke: "rgba(255,255,255,0.4)" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="club"
                      tick={{ fill: "rgba(255,255,255,0.9)" }}
                      width={110}
                    />
                    <Tooltip
                      contentStyle={{ background: "#111827", border: "1px solid #374151", color: "#e5e7eb" }}
                      formatter={(val: any, name: any, p: any) => [val, name]}
                      labelFormatter={(l: any) => l}
                    />
                    <Legend
                      wrapperStyle={{ color: "#e5e7eb" }}
                    />

                    {/* Full range (min→max) as thin bar */}
                    <Bar
                      dataKey="range"
                      name="Min–Max"
                      barSize={6}
                      fill="#1f4d7a"
                      background={false}
                      shape={(props: any) => {
                        // custom shape to draw from min to max
                        const { x, y, height, payload } = props;
                        const scale = props.xAxis.scale;
                        const x1 = scale(payload.min);
                        const x2 = scale(payload.max);
                        const w = Math.max(2, x2 - x1);
                        return <rect x={x1} y={y + height / 2 - 2} width={w} height={4} fill="#1f4d7a" opacity={0.8} rx={2} />;
                      }}
                    />

                    {/* Middle band (P25–P75) as thicker bar */}
                    <Bar
                      dataKey="iqr"
                      name="P25–P75"
                      barSize={14}
                      fill="#3b82f6"
                      shape={(props: any) => {
                        const { y, height, payload } = props;
                        const scale = props.xAxis.scale;
                        const x1 = scale(payload.p25);
                        const x2 = scale(payload.p75);
                        const w = Math.max(4, x2 - x1);
                        return <rect x={x1} y={y + height / 2 - 6} width={w} height={12} fill="#3b82f6" opacity={0.85} rx={3} />;
                      }}
                    >
                      <LabelList
                        dataKey="avg"
                        position="right"
                        formatter={(v: any) => `${Math.round(v)}`}
                        fill="#e5e7eb"
                      />
                    </Bar>

                    {/* Average marker */}
                    <Scatter
                      dataKey="avg"
                      name="Average"
                      fill="#93c5fd"
                      shape={(props: any) => {
                        const { y, height, payload } = props;
                        const cx = props.xAxis.scale(payload.avg);
                        const cy = y + height / 2;
                        return <circle cx={cx} cy={cy} r={5} fill="#93c5fd" stroke="#dbeafe" strokeWidth={1.5} />;
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 text-xs" style={{ color: "#64748b" }}>
                Hover to see <b>min</b>, <b>P25</b>, <b>avg</b>, <b>P75</b>, <b>max</b>. Uses current filters (date/session/outliers/club).
              </div>
            </Card>
          </div>
        );

        if (key === "highlights") return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
            <Card theme={theme} title="Highlights (independent of club selection)">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Proficiency */}
                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm text-slate-500">Proficiency Level</div>
                  <div className="mt-1 text-2xl font-semibold">{prof.label}</div>
                  <div className="text-slate-600 mt-1">
                    Score: {prof.score.toFixed(0)} / 100
                    <span title="What is this?" style={{ marginLeft: 8, cursor: "help", fontSize: 12, color: "#64748b" }}>ⓘ</span>
                  </div>
                  <button
                    onClick={() => setShowBench(true)}
                    className="mt-3 px-3 py-2 text-sm rounded-md"
                    style={{ background: theme.brand, color: "#fff" }}
                    title="View reference distances by skill level"
                  >
                    View benchmark chart
                  </button>
                </div>

                {/* PRs for selected club */}
                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm text-slate-500">Personal Records (Selected Club)</div>
                  {selectedClub ? (
                    <>
                      <div className="mt-1 text-lg">PR Carry: <b>{formatYDS(prSel.bestCarry?.CarryDistance_yds)}</b></div>
                      <div className="mt-1 text-lg">PR Total: <b>{formatYDS(prSel.bestTotal?.TotalDistance_yds)}</b></div>
                      <div className="mt-2 text-xs text-slate-500">Note: PRs include outliers.</div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-500 mt-1">Select a single club in Filters to see PRs here.</div>
                  )}
                </div>

                {/* Consistency across all clubs */}
                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm text-slate-500">Consistency</div>
                  <ConsistencyBlurb pool={filteredNoClubOutliers} />
                </div>
              </div>
            </Card>
          </div>
        );

        if (key === "warnings") return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
            <Card theme={theme} title="Gapping Warnings (all clubs)">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm font-semibold mb-1">Tight Gaps (&lt; 12 yds)</div>
                  {gw.tight.length ? (
                    <ul className="list-disc pl-5 text-sm">
                      {gw.tight.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  ) : <div className="text-sm text-slate-500">None detected</div>}
                </div>
                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm font-semibold mb-1">Wide Gaps (&gt; 30 yds)</div>
                  {gw.wide.length ? (
                    <ul className="list-disc pl-5 text-sm">
                      {gw.wide.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  ) : <div className="text-sm text-slate-500">None detected</div>}
                </div>
              </div>
              <div className="mt-3 text-sm text-slate-500">
                Clubs with a tight gap: <b>{gw.totalTight}</b>
              </div>
            </Card>
          </div>
        );

        if (key === "personalRecords") return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
            <Card theme={theme} title="Personal Records (Selected Club)">
              {selectedClub ? (
                <>
                  <div className="text-sm">PR Carry: <b>{formatYDS(prSel.bestCarry?.CarryDistance_yds)}</b></div>
                  <div className="text-sm mt-1">PR Total: <b>{formatYDS(prSel.bestTotal?.TotalDistance_yds)}</b></div>
                  <div className="mt-2 text-xs text-slate-500">Note: PRs include outliers.</div>
                </>
              ) : (
                <div className="text-sm text-slate-500">Select a single club in Filters to see PRs.</div>
              )}
            </Card>
          </div>
        );

        if (key === "progress") return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
            <Card theme={theme} title="Club Progress — Carry over Time (Selected Club)">
              {selectedClub ? (
                progressRows.length ? (
                  <div style={{ width: "100%", height: 300 }}>
                    <ResponsiveContainer>
                      <LineChart data={progressRows} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="avg" name="Avg Carry" dot stroke={theme.brand} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">No dated shots for {selectedClub} yet.</div>
                )
              ) : (
                <div className="text-sm text-slate-500">Select a single club in Filters to see the progress chart.</div>
              )}
            </Card>
          </div>
        );

        if (key === "weaknesses") return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
            <Card theme={theme} title="Biggest Weakness (across all clubs)">
              <WeaknessCallout pool={filteredNoClubOutliers} />
            </Card>
          </div>
        );

        return null;
      })}

      {/* Modal: Benchmarks chart */}
      <Modal theme={theme} title="Average Distances by Skill Level (reference)" open={showBench} onClose={() => setShowBench(false)}>
        <div style={{ width: "100%", height: 520 }}>
          <ResponsiveContainer>
            <ComposedChart
              data={benches}
              layout="vertical"
              margin={{ top: 10, right: 20, bottom: 10, left: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="club" type="category" />
              <Tooltip />
              <Legend />
              {/* render one stacked bar with different keys via multiple Bars */}
              {(["Beginner","Average","Good","Advanced","PGATour"] as Skill[]).map((k, i) => (
                <Bar key={k} dataKey={k} name={k} fill={["#e5e7eb","#60a5fa","#34d399","#f59e0b","#ef4444"][i]} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="text-xs text-slate-500 mt-3">
          These reference values are illustrative. Replace with your preferred benchmark table when ready.
        </div>
      </Modal>
    </div>
  );
}

/* ================== Side helpers ================== */
function ConsistencyBlurb({ pool }: { pool: Shot[] }) {
  const byClub = new Map<string, number[]>();
  pool.forEach(s => {
    if (s.CarryDistance_yds == null) return;
    if (!byClub.has(s.Club)) byClub.set(s.Club, []);
    byClub.get(s.Club)!.push(s.CarryDistance_yds);
  });

  let bestClub = ""; let bestSd = Infinity; let avgCarry = 0;
  byClub.forEach((arr, club) => {
    if (arr.length < 5) return;
    const m = mean(arr);
    const sd = Math.sqrt(arr.reduce((a,b)=>a+(b-m)*(b-m), 0) / arr.length);
    if (sd < bestSd) { bestSd = sd; bestClub = club; avgCarry = m; }
  });

  return (
    <div className="text-sm">
      {bestClub
        ? <>Most consistent: <b>{bestClub}</b> (carry SD ≈ {bestSd.toFixed(1)} yds, avg {avgCarry.toFixed(1)} yds)</>
        : <>More shots needed to measure consistency.</>
      }
    </div>
  );
}

function WeaknessCallout({ pool }: { pool: Shot[] }) {
  const byClub = new Map<string, Shot[]>();
  pool.forEach(s => {
    if (!byClub.has(s.Club)) byClub.set(s.Club, []);
    byClub.get(s.Club)!.push(s);
  });

  type Row = { club: string; avgSmash: number; avgCarry: number; count: number };
  const rows: Row[] = [];
  byClub.forEach((arr, club) => {
    const smash = arr.map(s => s.SmashFactor).filter((x): x is number => x != null);
    const carry = arr.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
    if (arr.length >= 5 && carry.length) {
      rows.push({
        club,
        count: arr.length,
        avgSmash: smash.length ? mean(smash) : 0,
        avgCarry: mean(carry)
      });
    }
  });

  if (!rows.length) return <div className="text-sm text-slate-500">Add more shots to see a weaknesses analysis.</div>;

  rows.sort((a, b) => (a.avgSmash - b.avgSmash) || (a.avgCarry - b.avgCarry));
  const w = rows[0];

  return (
    <div className="text-sm">
      Biggest weakness appears to be <b>{w.club}</b> (avg smash {w.avgSmash.toFixed(3)}, carry {w.avgCarry.toFixed(1)} yds across {w.count} shots).
    </div>
  );
}
