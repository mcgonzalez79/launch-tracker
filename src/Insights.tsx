import React, { useMemo, useState, useEffect } from "react";
import { Theme } from "./theme";
import { Card } from "./components/UI";
import {
  Shot, ClubRow, orderIndex, mean
} from "./utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer, LabelList,
} from "recharts";

/* ================== Benchmarks for proficiency ==================
   Same source used for both proficiency scoring & the modal chart.
   Distances are illustrative “reference ranges” (yards, Total).
   Adjust to your preferred tables any time.
*/
type Skill = "Beginner" | "Average" | "Good" | "Advanced" | "PGATour";

const SKILLS: Skill[] = ["Beginner", "Average", "Good", "Advanced", "PGATour"];

// Per-club typical total distances by skill (example values)
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

/* Convert benchmarks to a chart-friendly array */
function benchmarksToRows(clubsOrdered: string[]) {
  return clubsOrdered
    .filter(c => BENCHMARKS[c])
    .map(club => ({
      club,
      ...BENCHMARKS[club]
    }));
}

/* Proficiency score out of 100 vs. benchmark table
   Uses Total Distance (or Carry if Total unavailable) averaged over the current selection (ignores club filter if asked).
*/
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

  // Average per club, then compare to benchmarks
  const clubScores: number[] = [];
  byClub.forEach((arr, club) => {
    const avg = arr.reduce((a,b)=>a+b, 0) / arr.length;
    const ref = BENCHMARKS[club];
    if (!ref) return;
    // Map avg to 0..100 across Beginner..PGATour
    const b = ref.Beginner, p = ref.PGATour;
    const sc = Math.max(0, Math.min(100, ((avg - b) / (p - b)) * 100));
    clubScores.push(sc);
  });

  if (!clubScores.length) return { score: 0, label: "Beginner" };

  const overall = clubScores.reduce((a,b)=>a+b, 0) / clubScores.length;
  // Buckets
  const label =
    overall < 20 ? "Beginner" :
    overall < 40 ? "Average"  :
    overall < 60 ? "Good"     :
    overall < 80 ? "Advanced" : "PGA Tour";
  return { score: overall, label };
}

/* Find PRs (include outliers): best carry & best total across provided pool */
function personalRecords(poolRawNoClub: Shot[]) {
  let bestCarry: Shot | null = null;
  let bestTotal: Shot | null = null;
  for (const s of poolRawNoClub) {
    if (s.CarryDistance_yds != null) {
      if (!bestCarry || s.CarryDistance_yds > (bestCarry.CarryDistance_yds ?? -Infinity)) bestCarry = s;
    }
    if (s.TotalDistance_yds != null) {
      if (!bestTotal || s.TotalDistance_yds > (bestTotal.TotalDistance_yds ?? -Infinity)) bestTotal = s;
    }
  }
  return { bestCarry, bestTotal };
}

