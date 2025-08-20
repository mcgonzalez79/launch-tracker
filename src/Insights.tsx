// src/Insights.tsx
import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import { Card } from "./components/UI";
import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line
} from "recharts";

/* =========================
   Props
========================= */
type Props = {
  theme: Theme;

  // from App.tsx
  tableRows: ClubRow[];
  filteredOutliers: Shot[];           // respects filters incl. outlier toggle
  filteredNoClubOutliers: Shot[];     // alias of filteredOutliers (for compatibility)
  filteredNoClubRaw: Shot[];          // respects filters, no outlier removal
  allClubs: string[];
  insightsOrder: string[];

  onDragStart: (key: string) => (e: React.DragEvent) => void;
  onDragOver: (key: string) => (e: React.DragEvent) => void;
  onDrop: (_key: string) => (_: React.DragEvent) => void;

  // Optional: when present, Highlights will truly ignore filters
  allShots?: Shot[];
};

/* =========================
   Helpers
========================= */
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function groupBy<T>(rows: T[], keyFn: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const arr = m.get(k);
    if (arr) arr.push(r); else m.set(k, [r]);
  }
  return m;
}
function avg(nums: number[]) { return nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : null; }
function stddev(nums: number[]) {
  if (nums.length < 2) return null;
  const m = avg(nums)!;
  const v = nums.reduce((a,b)=>a + (b-m)**2, 0) / nums.length;
  return Math.sqrt(v);
}
function maxBy<T>(arr: T[], score: (t: T) => number | null | undefined) {
  let best: T | null = null; let bestScore = -Infinity;
  for (const t of arr) {
    const s = score(t);
    if (s == null || Number.isNaN(s)) continue;
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return best;
}

/* Lightweight KPI tile used across Insights */
function KpiCell({
  label, value, sub, theme: T
}: { label: string; value: string; sub?: string; theme: Theme; }) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: T.panelAlt, borderColor: T.border }}>
      <div className="text-xs mb-1" style={{ color: T.textDim }}>{label}</div>
      <div className="text-2xl font-semibold" style={{ color: T.text }}>{value}</div>
      {sub ? <div className="text-xs mt-1" style={{ color: T.textDim }}>{sub}</div> : null}
    </div>
  );
}

