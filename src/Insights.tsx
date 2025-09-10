// src/Insights.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import { Card } from "./components/UI";
import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line
} from "recharts";
import { groupBy, mean, stddev, calculateConsistencyIndex, calculateVirtualHandicap } from "./utils";

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

function avg(nums: number[]) { return nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : null; }
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
}: { label: string; value: string; sub?: React.ReactNode; theme: Theme; }) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{ background: T.panelAlt, borderColor: T.border }}
      onMouseOver={(e) => { if (T.mode === 'light') e.currentTarget.style.backgroundColor = '#dbe8e1'; }}
      onMouseOut={(e) => { e.currentTarget.style.backgroundColor = T.panelAlt; }}
    >
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

  // Modal states
  const [isBenchmarkModalOpen, setBenchmarkModalOpen] = useState(false);
  const [isSwingModalOpen, setSwingModalOpen] = useState(false);
  const [isConsistencyModalOpen, setConsistencyModalOpen] = useState(false);
  
  // Swing matrix data
  const [swingMatrix, setSwingMatrix] = useState<any>(null);
  useEffect(() => {
    fetch('/swing_matrix.json')
      .then(res => res.json())
      .then(data => setSwingMatrix(data))
      .catch(err => console.error("Failed to load swing_matrix.json", err));
  }, []);

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
    const byClub = groupBy(ALL.filter(s => isNum(s.CarryDistance_yds)), (s: Shot) => s.Club || "Unknown");
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
  const optimalSmash: Record<string, number> = {
    driver: 1.49, "3w": 1.48, "5w": 1.47, hybrid: 1.46, "3i": 1.45, "4i": 1.43,
    "5i": 1.41, "6i": 1.38, "7i": 1.33, "8i": 1.32, "9i": 1.28, pw: 1.23,
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
    const smashes = shots.map(s => s.SmashFactor).filter(isNum) as number[];

    const avgTotal = (totals.length ? avg(totals) : (carries.length ? avg(carries) : null));
    const avgSmash = avg(smashes);
    
    const key = benchKey(club);
    const distRow = key ? benchChart[key] : undefined;
    const distCls = (distRow && avgTotal != null) ? classifyBenchmark(distRow, avgTotal) : { label: "—", idx: -1 };
    let distRange = "";
    if (distRow && distCls.idx >= 0) {
      if (distCls.idx < 4) distRange = `${distRow[distCls.idx]}–${distRow[distCls.idx+1]} yds`;
      else distRange = `≥ ${distRow[4]} yds`;
    }

    const optimal = key ? optimalSmash[key] : undefined;
    const pctOptimal = (avgSmash != null && optimal != null) ? (avgSmash / optimal) * 100 : null;

    return {
      club,
      avgTotal,
      avgSmash,
      pctOptimal,
      n: totals.length || carries.length,
      benchLabel: distCls.label,
      benchRange: distRange,
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
      <Card
        title="Benchmarks"
        right={<button onClick={() => setBenchmarkModalOpen(true)} className="text-xs underline" style={{color: T.brand}}>View Table</button>}
        theme={T}
      >
        {benchData ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCell theme={T} label="Avg Total" value={benchData.avgTotal != null ? `${benchData.avgTotal.toFixed(1)} yds` : "—"} sub={`n=${benchData.n}`} />
            <KpiCell theme={T} label="Distance Tier" value={benchData.benchLabel} sub={benchData.benchRange || undefined} />
            <KpiCell theme={T} label="Avg Smash" value={benchData.avgSmash != null ? benchData.avgSmash.toFixed(3) : "—"} />
            <KpiCell theme={T} label="% of Optimal Smash" value={benchData.pctOptimal != null ? `${benchData.pctOptimal.toFixed(1)}%` : "—"} sub={optimalSmash[benchKey(benchData.club) || ""] ? `Tour avg: ${optimalSmash[benchKey(benchData.club) || ""]}` : ""} />
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>Select a single club to see benchmark targets.</div>
        )}
      </Card>
    </div>
  );

