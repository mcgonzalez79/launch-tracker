import React, { useMemo, useState, useEffect } from "react";
import { Theme } from "./theme";
import { Card } from "./components/UI";
import { Shot, ClubRow, orderIndex, mean } from "./utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
  ComposedChart, ErrorBar, Line
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
    .filter(c => BENCHMARKS[c])
    .map(club => ({
      club,
      ...BENCHMARKS[club]
    }));
}

/* ================== Helpers (stats) ================== */
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
    return sorted[base];
  }
}
function fiveNumSummary(vals: number[]) {
  if (!vals.length) return { min: NaN, q1: NaN, med: NaN, q3: NaN, max: NaN };
  const a = vals.slice().sort((x, y) => x - y);
  return {
    min: a[0],
    q1: quantile(a, 0.25),
    med: quantile(a, 0.50),
    q3: quantile(a, 0.75),
    max: a[a.length - 1]
  };
}

/* ===== Proficiency score (0..100) vs. benchmark table ===== */
function proficiencyScore(pool: Shot[], selectedClubs: string[] | null): { score: number; label: string } {
  const byClub = new Map<string, number[]>();
  pool.forEach(s => {
    const v = (s.TotalDistance_yds ?? s.CarryDistance_yds);
    if (v == null) return;
    if (selectedClubs && selectedClubs.length && !selectedClubs.includes(s.Club)) return;
    if (!byClub.has(s.Club)) byClub.set(s.Club, []);
    byClub.get(s.Club)!.push(v);
  });
  if (!byClub.size) return { score: 0, label: "Beginner" };

  const clubScores: number[] = [];
  byClub.forEach((arr, club) => {
    const avg = arr.reduce((a,b)=>a+b, 0) / arr.length;
    const ref = BENCHMARKS[club];
    if (!ref) return;
    const b = ref.Beginner, p = ref.PGATour;
    const sc = Math.max(0, Math.min(100, ((avg - b) / (p - b)) * 100));
    clubScores.push(sc);
  });

  if (!clubScores.length) return { score: 0, label: "Beginner" };

  const overall = clubScores.reduce((a,b)=>a+b, 0) / clubScores.length;
  const label =
    overall < 20 ? "Beginner" :
    overall < 40 ? "Average"  :
    overall < 60 ? "Good"     :
    overall < 80 ? "Advanced" : "PGA Tour";
  return { score: overall, label };
}

/* ===== PRs (best) ===== */
function personalRecords(pool: Shot[]) {
  let bestCarry: Shot | null = null;
  let bestTotal: Shot | null = null;
  for (const s of pool) {
    if (s.CarryDistance_yds != null) {
      if (!bestCarry || s.CarryDistance_yds > (bestCarry.CarryDistance_yds ?? -Infinity)) bestCarry = s;
    }
    if (s.TotalDistance_yds != null) {
      if (!bestTotal || s.TotalDistance_yds > (bestTotal.TotalDistance_yds ?? -Infinity)) bestTotal = s;
    }
  }
  return { bestCarry, bestTotal };
}

/* ===== Gapping Warnings (always all clubs) ===== */
function gapWarnings(allShotsNoClub: Shot[], thresholdTight = 12, thresholdWide = 30) {
  const byClub = new Map<string, number[]>();
  allShotsNoClub.forEach(s => {
    if (s.CarryDistance_yds == null) return;
    if (!byClub.has(s.Club)) byClub.set(s.Club, []);
    byClub.get(s.Club)!.push(s.CarryDistance_yds);
  });

  const rows: { club: string; avgCarry: number }[] = [];
  byClub.forEach((arr, club) => {
    const avg = arr.reduce((a,b)=>a+b, 0) / arr.length;
    rows.push({ club, avgCarry: avg });
  });

  rows.sort((a,b)=>orderIndex(a.club)-orderIndex(b.club));

  const tight: string[] = [];
  const wide: string[] = [];
  for (let i=1;i<rows.length;i++){
    const gap = Math.abs(rows[i].avgCarry - rows[i-1].avgCarry);
    if (gap < thresholdTight) tight.push(`${rows[i-1].club} ↔ ${rows[i].club} (${gap.toFixed(1)} yds)`);
    if (gap > thresholdWide)  wide.push(`${rows[i-1].club} ↔ ${rows[i].club} (${gap.toFixed(1)} yds)`);
  }
  return { tight, wide, totalTight: tight.length };
}

