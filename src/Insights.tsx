// src/Insights.tsx
import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import { Card } from "./components/UI";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
  Scatter
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
function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base];
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
  tableRows,
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

  /* ---------- DIST (Horizontal boxplots for Carry & Total) ---------- */
  type DistRow = {
    club: string;

    // Carry
    c_min: number;
    c_q1: number;
    c_q3: number;
    c_med?: number;
    c_max: number;
    c_iqr: number; // q3 - q1

    // Total (optional)
    t_min?: number;
    t_q1?: number;
    t_q3?: number;
    t_med?: number;
    t_max?: number;
    t_iqr?: number; // q3 - q1
  };

  const distRows: DistRow[] = useMemo(() => {
    const byClub = groupBy(
      filteredOutliers.filter(s => isNum(s.CarryDistance_yds) || isNum(s.TotalDistance_yds)),
      s => s.Club || "Unknown"
    );
    const order = new Map(allClubs.map((c,i)=>[c,i]));
    const out: DistRow[] = [];
    for (const [club, shots] of byClub.entries()) {
      const carry = shots.map(s => s.CarryDistance_yds).filter(isNum).sort((a,b)=>a-b) as number[];
      if (!carry.length) continue;

      const total = shots.map(s => s.TotalDistance_yds).filter(isNum).sort((a,b)=>a-b) as number[];

      // Carry stats
      const c_min = carry[0];
      const c_q1  = quantile(carry, 0.25)!;
      const c_q3  = quantile(carry, 0.75)!;
      const c_med = quantile(carry, 0.5) ?? undefined;
      const c_max = carry[carry.length - 1];
      const c_iqr = Math.max(0, c_q3 - c_q1);

      // Total stats (if present)
      let t_min: number | undefined, t_q1: number | undefined, t_q3: number | undefined, t_med: number | undefined, t_max: number | undefined, t_iqr: number | undefined;
      if (total.length) {
        t_min = total[0];
        t_q1  = quantile(total, 0.25)!;
        t_q3  = quantile(total, 0.75)!;
        t_med = quantile(total, 0.5) ?? undefined;
        t_max = total[total.length - 1];
        t_iqr = Math.max(0, (t_q3 ?? 0) - (t_q1 ?? 0));
      }

      out.push({ club, c_min, c_q1, c_q3, c_med, c_max, c_iqr, t_min, t_q1, t_q3, t_med, t_max, t_iqr });
    }
    out.sort((a,b)=> (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return out;
  }, [filteredOutliers, allClubs]);

  // Domain: true max across carry/total, padded to next 10
  const xMax = useMemo(() => {
    if (!distRows.length) return 100;
    let m = 0;
    for (const r of distRows) {
      m = Math.max(m, r.c_max, r.t_max ?? 0);
    }
    const padded = Math.ceil((m + 5) / 10) * 10;
    return padded;
  }, [distRows]);

  // Lookup for tooltip
  const rowsByClub = useMemo(() => {
    const m = new Map<string, DistRow>();
    for (const r of distRows) m.set(r.club, r);
    return m;
  }, [distRows]);

  // Custom tooltip: show both Carry & Total stats
  const DistTooltip = ({ active, label }: any) => {
    if (!active || !label) return null;
    const row = rowsByClub.get(label as string);
    if (!row) return null;
    const fmt = (n?: number | null) => (n == null || !Number.isFinite(n) ? "—" : n.toFixed(1));
    return (
      <div className="rounded-md p-2 border text-xs" style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}>
        <div className="font-semibold mb-1">{row.club}</div>
        <div className="font-medium">Carry</div>
        <div className="ml-3">Min {fmt(row.c_min)} • Q1 {fmt(row.c_q1)} • Med {fmt(row.c_med)} • Q3 {fmt(row.c_q3)} • Max {fmt(row.c_max)}</div>
        <div className="font-medium mt-1">Total</div>
        <div className="ml-3">Min {fmt(row.t_min)} • Q1 {fmt(row.t_q1)} • Med {fmt(row.t_med)} • Q3 {fmt(row.t_q3)} • Max {fmt(row.t_max)}</div>
      </div>
    );
  };

  // Whisker ticks (vertical) for min/max with slight up/down offsets so Carry/Total are distinguishable
  const Whisker = (dy: number, color: string) => (props: any) => {
    const { cx, cy } = props;
    const y1 = cy - 8 + dy, y2 = cy + 8 + dy;
    return <line x1={cx} x2={cx} y1={y1} y2={y2} stroke={color} strokeWidth={1} />;
  };

  const dist = (
    <div key="dist" draggable onDragStart={onDragStart("dist")} onDragOver={onDragOver("dist")} onDrop={onDrop("dist")}>
      <Card title="Distance Distribution — Boxplots (Carry & Total)" theme={T}>
        {distRows.length ? (
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart
                data={distRows}
                layout="vertical"
                margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                barCategoryGap="30%"
                barGap={6}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis type="number" domain={[0, xMax]} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="club" width={90} tick={{ fontSize: 12 }} />
                <Tooltip content={<DistTooltip />} />
                <Legend />

                {/* CARRY: transparent offset to Q1, then IQR Q1→Q3 in brand color; median tick */}
                <Bar dataKey="c_q1" stackId="carry" fill="transparent" isAnimationActive={false} legendType="none" />
                <Bar dataKey={(r: DistRow) => r.c_iqr} stackId="carry" name="Carry IQR (Q1–Q3)" fill={T.brand} />
                <Scatter
                  name="Carry min/max"
                  data={distRows.flatMap(r => [{ x: r.c_min, y: r.club }, { x: r.c_max, y: r.club }])}
                  shape={Whisker(-5, T.brand)}
                />
                <Scatter
                  name="Carry median"
                  data={distRows.map(r => ({ x: r.c_med, y: r.club }))}
                  shape={(props: any) => <line x1={props.cx} x2={props.cx} y1={props.cy - 6} y2={props.cy + 6} stroke={T.brand} strokeWidth={2} />}
                />

                {/* TOTAL: transparent offset to Q1, then IQR Q1→Q3 in brand color (lighter); median tick */}
                <Bar dataKey="t_q1" stackId="total" fill="transparent" isAnimationActive={false} legendType="none" />
                <Bar dataKey={(r: DistRow) => r.t_iqr ?? 0} stackId="total" name="Total IQR (Q1–Q3)" fill={T.brand} fillOpacity={0.45} />
                <Scatter
                  name="Total min/max"
                  data={distRows.flatMap(r =>
                    r.t_min != null && r.t_max != null ? [{ x: r.t_min, y: r.club }, { x: r.t_max, y: r.club }] : []
                  )}
                  shape={Whisker(5, T.brand)}
                />
                <Scatter
                  name="Total median"
                  data={distRows.flatMap(r => (r.t_med != null ? [{ x: r.t_med, y: r.club }] : []))}
                  shape={(props: any) => <line x1={props.cx} x2={props.cx} y1={props.cy - 6} y2={props.cy + 6} stroke={T.brand} strokeWidth={2} opacity={0.6} />}
                />
              </ComposedChart>
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
