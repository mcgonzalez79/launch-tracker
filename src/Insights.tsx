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

  // Optional: when present, Highlights will truly ignore filter
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
   Distance Distribution (stacked horizontal bars)
========================= */

// Row shape for the distance distribution card
interface DistRow { club: string; avgCarry: number; avgRoll: number; avgTotal: number; n: number; nTotal: number; }

export default function InsightsView({
  theme: T,
  tableRows,
  filteredOutliers,
  filteredNoClubOutliers,
  filteredNoClubRaw,
  allClubs,
  insightsOrder,
  onDragStart,
  onDragOver,
  onDrop,
  allShots
}: Props) {
  const distRows = useMemo(() => {
    // Group filtered shots by club
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
  const maxAvgTotal = useMemo(() => {
    return distRows.length ? Math.max(...distRows.map(r => r.avgTotal)) : 0;
  }, [distRows]);

  const dist = (
    <div key="dist" draggable onDragStart={onDragStart("dist")} onDragOver={onDragOver("dist")} onDrop={onDrop("dist")}>
      <Card title="Distance Distribution" right="Avg Carry + Avg Roll = Avg Total" theme={T}>
        {distRows.length ? (
          <div className="w-full" style={{ height: Math.max(240, Math.min(560, distRows.length * 28)) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distRows} layout="vertical" margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid horizontal vertical={false} stroke={T.grid} />
                <XAxis type="number" domain={[0, Math.ceil(maxAvgTotal/10)*10]} tick={{ fill: T.textDim }} axisLine={{ stroke: T.axis }} tickLine={{ stroke: T.axis }} />
                <YAxis type="category" dataKey="club" width={80} tick={{ fill: T.text }} axisLine={{ stroke: T.axis }} tickLine={{ stroke: T.axis }} />
                <Tooltip formatter={(v: any, name: any) => [
                  typeof v === "number" ? `${v.toFixed(1)} yds` : v,
                  name === "avgCarry" ? "Avg Carry" : name === "avgRoll" ? "Avg Roll" : name
                ]} contentStyle={{ background: T.panel, borderColor: T.border, color: T.text }} />
                <Legend wrapperStyle={{ color: T.textDim }} formatter={(v: string) => v === "avgCarry" ? "Avg Carry" : v === "avgRoll" ? "Avg Roll" : v} />
                <Bar dataKey="avgCarry" stackId="d" fill={T.brand} />
                <Bar dataKey="avgRoll"  stackId="d" fill={T.brand} opacity={0.45} />
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
      <Card title="Highlights (All Data)" right="Ignores filters" theme={T}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCell theme={T} label="PR Carry" value={prCarry ? `${prCarry.v.toFixed(1)} yds` : "—"} sub={prCarry ? `${prCarry.club || ""}` : undefined} />
          <KpiCell theme={T} label="PR Total" value={prTotal ? `${prTotal.v.toFixed(1)} yds` : "—"} sub={prTotal ? `${prTotal.club || ""}` : undefined} />
          <KpiCell theme={T} label="Most Consistent Club" value={mostConsistent ? `${mostConsistent.club}` : "—"} sub={mostConsistent ? `lowest carry SD` : undefined} />
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
  // Optimal smash factor targets (PGA Tour reference)
  // Keys align with benchKey(…)
  const smashOptMap: Record<string, number> = {
    driver: 1.49,
    "3w": 1.48,
    "5w": 1.47,
    hybrid: 1.46,
    "3i": 1.45,
    "4i": 1.43,
    "5i": 1.41,
    "6i": 1.38,
    "7i": 1.33,
    "8i": 1.32,
    "9i": 1.28,
    pw: 1.23
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

    // Smash factor: prefer provided SmashFactor, else BS / CS
    const smashVals = shots.map(s => {
      const sf = (s as any).SmashFactor;
      if (isNum(sf)) return sf as number;
      const bs = (s as any).BallSpeed_mph;
      const cs = (s as any).ClubSpeed_mph;
      return (isNum(bs) && isNum(cs) && (cs as number) > 0) ? ((bs as number) / (cs as number)) : null;
    }).filter(isNum) as number[];
    const avgSmash = smashVals.length ? avg(smashVals) : null;

    const key = benchKey(club);
    const row = key ? benchChart[key] : undefined;
    const cls = row ? classifyBenchmark(row, avgTotal) : { label: "—", idx: -1 };
    let range = "";
    if (row && cls.idx >= 0) {
      if (cls.idx < 4) range = `${row[cls.idx]}–${row[cls.idx+1]} yds`;
      else range = `≥ ${row[4]} yds`;
    }

    const smashOpt = key ? smashOptMap[key] : undefined;
    const smashPct = (avgSmash != null && smashOpt) ? (avgSmash / smashOpt * 100) : null;

    return {
      club,
      avgTotal,
      n: totals.length || carries.length,
      benchLabel: cls.label,
      benchRange: range,
      avgSmash,
      nSmash: smashVals.length,
      smashOpt,
      smashPct
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
            {benchData.avgSmash != null
              ? <KpiCell theme={T} label="Avg Smash" value={`${benchData.avgSmash.toFixed(2)}`} sub={`n=${benchData.nSmash}`} />
              : <KpiCell theme={T} label="Avg Smash" value={"—"} />
            }
            <KpiCell
              theme={T}
              label="Smash vs Opt"
              value={benchData.smashPct != null ? `${benchData.smashPct.toFixed(0)}%` : "—"}
              sub={benchData.smashOpt != null ? `opt ${benchData.smashOpt.toFixed(2)}` : undefined}
            />
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>Select a single club to see benchmark targets.</div>
        )}
      </Card>
    </div>
  );

/* ---------- SWINGS (single KPI set; respects filters)
   - If exactly one club is selected: show that club's averages.
   - If multiple or no clubs are selected: show averages across the visible shots (selected clubs or all).
--------------------------------------------------------------------------- */
  const selectedClubs = useMemo(
    () => Array.from(new Set(filteredOutliers.map(s => s.Club || "Unknown"))),
    [filteredOutliers]
  );

  const swingShots = useMemo(() => {
    if (!filteredOutliers.length) return [] as Shot[];
    if (selectedClubs.length === 1) {
      const club = selectedClubs[0];
      return filteredOutliers.filter(s => (s.Club || "Unknown") === club);
    }
    return filteredOutliers;
  }, [filteredOutliers, selectedClubs]);

  const swingAgg = useMemo(() => {
    const aoa = swingShots.map(s => s.AttackAngle_deg).filter(isNum) as number[];
    const path = swingShots.map(s => s.ClubPath_deg).filter(isNum) as number[];
    const face = swingShots.map(s => s.ClubFace_deg).filter(isNum) as number[];
    const f2p = swingShots.map(s => s.FaceToPath_deg).filter(isNum) as number[];
    const n = Math.max(aoa.length, path.length, face.length, f2p.length);
    return {
      n,
      aoa: aoa.length ? avg(aoa)! : undefined,
      path: path.length ? avg(path)! : undefined,
      face: face.length ? avg(face)! : undefined,
      f2p: f2p.length ? avg(f2p)! : undefined,
    };
  }, [swingShots]);

  const fmt = (n?: number) => (n != null && Number.isFinite(n) ? n.toFixed(1) : "—");

  const swings = (
    <div
      key="swings"
      draggable
      onDragStart={onDragStart("swings")}
      onDragOver={onDragOver("swings")}
      onDrop={onDrop("swings")}
    >
      <Card title="Swing Metrics" right="AoA • Path • Face • Face→Path" theme={T}>
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
    const out: { club: string; prCarry?: number; prTotal?: number }[] = [];
    for (const [club, rows] of byClub.entries()) {
      const bestCarry = maxBy(rows, s => isNum(s.CarryDistance_yds) ? s.CarryDistance_yds! : null);
      const bestTotal = maxBy(rows, s => isNum(s.TotalDistance_yds) ? s.TotalDistance_yds! : null);
      out.push({ club, prCarry: bestCarry?.CarryDistance_yds, prTotal: bestTotal?.TotalDistance_yds });
    }
    return out;
  }, [filteredOutliers]);

  const records = (
    <div key="records" draggable onDragStart={onDragStart("records")} onDragOver={onDragOver("records")} onDrop={onDrop("records")}>
      <Card title="Club Records (Filtered)" theme={T}>
        {recordsRows.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {recordsRows.map(r => (
              <KpiCell key={r.club} theme={T} label={r.club}
                value={r.prTotal != null ? `${r.prTotal.toFixed(1)} yds` : "—"}
                sub={r.prCarry != null ? `PR Carry ${r.prCarry.toFixed(1)} yds` : undefined} />
            ))}
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No data.</div>}
      </Card>
    </div>
  );

  /* ---------- GAPS (simple gapping warnings; ALL data — ignores filters) ---------- */
  const gapsRows = useMemo(() => {
    const BASE = allShots ?? filteredNoClubRaw;
    const withCarry = BASE.filter(s => isNum(s.CarryDistance_yds));
    const byClub = groupBy(withCarry, s => s.Club || "Unknown");
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

  const gaps = (
    <div key="gaps" draggable onDragStart={onDragStart("gaps")} onDragOver={onDragOver("gaps")} onDrop={onDrop("gaps")}>
      <Card title="Gapping Warnings" theme={T}>
        {gapsRows.length ? (
          <div className="grid gap-2">
            {gapsRows.map((row, i) => (
              <div key={i} className="flex items-center justify-between text-sm" style={{ color: T.text }}>
                <span>{row.clubs}</span>
                <span style={{ color: T.textDim }}>{row.note}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No obvious small gaps across all data.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- PROGRESS (line chart over time for a single club) ---------- */
  const progressShots = useMemo(() => {
    if (selectedClubs.length !== 1) return [] as Shot[];
    const club = selectedClubs[0];
    return filteredOutliers
      .filter(s => (s.Club || "Unknown") === club)
      .filter(s => isNum(s.CarryDistance_yds) || isNum(s.TotalDistance_yds));
  }, [filteredOutliers, selectedClubs]);

  const progress = (
    <div key="progress" draggable onDragStart={onDragStart("progress")} onDragOver={onDragOver("progress")} onDrop={onDrop("progress")}>
      <Card title="Club Progress" theme={T}>
        {progressShots.length ? (
          <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progressShots} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid horizontal vertical={false} stroke={T.grid} />
                <XAxis dataKey="Timestamp" tick={{ fill: T.textDim }} axisLine={{ stroke: T.axis }} tickLine={{ stroke: T.axis }} />
                <YAxis tick={{ fill: T.textDim }} axisLine={{ stroke: T.axis }} tickLine={{ stroke: T.axis }} />
                <Tooltip formatter={(v:any)=> (typeof v === "number" ? `${v.toFixed(1)} yds` : v)} contentStyle={{ background: T.panel, borderColor: T.border, color: T.text }} />
                <Legend wrapperStyle={{ color: T.textDim }} />
                <Line type="monotone" dataKey="CarryDistance_yds" name="Carry" stroke={T.brand} dot={false} />
                <Line type="monotone" dataKey="TotalDistance_yds" name="Total" stroke={T.brand} dot={false} opacity={0.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>Select a single club to see progress over time.</div>
        )}
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