/* ================== Modal ================== */
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
  tableRows: ClubRow[];                   // averages (already filtered & outliers toggle applied)
  filteredOutliers: Shot[];               // respects club selection
  filteredNoClubOutliers: Shot[];         // ignores club selection (for highlights & gap warnings)
  filteredNoClubRaw?: Shot[];             // ignores club selection & includes outliers (for global PRs if desired)
  allClubs: string[];
  insightsOrder: string[];
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
};

export default function InsightsView({
  theme, tableRows, filteredOutliers, filteredNoClubOutliers, filteredNoClubRaw, allClubs,
  insightsOrder, onDragStart, onDragOver, onDrop
}: Props) {

  /* ======= Global (independent of selection) ======= */
  const globalPoolForPR = filteredNoClubRaw && filteredNoClubRaw.length ? filteredNoClubRaw : filteredNoClubOutliers;
  const globalPR = useMemo(() => personalRecords(globalPoolForPR), [globalPoolForPR]);

  // Most consistent club (global)
  const globalConsistency = useMemo(() => {
    const byClub = new Map<string, number[]>();
    filteredNoClubOutliers.forEach(s => {
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
    return { bestClub, bestSd, avgCarry };
  }, [filteredNoClubOutliers]);

  /* ======= Distance Distribution (box & whisker) ======= */
  // Clubs on Y, Distances on X (no medians shown)
  const clubsOrdered = useMemo(
    () => [...new Set(filteredOutliers.map(s => s.Club))].sort((a,b)=>orderIndex(a)-orderIndex(b)),
    [filteredOutliers]
  );
  type BoxRow = {
    club: string;
    Q1Carry: number; iqrCarry: number; whiskerCarry: [number, number];
    Q1Total: number; iqrTotal: number; whiskerTotal: [number, number];
  };
  const boxRows: BoxRow[] = useMemo(() => {
    const rows: BoxRow[] = [];
    clubsOrdered.forEach(club => {
      const shotsClub = filteredOutliers.filter(s => s.Club === club);
      const carryVals = shotsClub.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
      const totalVals = shotsClub.map(s => s.TotalDistance_yds).filter((x): x is number => x != null);

      const c = fiveNumSummary(carryVals);
      const t = fiveNumSummary(totalVals);

      rows.push({
        club,
        Q1Carry: Number.isFinite(c.q1) ? c.q1 : 0,
        iqrCarry: (Number.isFinite(c.q3) && Number.isFinite(c.q1)) ? (c.q3 - c.q1) : 0,
        whiskerCarry: [Number.isFinite(c.min) ? c.min : 0, Number.isFinite(c.max) ? c.max : 0],

        Q1Total: Number.isFinite(t.q1) ? t.q1 : 0,
        iqrTotal: (Number.isFinite(t.q3) && Number.isFinite(t.q1)) ? (t.q3 - t.q1) : 0,
        whiskerTotal: [Number.isFinite(t.min) ? t.min : 0, Number.isFinite(t.max) ? t.max : 0],
      });
    });
    return rows;
  }, [filteredOutliers, clubsOrdered]);

  /* ======= Personal Records & Proficiency (dependent on selection) ======= */
  const selectedPR = useMemo(() => personalRecords(filteredOutliers), [filteredOutliers]);
  const selectedProf = useMemo(() => proficiencyScore(filteredOutliers, null), [filteredOutliers]);

  /* ======= Gap Warnings (always all clubs) ======= */
  const gw = useMemo(() => gapWarnings(filteredNoClubOutliers), [filteredNoClubOutliers]);

  /* ======= Benchmarks modal ======= */
  const [showBench, setShowBench] = useState(false);
  const benches = useMemo(() => benchmarksToRows([...allClubs].sort((a,b)=>orderIndex(a)-orderIndex(b))), [allClubs]);

  /* ======= Progress chart (single club only; dynamic height) ======= */
  const selectedClubName = useMemo(() => {
    const set = new Set(filteredOutliers.map(s => s.Club));
    return set.size === 1 ? Array.from(set)[0] : null;
  }, [filteredOutliers]);

  const progressRows = useMemo(() => {
    if (!selectedClubName) return [];
    const pool = filteredOutliers
      .filter(s => s.Club === selectedClubName && s.CarryDistance_yds != null)
      .map((s, i) => ({
        t: s.Timestamp ? new Date(s.Timestamp).getTime() : i,
        label: s.Timestamp ? new Date(s.Timestamp).toLocaleString() : `Shot ${i + 1}`,
        carry: s.CarryDistance_yds as number,
      }))
      .sort((a, b) => a.t - b.t);
    return pool;
  }, [filteredOutliers, selectedClubName]);

  // Dynamic height: grows with data, collapses when no chart
  const progressHeight = useMemo(() => {
    if (!selectedClubName || progressRows.length <= 1) return undefined; // no fixed height -> shrink to content
    const grow = 240 + (progressRows.length * 6); // scale with points
    return Math.max(260, Math.min(420, grow));
  }, [selectedClubName, progressRows.length]);

  return (
    <div className="grid grid-cols-1 gap-8">
      {insightsOrder.map((key) => {
        if (key === "distanceBox") return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
            <Card theme={theme} title="Distance Distribution — Box & Whisker (Carry & Total)">
              <div style={{ width: "100%", height: 480 }}>
                <ResponsiveContainer>
                  <ComposedChart
                    layout="vertical"
                    data={boxRows}
                    margin={{ top: 10, right: 16, bottom: 10, left: 80 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="club" type="category" />
                    <Tooltip
                      formatter={(_, __, p: any) => {
                        const d = p && p.payload ? p.payload : {};
                        const lines = [
                          `Carry min/Q1/Q3/max: ${d.whiskerCarry?.[0]?.toFixed?.(1) ?? "-"} / ${d.Q1Carry?.toFixed?.(1) ?? "-"} / ${(d.Q1Carry + d.iqrCarry)?.toFixed?.(1) ?? "-"} / ${d.whiskerCarry?.[1]?.toFixed?.(1) ?? "-"}`,
                          `Total min/Q1/Q3/max: ${d.whiskerTotal?.[0]?.toFixed?.(1) ?? "-"} / ${d.Q1Total?.toFixed?.(1) ?? "-"} / ${(d.Q1Total + d.iqrTotal)?.toFixed?.(1) ?? "-"} / ${d.whiskerTotal?.[1]?.toFixed?.(1) ?? "-"}`,
                        ];
                        return [lines.join("\n"), "Stats"];
                      }}
                      labelFormatter={(l) => `Club: ${l}`}
                    />
                    <Legend />
                    {/* Carry box (horizontal) */}
                    <Bar dataKey="Q1Carry" stackId="carry" fill="rgba(0,0,0,0)" />
                    <Bar dataKey="iqrCarry" stackId="carry" name="Carry (IQR)" fill="#3A86FF">
                      <ErrorBar dataKey="whiskerCarry" direction="x" width={10} stroke="#1e40af" />
                    </Bar>
                    {/* Total box (horizontal) */}
                    <Bar dataKey="Q1Total" stackId="total" fill="rgba(0,0,0,0)" />
                    <Bar dataKey="iqrTotal" stackId="total" name="Total (IQR)" fill="#2ECC71">
                      <ErrorBar dataKey="whiskerTotal" direction="x" width={10} stroke="#166534" />
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        );

        if (key === "highlights") return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
            <Card theme={theme} title="Highlights (independent of club selection)">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* PR Carry */}
                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm text-slate-500">PR Carry</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {globalPR.bestCarry?.CarryDistance_yds ? `${globalPR.bestCarry.CarryDistance_yds.toFixed(1)} yds` : "-"}
                  </div>
                  <div className="text-slate-600 mt-1 text-sm">
                    {globalPR.bestCarry?.Club ? `(${globalPR.bestCarry.Club})` : ""}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Note: includes outliers.</div>
                </div>

                {/* PR Total */}
                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm text-slate-500">PR Total</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {globalPR.bestTotal?.TotalDistance_yds ? `${globalPR.bestTotal.TotalDistance_yds.toFixed(1)} yds` : "-"}
                  </div>
                  <div className="text-slate-600 mt-1 text-sm">
                    {globalPR.bestTotal?.Club ? `(${globalPR.bestTotal.Club})` : ""}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Note: includes outliers.</div>
                </div>

                {/* Most Consistent (global) */}
                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm text-slate-500">Most Consistent Club</div>
                  {globalConsistency.bestClub
                    ? (<>
                        <div className="mt-1 text-lg font-semibold">{globalConsistency.bestClub}</div>
                        <div className="text-slate-600 mt-1 text-sm">
                          Carry SD ≈ {globalConsistency.bestSd.toFixed(1)} yds (avg {globalConsistency.avgCarry.toFixed(1)} yds)
                        </div>
                      </>)
                    : (<div className="mt-1 text-slate-600 text-sm">More shots needed to measure consistency.</div>)
                  }
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
            <Card theme={theme} title="Personal Records (by current selection)">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* PR Carry (selected) */}
                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm text-slate-500">PR Carry</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {selectedPR.bestCarry?.CarryDistance_yds ? `${selectedPR.bestCarry.CarryDistance_yds.toFixed(1)} yds` : "-"}
                  </div>
                  <div className="text-slate-600 mt-1 text-sm">
                    {selectedPR.bestCarry?.Club ? `(${selectedPR.bestCarry.Club})` : ""}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Note: includes outliers.</div>
                </div>

                {/* PR Total (selected) */}
                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm text-slate-500">PR Total</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {selectedPR.bestTotal?.TotalDistance_yds ? `${selectedPR.bestTotal.TotalDistance_yds.toFixed(1)} yds` : "-"}
                  </div>
                  <div className="text-slate-600 mt-1 text-sm">
                    {selectedPR.bestTotal?.Club ? `(${selectedPR.bestTotal.Club})` : ""}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Note: includes outliers.</div>
                </div>

                {/* Proficiency (selected) + button to open modal */}
                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm text-slate-500">Proficiency Level</div>
                  <div className="mt-1 text-2xl font-semibold">{selectedProf.label}</div>
                  <div className="text-slate-600 mt-1">
                    Score: {selectedProf.score.toFixed(0)} / 100
                    <span title="Compares your average total distance to reference ranges for each club you’ve selected, normalized to 0–100." style={{ marginLeft: 8, cursor: "help", fontSize: 12, color: "#64748b" }}>ⓘ</span>
                  </div>
                  <button
                    onClick={() => setShowBench(true)}
                    className="mt-3 px-3 py-2 text-sm rounded-md"
                    style={{ background: theme.brand, color: "#fff" }}
                  >
                    View benchmark chart
                  </button>
                </div>
              </div>
            </Card>
          </div>
        );

        if (key === "progress") return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
            <Card theme={theme} title="Club Progress — Carry over Time">
              {/* If no chart, no fixed height -> card shrinks to this content */}
              {(!selectedClubName || progressRows.length <= 1) ? (
                <div className="text-sm text-slate-500">
                  Select a single club in Filters to view progress over time (needs multiple shots).
                </div>
              ) : (
                <div style={{ width: "100%", height: progressHeight }}>
                  <ResponsiveContainer>
                    <ComposedChart data={progressRows} margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="carry" name="Carry (yds)" stroke="#3A86FF" strokeWidth={2} dot={{ r: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
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
            <BarChart
              data={benches}
              layout="vertical"
              margin={{ top: 10, right: 20, bottom: 10, left: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="club" type="category" />
              <Tooltip />
              <Legend />
              <Bar dataKey="Beginner" fill="#e5e7eb" name="Beginner" />
              <Bar dataKey="Average"  fill="#60a5fa" name="Average" />
              <Bar dataKey="Good"     fill="#34d399" name="Good" />
              <Bar dataKey="Advanced" fill="#f59e0b" name="Advanced" />
              <Bar dataKey="PGATour"  fill="#ef4444" name="PGA Tour" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="text-xs text-slate-500 mt-3">
          These reference values are example ranges for illustration. Use your own benchmark tables if you prefer.
        </div>
      </Modal>
    </div>
  );
}

/* ================== Helpers (Insights-only) ================== */
function WeaknessCallout({ pool }: { pool: Shot[] }) {
  const byClub = new Map<string, Shot[]>();
  pool.forEach(s => {
    if (!byClub.has(s.Club)) byClub.set(s.Club, []);
    byClub.get(s.Club)!.push(s);
  });

  type Row = { club: string; avgSmash: number; avgCarry: number; count: number };
  const rows: Row[] = [];
  byClub.forEach((arr, club) => {
    const smash = arr.map(s => s.SmashFactor).filter((x): x is number => x!=null);
    const carry = arr.map(s => s.CarryDistance_yds).filter((x): x is number => x!=null);
    if (arr.length >= 5 && carry.length) {
      rows.push({
        club,
        count: arr.length,
        avgSmash: smash.length ? (smash.reduce((a,b)=>a+b,0)/smash.length) : 0,
        avgCarry: carry.reduce((a,b)=>a+b,0)/carry.length
      });
    }
  });

  if (!rows.length) {
    return <div className="text-sm text-slate-500">Add more shots to see a weaknesses analysis.</div>;
  }

  rows.sort((a,b)=> (a.avgSmash - b.avgSmash) || (a.avgCarry - b.avgCarry));
  const w = rows[0];

  return (
    <div className="text-sm">
      Biggest weakness appears to be <b>{w.club}</b> (avg smash {w.avgSmash.toFixed(3)}, carry {w.avgCarry.toFixed(1)} yds across {w.count} shots).
    </div>
  );
}