/* ---------- ASSESSMENT (virtual hcap, consistency) ----------- */
  const consistencyIndex = useMemo(() => calculateConsistencyIndex(filteredNoClubRaw), [filteredNoClubRaw]);
  const virtualHandicap = useMemo(() => calculateVirtualHandicap(filteredNoClubRaw), [filteredNoClubRaw]);
  
  const gapsRows = useMemo(() => {
    const BASE = allShots ?? filteredNoClubRaw;
    const withCarry = BASE.filter(s => isNum(s.CarryDistance_yds));
    const byClub = groupBy(withCarry, (s: Shot) => s.Club || "Unknown");
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
  }, [allShots, filteredNoClubRaw, allClubs]);

  const assessment = (
    <div key="assessment" draggable onDragStart={onDragStart("assessment")} onDragOver={onDragOver("assessment")} onDrop={onDrop("assessment")}>
      <Card title="Assessment" theme={T}>
        {filteredNoClubRaw.length > 5 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KpiCell
              theme={T}
              label="Consistency Index"
              value={consistencyIndex != null ? `${(consistencyIndex * 100).toFixed(1)}%` : "—"}
              sub={<button onClick={() => setConsistencyModalOpen(true)} className="underline">What does this mean?</button>}
            />
            <KpiCell
              theme={T}
              label="Virtual Handicap"
              value={virtualHandicap != null ? `≈ ${virtualHandicap.toFixed(1)}` : "—"}
              sub="Dispersion & consistency score"
            />
            <KpiCell
              theme={T}
              label="Gapping Warnings"
              value={gapsRows.length > 0 ? String(gapsRows.length) : "None"}
              sub={
                gapsRows.length > 0 ? (
                  <ul className="text-left list-disc pl-4 text-xs">
                    {gapsRows.map((g, i) => <li key={i}>{g.note}</li>)}
                  </ul>
                ) : "No significant gaps found."
              }
            />
          </div>
        ) : (
           <div className="text-sm" style={{ color: T.textDim }}>Not enough data for an assessment. Keep hitting!</div>
        )}
      </Card>
    </div>
  );