/* Warnings based on gapping (always ALL clubs, ignore club filter) */
function gapWarnings(allShotsNoClub: Shot[], thresholdTight = 12, thresholdWide = 30) {
  // Build avg carry by club (ignore outliers toggle already applied in parent if needed)
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
  tableRows: ClubRow[];                  // built from filteredOutliers
  filteredOutliers: Shot[];              // respects club filter
  filteredNoClubOutliers: Shot[];        // ignores club filter
  filteredNoClubRaw?: Shot[];            // ignores club filter AND includes outliers (for PRs)
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

  // ===== Personal Records (include outliers) =====
  const { bestCarry, bestTotal } = useMemo(
    () => personalRecords(filteredNoClubRaw && filteredNoClubRaw.length ? filteredNoClubRaw : filteredNoClubOutliers),
    [filteredNoClubRaw, filteredNoClubOutliers]
  );

  // ===== Proficiency (score) — independent of club selection if we want; here we use filteredNoClubOutliers
  const prof = useMemo(() => proficiencyScore(filteredNoClubOutliers, null), [filteredNoClubOutliers]);
  const profTip = "Efficiency score compares your average total distance to reference ranges across clubs, normalized to 0–100.";

  // ===== Gap Warnings — ALWAYS all clubs selected (ignore club filter)
  const gw = useMemo(() => gapWarnings(filteredNoClubOutliers), [filteredNoClubOutliers]);

  // ===== Benchmarks modal =====
  const [showBench, setShowBench] = useState(false);
  const benches = useMemo(() => benchmarksToRows([...allClubs].sort((a,b)=>orderIndex(a)-orderIndex(b))), [allClubs]);

  // ===== Distance Distribution (carry & total) =====
  const distRows = tableRows.map(r => ({
    club: r.club,
    Carry: Number.isFinite(r.avgCarry) ? Number(r.avgCarry.toFixed(1)) : 0,
    Total: Number.isFinite(r.avgTotal) ? Number(r.avgTotal.toFixed(1)) : 0,
  }));

  return (
    <div className="grid grid-cols-1 gap-8">
      {insightsOrder.map((key) => {
        if (key === "distanceBox") return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
            <Card theme={theme} title="Distance Distribution — Avg Carry vs Total">
              <div style={{ width: "100%", height: 360 }}>
                <ResponsiveContainer>
                  <BarChart data={distRows} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="club" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Carry" name="Carry (avg)" fill="#3A86FF">
                      <LabelList dataKey="Carry" position="top" formatter={(v: any) => `${v}`} />
                    </Bar>
                    <Bar dataKey="Total" name="Total (avg)" fill="#2ECC71">
                      <LabelList dataKey="Total" position="top" formatter={(v: any) => `${v}`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        );

        if (key === "highlights") return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
            <Card theme={theme} title="Highlights (independent of club selection)">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm text-slate-500">Proficiency Level</div>
                  <div className="mt-1 text-2xl font-semibold">{prof.label}</div>
                  <div className="text-slate-600 mt-1">
                    Score: {prof.score.toFixed(0)} / 100
                    <span title={profTip} style={{ marginLeft: 8, cursor: "help", fontSize: 12, color: "#64748b" }}>ⓘ</span>
                  </div>
                  <button
                    onClick={() => setShowBench(true)}
                    className="mt-3 px-3 py-2 text-sm rounded-md"
                    style={{ background: theme.brand, color: "#fff" }}
                  >
                    View benchmark chart
                  </button>
                </div>

                <div className="rounded-xl p-4 border" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-sm text-slate-500">Personal Records (PR)</div>
                  <div className="mt-1 text-lg">
                    PR Carry: <b>{bestCarry?.CarryDistance_yds ? `${bestCarry.CarryDistance_yds.toFixed(1)} yds` : "-"}</b>
                    {bestCarry?.Club ? ` (${bestCarry.Club})` : ""}
                  </div>
                  <div className="mt-1 text-lg">
                    PR Total: <b>{bestTotal?.TotalDistance_yds ? `${bestTotal.TotalDistance_yds.toFixed(1)} yds` : "-"}</b>
                    {bestTotal?.Club ? ` (${bestTotal.Club})` : ""}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Note: PR Carry and PR Total include outliers.
                  </div>
                </div>

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
            {/* Optional dedicated PR card */}
            <Card theme={theme} title="Personal Records (PR)">
              <div className="text-sm">
                PR Carry: <b>{bestCarry?.CarryDistance_yds ? `${bestCarry.CarryDistance_yds.toFixed(1)} yds` : "-"}</b>
                {bestCarry?.Club ? ` (${bestCarry.Club})` : ""}
              </div>
              <div className="text-sm mt-1">
                PR Total: <b>{bestTotal?.TotalDistance_yds ? `${bestTotal.TotalDistance_yds.toFixed(1)} yds` : "-"}</b>
                {bestTotal?.Club ? ` (${bestTotal.Club})` : ""}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Note: PR Carry and PR Total include outliers.
              </div>
            </Card>
          </div>
        );

        if (key === "progress") return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
            <Card theme={theme} title="Club Progress (distance over time)">
              <div className="text-sm text-slate-500">Select a single club in the Filters to see a trend here. (Feature exists in Dashboard charts.)</div>
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
              {/* One series per skill */}
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
function ConsistencyBlurb({ pool }: { pool: Shot[] }) {
  // Identify club with the lowest carry standard deviation (min 5 shots)
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
  // Basic heuristic: pick the club with lowest smash (or lowest avg carry) among clubs with at least 5 shots
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

  // Choose weakest by lowest smash; tiebreaker by lowest avg carry
  rows.sort((a,b)=> (a.avgSmash - b.avgSmash) || (a.avgCarry - b.avgCarry));
  const w = rows[0];

  return (
    <div className="text-sm">
      Biggest weakness appears to be <b>{w.club}</b> (avg smash {w.avgSmash.toFixed(3)}, carry {w.avgCarry.toFixed(1)} yds across {w.count} shots).
    </div>
  );
}