/* =========================
   Component
========================= */
export default function Insights({
  theme: T,
  tableRows: _tableRows,
  filteredOutliers,
  filteredNoClubOutliers,
  filteredNoClubRaw,
  allClubs,
  insightsOrder,
  onDragStart,
  onDragOver,
  onDrop,
  allShots,
}: Props) {

  /* ---------- DIST (Horizontal stacked bars: Avg Carry + Avg Roll) ---------- */
  type DistRow = {
    club: string;
    avgCarry: number;        // average Carry
    avgRoll: number;         // average (Total - Carry), >= 0
    avgTotal: number;        // convenience for tooltip
    n: number;               // shots counted for carry
    nTotal: number;          // shots counted for total
  };

  const distRows: DistRow[] = useMemo(() => {
    const byClub = groupBy(
      filteredOutliers.filter(s => isNum(s.CarryDistance_yds) || isNum(s.TotalDistance_yds)),
      s => s.Club || "Unknown"
    );
    const order = new Map(allClubs.map((c,i)=>[c,i]));
    const out: DistRow[] = [];

    for (const [club, shots] of byClub.entries()) {
      const carries = shots.map(s => s.CarryDistance_yds).filter(isNum) as number[];
      const totals  = shots.map(s => s.TotalDistance_yds).filter(isNum)   as number[];

      if (!carries.length && !totals.length) continue;

      const avgCarry = avg(carries) ?? 0;
      const avgTotal = avg(totals)  ?? avgCarry; // if no totals, treat total ~= carry
      const avgRoll  = Math.max(0, avgTotal - avgCarry);

      out.push({
        club,
        avgCarry,
        avgRoll,
        avgTotal,
        n: carries.length,
        nTotal: totals.length
      });
    }
    out.sort((a,b)=> (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return out;
  }, [filteredOutliers, allClubs]);

  // Domain: padded max of avgTotal (so full bar fits nicely)
  const xMax = useMemo(() => {
    if (!distRows.length) return 100;
    const m = Math.max(...distRows.map(r => r.avgTotal));
    return Math.ceil((m + 5) / 10) * 10;
  }, [distRows]);

  // Dynamic height so every club label is rendered clearly
  const chartHeight = Math.max(220, distRows.length * 28);

  // Tooltip
  const DistTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const row = distRows.find(r => r.club === label);
    if (!row) return null;
    const f1 = (n: number) => Math.round(n);
    return (
      <div className="rounded-md p-2 border text-xs" style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}>
        <div className="font-semibold mb-1">{row.club}</div>
        <div>Avg Carry: {f1(row.avgCarry)} yds {row.n ? `(n=${row.n})` : ""}</div>
        <div>Avg Roll: {f1(row.avgRoll)} yds</div>
        <div>Avg Total: {f1(row.avgTotal)} yds {row.nTotal ? `(n=${row.nTotal})` : ""}</div>
      </div>
    );
  };

  // Custom legend so the swatches exactly match the bar colors (brand & brand@0.45)
  const DistLegend = () => (
    <div className="flex gap-4 text-xs mt-1" style={{ color: T.textDim }}>
      <div className="inline-flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded" style={{ background: T.brand }} />
        Carry
      </div>
      <div className="inline-flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded" style={{ background: T.brand, opacity: 0.45 }} />
        Roll
      </div>
    </div>
  );

  const dist = (
    <div key="dist" draggable onDragStart={onDragStart("dist")} onDragOver={onDragOver("dist")} onDrop={onDrop("dist")}>
      <Card title="Distance (Avg) — Carry + Total (Stacked)" theme={T}>
        {distRows.length ? (
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer>
              <BarChart
                data={distRows}
                layout="vertical"
                margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis type="number" domain={[0, xMax]} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="club" width={100} tick={{ fontSize: 12 }} interval={0} />
                <Tooltip content={<DistTooltip />} />
                {/* Use custom legend so colors match bars exactly */}
                <Legend content={<DistLegend />} />

                {/* Stacked: Carry (brand), Roll (brand, lighter). Total = Carry + Roll */}
                <Bar name="Carry" dataKey="avgCarry" stackId="dist" fill={T.brand} />
                <Bar name="Roll"  dataKey="avgRoll"  stackId="dist" fill={T.brand} fillOpacity={0.45} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No distance data available.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- HIGH (Highlights — ignore filters using allShots) ---------- */
  const ALL = allShots ?? filteredNoClubRaw;
  const prCarry = useMemo(() => {
    const best = maxBy(ALL, s => isNum(s.CarryDistance_yds) ? s.CarryDistance_yds! : null);
    return best ? { v: best.CarryDistance_yds as number, club: best.Club, ts: best.Timestamp } : null;
  }, [ALL]);
  const prTotal = useMemo(() => {
    const best = maxBy(ALL, s => isNum(s.TotalDistance_yds) ? s.TotalDistance_yds! : null);
    return best ? { v: best.TotalDistance_yds as number, club: best.Club, ts: best.Timestamp } : null;
  }, [ALL]);
  const mostConsistent = useMemo(() => {
    const MIN = 5;
    const byClub = groupBy(ALL.filter(s => isNum(s.CarryDistance_yds)), s => s.Club || "Unknown");
    let bestClub: string | null = null; let bestSd = Infinity;
    for (const [club, rows] of byClub.entries()) {
      if (rows.length < MIN) continue;
      const carries = rows.map(s => s.CarryDistance_yds as number);
      const sd = stddev(carries);
      if (sd != null && sd < bestSd) { bestSd = sd; bestClub = club; }
    }
    return bestClub ? { club: bestClub, sd: bestSd } : null;
  }, [ALL]);

  const high = (
    <div key="high" draggable onDragStart={onDragStart("high")} onDragOver={onDragOver("high")} onDrop={onDrop("high")}>
      <Card title="Highlights (All Data)" theme={T}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCell theme={T} label="PR • Carry" value={prCarry ? `${Math.round(prCarry.v)} yds` : "—"} sub={prCarry ? `${prCarry.club}${prCarry.ts ? ` • ${new Date(prCarry.ts).toLocaleDateString()}` : ""}` : "No data"} />
          <KpiCell theme={T} label="PR • Total Distance" value={prTotal ? `${Math.round(prTotal.v)} yds` : "—"} sub={prTotal ? `${prTotal.club}${prTotal.ts ? ` • ${new Date(prTotal.ts).toLocaleDateString()}` : ""}` : "No data"} />
          <KpiCell theme={T} label="Most Consistent Club" value={mostConsistent ? mostConsistent.club : "—"} sub={mostConsistent ? `Lowest carry SD ≈ ${mostConsistent.sd!.toFixed(1)} yds` : "Need ≥5 shots"} />
        </div>
      </Card>
    </div>
  );

  
  
  /* ---------- BENCHMARKS (single club only) ---------- */
  const benchLevels = ["Beginner","Average","Good","Advanced","PGA Tour"] as const;
  const benchChart: Record<string, number[]> = {
    driver: [180,220,250,280,296],
    "3w": [170,210,225,235,262],
    "5w": [150,195,205,220,248],
    hybrid: [145,180,190,210,242],
    "2i": [100,180,190,215,236],
    "3i": [100,170,180,205,228],
    "4i": [100,160,170,195,219],
    "5i": [125,155,165,185,209],
    "6i": [120,145,160,175,197],
    "7i": [110,140,150,165,185],
    "8i": [100,130,140,155,172],
    "9i": [90,115,125,145,159],
    pw: [80,100,110,135,146],
    gw: [60,90,100,125,135],
    aw: [60,90,100,125,135],  // treat A‑wedge same as gap
    sw: [55,80,95,115,124],
    lw: [40,60,80,105,113],
  };

  function benchKey(clubRaw: string): string | null {
    const norm = (clubRaw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!norm) return null;
    if (norm === "1w" || norm.includes("driver")) return "driver";
    if (norm === "3w" || norm.includes("3wood")) return "3w";
    if (norm === "5w" || norm.includes("5wood")) return "5w";
    if (/^[1-6]h$/.test(norm) || norm.includes("hybrid")) return "hybrid";
    const mIron = norm.match(/^([2-9])(iron|i)?$/) || norm.match(/^([2-9])i(ron)?$/);
    if (mIron) return `${mIron[1]}i`;
    if (norm === "pw" || norm.includes("pitchingwedge") || norm.includes("pitching")) return "pw";
    if (norm === "gw" || norm === "aw" || norm.includes("gapwedge") || norm.includes("approachwedge") || norm.includes("approach")) return "gw";
    if (norm === "sw" || norm.includes("sandwedge") || norm.includes("sand")) return "sw";
    if (norm === "lw" || norm.includes("lobwedge") || norm.includes("lob")) return "lw";
    return null;
  }

  function classifyBenchmark(vals: number[], v: number): {label: string; idx: number} {
    if (!vals || vals.length !== 5 || !Number.isFinite(v)) return { label: "—", idx: -1 };
    const mids = [
      (vals[0]+vals[1])/2,
      (vals[1]+vals[2])/2,
      (vals[2]+vals[3])/2,
      (vals[3]+vals[4])/2,
    ];
    if (v < mids[0]) return { label: benchLevels[0], idx: 0 };
    if (v < mids[1]) return { label: benchLevels[1], idx: 1 };
    if (v < mids[2]) return { label: benchLevels[2], idx: 2 };
    if (v < mids[3]) return { label: benchLevels[3], idx: 3 };
    return { label: benchLevels[4], idx: 4 };
  }

  // Derive the currently visible clubs (based on filters) locally to avoid ordering issues.
  const benchClubs = useMemo(
    () => Array.from(new Set(filteredOutliers.map(s => s.Club || "Unknown"))),
    [filteredOutliers]
  );

  const benchData = useMemo(() => {
    if (benchClubs.length !== 1) return null;
    const club = benchClubs[0];
    const shots = filteredOutliers.filter(s => (s.Club || "Unknown") === club);
    if (!shots.length) return null;
    const totals = shots.map(s => s.TotalDistance_yds).filter(isNum) as number[];
    const carries = shots.map(s => s.CarryDistance_yds).filter(isNum) as number[];
    const avgTotal = (totals.length ? avg(totals) : (carries.length ? avg(carries) : null));
    if (avgTotal == null) return null;
    const key = benchKey(club);
    const row = key ? benchChart[key] : undefined;
    const cls = row ? classifyBenchmark(row, avgTotal) : { label: "—", idx: -1 };
    let range = "";
    if (row && cls.idx >= 0) {
      if (cls.idx < 4) range = `${row[cls.idx]}–${row[cls.idx+1]} yds`;
      else range = `≥ ${row[4]} yds`;
    }
    return {
      club,
      avgTotal,
      n: totals.length || carries.length,
      benchLabel: cls.label,
      benchRange: range,
    };
  }, [benchClubs, filteredOutliers]);

  const bench = (
    <div
      key="bench"
      draggable
      onDragStart={onDragStart("bench")}
      onDragOver={onDragOver("bench")}
      onDrop={onDrop("bench")}
    >
      <Card title="Benchmarks" right={benchClubs.length === 1 ? benchClubs[0] : ""} theme={T}>
        {benchData ? (
          <div className="grid grid-cols-2 gap-3">
            <KpiCell theme={T} label="Avg Total" value={`${benchData.avgTotal.toFixed(1)} yds`} sub={`n=${benchData.n}`} />
            <KpiCell theme={T} label="Benchmark" value={benchData.benchLabel} sub={benchData.benchRange || undefined} />
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>Select a single club to see benchmark targets.</div>
        )}
      </Card>
    </div>
  );
/* ---------- SWINGS (Selected club only; 4 KPI tiles) ---------- */
  const selectedClubs = useMemo(
    () => Array.from(new Set(filteredOutliers.map(s => s.Club || "Unknown"))),
    [filteredOutliers]
  );

  const selectedClubMetrics = useMemo(() => {
    if (selectedClubs.length !== 1) return null;
    const club = selectedClubs[0];
    const shots = filteredOutliers.filter(s => (s.Club || "Unknown") === club);
    const aoaVals  = shots.map(s => s.AttackAngle_deg).filter(isNum) as number[];
    const pathVals = shots.map(s => s.ClubPath_deg).filter(isNum) as number[];
    const faceVals = shots.map(s => s.ClubFace_deg).filter(isNum) as number[];
    const f2pVals  = shots.map(s => s.FaceToPath_deg).filter(isNum) as number[];
    return {
      club,
      n: shots.length,
      aoa:  avg(aoaVals)  ?? undefined,
      path: avg(pathVals) ?? undefined,
      face: avg(faceVals) ?? undefined,
      f2p:  avg(f2pVals)  ?? undefined,
    };
  }, [filteredOutliers, selectedClubs]);

  const fmt = (n?: number) => (n != null && Number.isFinite(n) ? n.toFixed(1) : "—");

  const swings = (
    <div
      key="swings"
      draggable
      onDragStart={onDragStart("swings")}
      onDragOver={onDragOver("swings")}
      onDrop={onDrop("swings")}
    >
      <Card title="Swing Metrics (Selected Club)" theme={T}>
        {selectedClubMetrics ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCell theme={T} label={`${selectedClubMetrics.club} • AoA`}  value={`${fmt(selectedClubMetrics.aoa)}°`}  sub={`n=${selectedClubMetrics.n}`} />
            <KpiCell theme={T} label={`${selectedClubMetrics.club} • Path`} value={`${fmt(selectedClubMetrics.path)}°`} sub={`n=${selectedClubMetrics.n}`} />
            <KpiCell theme={T} label={`${selectedClubMetrics.club} • Face`} value={`${fmt(selectedClubMetrics.face)}°`} sub={`n=${selectedClubMetrics.n}`} />
            <KpiCell theme={T} label={`${selectedClubMetrics.club} • Face to Path`} value={`${fmt(selectedClubMetrics.f2p)}°`} sub={`n=${selectedClubMetrics.n}`} />
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>
            Select a single club to see swing angles (AoA, Path, Face, Face-to-Path).
          </div>
        )}
      </Card>
    </div>
  );

  /* ---------- RECORDS (per-club bests; FILTERED) ---------- */
  const recordsRows = useMemo(() => {
    const byClub = groupBy(filteredOutliers, s => s.Club || "Unknown");
    const order = new Map(allClubs.map((c,i)=>[c,i]));
    const out: { club: string; carry?: number; total?: number; ball?: number; clubspd?: number }[] = [];
    for (const [club, rows] of byClub.entries()) {
      const bestCarry = maxBy(rows, s => isNum(s.CarryDistance_yds) ? s.CarryDistance_yds! : null);
      const bestTotal = maxBy(rows, s => isNum(s.TotalDistance_yds) ? s.TotalDistance_yds! : null);
      const bestBall  = maxBy(rows, s => isNum(s.BallSpeed_mph)   ? s.BallSpeed_mph!   : null);
      const bestClubS = maxBy(rows, s => isNum(s.ClubSpeed_mph)   ? s.ClubSpeed_mph!   : null);
      out.push({
        club,
        carry: bestCarry?.CarryDistance_yds,
        total: bestTotal?.TotalDistance_yds,
        ball:  bestBall?.BallSpeed_mph,
        clubspd: bestClubS?.ClubSpeed_mph
      });
    }
    out.sort((a,b)=> (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return out;
  }, [filteredOutliers, allClubs]);

  const records = (
    <div key="records" draggable onDragStart={onDragStart("records")} onDragOver={onDragOver("records")} onDrop={onDrop("records")}>
      <Card title="Personal Records (by Club)" theme={T}>
        {recordsRows.length ? (
          <div className="overflow-auto rounded-lg border" style={{ borderColor: T.border }}>
            <table className="w-full text-sm" style={{ color: T.text }}>
              <thead style={{ background: T.panelAlt }}>
                <tr>
                  <th className="text-left px-2 py-1">Club</th>
                  <th className="text-right px-2 py-1">Best Carry</th>
                  <th className="text-right px-2 py-1">Best Total</th>
                  <th className="text-right px-2 py-1">Max Ball</th>
                  <th className="text-right px-2 py-1">Max Club</th>
                </tr>
              </thead>
              <tbody>
                {recordsRows.map((r) => (
                  <tr key={r.club} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td className="px-2 py-1">{r.club}</td>
                    <td className="px-2 py-1 text-right">{r.carry   != null ? Math.round(r.carry)   : ""}</td>
                    <td className="px-2 py-1 text-right">{r.total   != null ? Math.round(r.total)   : ""}</td>
                    <td className="px-2 py-1 text-right">{r.ball    != null ? r.ball.toFixed(1)    : ""}</td>
                    <td className="px-2 py-1 text-right">{r.clubspd != null ? r.clubspd.toFixed(1) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No data.</div>}
      </Card>
    </div>
  );

  /* ---------- GAPS (simple gapping warnings; FILTERED) ---------- */
  const gapsRows = useMemo(() => {
    const byClub = groupBy(filteredOutliers.filter(s => isNum(s.CarryDistance_yds)), s => s.Club || "Unknown");
    const order = new Map(allClubs.map((c,i)=>[c,i]));
    const avgs: { club: string; carry: number }[] = [];
    for (const [club, rows] of byClub.entries()) {
      const carries = rows.map(s => s.CarryDistance_yds as number);
      const a = avg(carries);
      if (a != null) avgs.push({ club, carry: a });
    }
    avgs.sort((a,b)=> (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    const out: { clubs: string; note: string }[] = [];
    for (let i=1;i<avgs.length;i++) {
      const d = Math.abs(avgs[i].carry - avgs[i-1].carry);
      if (d < 8) out.push({ clubs: `${avgs[i-1].club} ↔ ${avgs[i].club}`, note: `Avg carry gap small (${d.toFixed(1)} yds)` });
    }
    return out;
  }, [filteredOutliers, allClubs]);

  const gaps = (
    <div key="gaps" draggable onDragStart={onDragStart("gaps")} onDragOver={onDragOver("gaps")} onDrop={onDrop("gaps")}>
      <Card title="Gapping Warnings" theme={T}>
        {gapsRows.length ? (
          <ul className="text-sm list-disc pl-6" style={{ color: T.text }}>
            {gapsRows.map((g,i)=>(<li key={i}>{g.clubs}: {g.note}</li>))}
          </ul>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No warnings.</div>}
      </Card>
    </div>
  );

  /* ---------- PROGRESS (carry over sessions for selected club; FILTERED) ---------- */
  const progressRows = useMemo(() => {
    const clubs = Array.from(new Set(filteredNoClubOutliers.map(s => s.Club)));
    if (clubs.length !== 1) return [] as { t: string; carry: number }[];
    const rows = filteredNoClubOutliers
      .filter(s => isNum(s.CarryDistance_yds) && s.Timestamp)
      .sort((a,b)=> new Date(a.Timestamp!).getTime() - new Date(b.Timestamp!).getTime());
    return rows.map(s => ({ t: s.Timestamp!, carry: s.CarryDistance_yds as number }));
  }, [filteredNoClubOutliers]);

  const progress = (
    <div key="progress" draggable onDragStart={onDragStart("progress")} onDragOver={onDragOver("progress")} onDrop={onDrop("progress")}>
      <Card title="Club Progress (Carry)" theme={T}>
        {progressRows.length ? (
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={progressRows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis dataKey="t" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="carry" name="Carry (yds)" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>Select a single club to see progress.</div>}
      </Card>
    </div>
  );

  const cardMap: Record<string, React.ReactNode> = {
    dist,
    high,
    bench,
    swings,
    records,
    gaps,
    progress
  };

  return (
    <div className="grid gap-4">
      {insightsOrder.map((key) => cardMap[key] ?? null)}
    </div>
  );
}