/* ---------- SWINGS (single KPI set; respects filters) ---------- */
  const selectedClubs = useMemo(
    () => Array.from(new Set(filteredOutliers.map(s => s.Club || "Unknown"))),
    [filteredOutliers]
  );

  const swingShots = useMemo(() => {
    if (!filteredOutliers.length) return [] as Shot[];
    if (selectedClubs.length === 1) {
      const c = selectedClubs[0];
      return filteredOutliers.filter(s => (s.Club || "Unknown") === c);
    }
    return filteredOutliers;
  }, [filteredOutliers, selectedClubs]);

  const swingAgg = useMemo(() => {
    const aoaVals  = swingShots.map(s => s.AttackAngle_deg).filter(isNum) as number[];
    const pathVals = swingShots.map(s => s.ClubPath_deg).filter(isNum) as number[];
    const faceVals = swingShots.map(s => s.ClubFace_deg).filter(isNum) as number[];
    const f2pVals  = swingShots.map(s => s.FaceToPath_deg).filter(isNum) as number[];
    return {
      n: swingShots.length,
      aoa:  avg(aoaVals)  ?? undefined,
      path: avg(pathVals) ?? undefined,
      face: avg(faceVals) ?? undefined,
      f2p:  avg(f2pVals)  ?? undefined,
    };
  }, [swingShots]);
  
  const swingAnalysis = useMemo(() => {
    if (!swingMatrix || swingAgg.n === 0) return null;
    
    const club = selectedClubs.length === 1 ? selectedClubs[0] : 'Unknown';
    const isDriver = /driver/i.test(club);

    const getAoAState = (val?: number) => {
      if (val == null) return "Neutral";
      if (isDriver) {
        if (val > 1.5) return "Up";
        if (val < -1.5) return "Down";
        return "Neutral";
      }
      // Irons
      if (val > -1.5) return "Up";
      if (val < -5) return "Down";
      return "Neutral";
    };

    const getPathState = (val?: number) => {
      if (val == null) return "Neutral";
      if (val > 2) return "In-to-out";
      if (val < -2) return "Out-to-in";
      return "Neutral";
    };

    const getFaceState = (val?: number) => {
      if (val == null) return "Square";
      if (val > 2) return "Open (right)";
      if (val < -2) return "Closed (left)";
      return "Square";
    };

    const states = {
      aoa_state: getAoAState(swingAgg.aoa),
      path_state: getPathState(swingAgg.path),
      face_state: getFaceState(swingAgg.face),
    };
    
    return swingMatrix.combinations.find(
      (c: any) => c.aoa_state === states.aoa_state && c.path_state === states.path_state && c.face_state === states.face_state
    ) || null;
  }, [swingAgg, swingMatrix, selectedClubs]);


  const fmt = (n?: number) => (n != null && Number.isFinite(n) ? n.toFixed(1) : "—");

  const swings = (
    <div
      key="swings"
      draggable
      onDragStart={onDragStart("swings")}
      onDragOver={onDragOver("swings")}
      onDrop={onDrop("swings")}
    >
      <Card
        title="Swing Metrics"
        right={<button onClick={() => setSwingModalOpen(true)} disabled={!swingAnalysis} className="text-xs underline disabled:opacity-50" style={{color: T.brand}}>Get Advice</button>}
        theme={T}
      >
        {swingShots.length ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCell theme={T} label="AoA"  value={`${fmt(swingAgg.aoa)}°`}  sub={`n=${swingAgg.n}`} />
            <KpiCell theme={T} label="Path" value={`${fmt(swingAgg.path)}°`} sub={`n=${swingAgg.n}`} />
            <KpiCell theme={T} label="Face" value={`${fmt(swingAgg.face)}°`} sub={`n=${swingAgg.n}`} />
            <KpiCell theme={T} label="F→P"  value={`${fmt(swingAgg.f2p)}°`}  sub={`n=${swingAgg.n}`} />
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>
            Import shots and/or adjust filters to see swing angles (AoA, Path, Face, Face-to-Path).
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

  /* ---------- PROGRESS (carry over sessions for selected club; FILTERED) ---------- */
  const progressClub = useMemo(() => {
    const clubs = Array.from(new Set(filteredNoClubOutliers.map(s => s.Club)));
    return clubs.length === 1 ? clubs[0] : null;
  }, [filteredNoClubOutliers]);

  const progressRows = useMemo(() => {
    if (!progressClub) return [];
    const rows = filteredNoClubOutliers
      .filter(s => isNum(s.CarryDistance_yds) && s.Timestamp && s.Club === progressClub)
      .sort((a,b)=> new Date(a.Timestamp!).getTime() - new Date(b.Timestamp!).getTime());
    return rows.map(s => ({ t: s.Timestamp!, carry: s.CarryDistance_yds as number }));
  }, [filteredNoClubOutliers, progressClub]);
  
  const progressTrend = useMemo(() => {
    const n = progressRows.length;
    if (n < 2) return [] as { t: string; trend: number }[];
    const xs = progressRows.map((_, i) => i);
    const ys = progressRows.map(r => r.carry);
    const sum = (arr: number[]) => arr.reduce((a,b)=>a+b, 0);
    const Sx = sum(xs);
    const Sy = sum(ys);
    const Sxx = sum(xs.map(x=>x*x));
    const Sxy = sum(xs.map((x,i)=>x*ys[i]));
    const denom = n * Sxx - Sx * Sx;
    if (denom === 0) return [] as { t: string; trend: number }[];
    const slope = (n * Sxy - Sx * Sy) / denom;
    const intercept = (Sy - slope * Sx) / n;
    return progressRows.map((r,i)=>({ t: r.t, trend: intercept + slope * i }));
  }, [progressRows]);

  const progressChartData = useMemo(() => {
    if (!progressRows.length) return progressRows as any;
    if (!progressTrend.length) return progressRows as any;
    return progressRows.map((r, i) => ({ ...r, trend: progressTrend[i]?.trend ?? null }));
  }, [progressRows, progressTrend]);

  const formatDateTick = (tick: string) => new Date(tick).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const progress = (
    <div key="progress" draggable onDragStart={onDragStart("progress")} onDragOver={onDragOver("progress")} onDrop={onDrop("progress")}>
      <Card title="Club Progress (Carry)" theme={T} right={progressClub || ""}>
        {progressRows.length ? (
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={progressChartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis dataKey="t" tick={{ fontSize: 12 }} tickFormatter={formatDateTick} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: T.panelAlt, color: T.text, border: `1px solid ${T.border}`, borderRadius: '6px' }} />
                <Legend />
                <Line type="monotone" dataKey="carry" name="Carry (yds)" stroke={T.brand} dot={false} />
                <Line type="linear" dataKey="trend" name="Trend" dot={false} stroke={T.textDim} strokeDasharray="5 5" />
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
    assessment,
    swings,
    records,
    progress
  };

  return (
    <>
      <div className="grid gap-4">
        {insightsOrder.map((key) => cardMap[key] ?? null)}
      </div>
      {isBenchmarkModalOpen && <BenchmarkModal data={benchChart} levels={benchLevels} theme={T} onClose={() => setBenchmarkModalOpen(false)} />}
      {isSwingModalOpen && swingAnalysis && <SwingCorrectionsModal analysis={swingAnalysis} theme={T} onClose={() => setSwingModalOpen(false)} />}
      {isConsistencyModalOpen && <ConsistencyModal theme={T} onClose={() => setConsistencyModalOpen(false)} />}
    </>
  );
}

function BenchmarkModal({data, levels, theme, onClose}: {data: Record<string, number[]>, levels: readonly string[], theme: Theme, onClose: () => void}) {
  const clubs = Object.keys(data);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background: "rgba(0,0,0,0.5)"}} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl border shadow-lg overflow-hidden" style={{background: theme.panel, borderColor: theme.border}} onClick={e => e.stopPropagation()}>
        <header className="p-3 flex items-center justify-between" style={{borderBottom: `1px solid ${theme.border}`, background: theme.panelAlt}}>
          <h3 className="font-semibold">Distance Benchmarks (Total yds)</h3>
          <button className="text-xs underline" style={{color: theme.brand}} onClick={onClose}>Close</button>
        </header>
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm text-center">
            <thead>
              <tr style={{color: theme.textDim}}>
                <th className="text-left py-1 px-2">Club</th>
                {levels.map(l => <th key={l} className="py-1 px-2">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {clubs.map(club => (
                <tr key={club} style={{borderTop: `1px solid ${theme.border}`}}>
                  <td className="text-left py-1 px-2 font-semibold">{club}</td>
                  {data[club].map((val, i) => <td key={i} className="py-1 px-2">{val}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SwingCorrectionsModal({analysis, theme, onClose}: {analysis: any, theme: Theme, onClose: () => void}) {
  const clubType = /driver/i.test(analysis.club || "") ? 'driver' : 'irons';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background: "rgba(0,0,0,0.5)"}} onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border shadow-lg overflow-hidden" style={{background: theme.panel, borderColor: theme.border}} onClick={e => e.stopPropagation()}>
        <header className="p-3 flex items-center justify-between" style={{borderBottom: `1px solid ${theme.border}`, background: theme.panelAlt}}>
          <h3 className="font-semibold">Swing Analysis & Corrections</h3>
          <button className="text-xs underline" style={{color: theme.brand}} onClick={onClose}>Close</button>
        </header>
        <div className="p-4 max-h-[70vh] overflow-y-auto text-sm">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div><strong style={{color: theme.textDim}}>Typical Shot:</strong> {analysis.typical_shot}</div>
            <div><strong style={{color: theme.textDim}}>Result:</strong> {analysis.ball_start} start, {analysis.curve} curve</div>
          </div>
          <div className="mb-3"><strong style={{color: theme.textDim}}>Tendencies:</strong> {analysis.tendencies}</div>

          {analysis.corrections?.primary?.length > 0 && (
            <div className="mb-3">
              <h4 className="font-semibold mb-1">Primary Corrections:</h4>
              <ul className="list-disc pl-5 space-y-1">
                {analysis.corrections.primary.map((c: string, i: number) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
          {analysis.corrections?.[clubType]?.length > 0 && (
            <div>
              <h4 className="font-semibold mb-1">{clubType === 'driver' ? "Driver Tips:" : "Iron/Wedge Tips:"}</h4>
              <ul className="list-disc pl-5 space-y-1">
                {analysis.corrections[clubType].map((c: string, i: number) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ConsistencyModal({theme, onClose}: {theme: Theme, onClose: () => void}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background: "rgba(0,0,0,0.5)"}} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border shadow-lg overflow-hidden" style={{background: theme.panel, borderColor: theme.border}} onClick={e => e.stopPropagation()}>
        <header className="p-3 flex items-center justify-between" style={{borderBottom: `1px solid ${theme.border}`, background: theme.panelAlt}}>
          <h3 className="font-semibold">Consistency Index</h3>
          <button className="text-xs underline" style={{color: theme.brand}} onClick={onClose}>Close</button>
        </header>
        <div className="p-4 text-sm space-y-2">
          <p>This score measures the statistical variation of your carry distance for each club, then averages those scores. A higher score means less variation.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>≥ 85%:</strong> Excellent consistency (tour-like, under stable conditions)</li>
            <li><strong>75–85%:</strong> Solid; gapping and strategy decisions are reliable</li>
            <li><strong>65–75%:</strong> Inconsistent; work on strike quality/face control before trusting averages</li>
            <li><strong>&lt; 65%:</strong> Not reliable yet; collect more shots, simplify goals, add drills</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
