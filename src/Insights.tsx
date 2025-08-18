// src/Insights.tsx
import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import { Card } from "./components/UI";
import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine,
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

  /* ---------- DIST (Distance Distribution — box-ish) ---------- */
  const distRows = useMemo(() => {
    const byClub = groupBy(filteredOutliers.filter(s => isNum(s.CarryDistance_yds)), s => s.Club || "Unknown");
    const order = new Map(allClubs.map((c,i)=>[c,i]));
    const out: { club: string; min: number; q1: number; q3: number; max: number }[] = [];
    for (const [club, shots] of byClub.entries()) {
      const carries = shots.map(s => s.CarryDistance_yds as number).sort((a,b)=>a-b);
      if (!carries.length) continue;
      const min = carries[0], max = carries[carries.length-1];
      const q1 = quantile(carries, 0.25)!;
      const q3 = quantile(carries, 0.75)!;
      out.push({ club, min, q1, q3, max });
    }
    out.sort((a,b)=> (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return out;
  }, [filteredOutliers, allClubs]);

  const dist = (
    <div key="dist" draggable onDragStart={onDragStart("dist")} onDragOver={onDragOver("dist")} onDrop={onDrop("dist")}>
      <Card title="Distance Distribution (Carry)" theme={T}>
        {distRows.length ? (
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={distRows} layout="vertical" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="club" width={80} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {/* Draw box as stacked bars from q1->q3 */}
                <Bar dataKey="q3" stackId="q" name="Q3" />
                <Bar dataKey="q1" stackId="q" name="Q1" />
                {/* Whiskers */}
                {distRows.map((r,i)=>(<ReferenceLine key={"min"+i} x={r.min} stroke={T.textDim} strokeDasharray="3 3" />))}
                {distRows.map((r,i)=>(<ReferenceLine key={"max"+i} x={r.max} stroke={T.textDim} strokeDasharray="3 3" />))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No carry data available.</div>}
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

  /* ---------- SWINGS (per-club averages as KPI tiles; FILTERED clubs only) ---------- */
  const swingRows = useMemo(() => {
    const byClub = groupBy(filteredOutliers, s => s.Club || "Unknown");
    const order = new Map(allClubs.map((c,i)=>[c,i]));
    const out: { club: string; aoa?: number; path?: number; face?: number; f2p?: number }[] = [];
    for (const [club, shots] of byClub.entries()) {
      const aoaVals  = shots.map(s => s.AttackAngle_deg).filter(isNum) as number[];
      const pathVals = shots.map(s => s.ClubPath_deg).filter(isNum) as number[];
      const faceVals = shots.map(s => s.ClubFace_deg).filter(isNum) as number[];
      const f2pVals  = shots.map(s => s.FaceToPath_deg).filter(isNum) as number[];
      out.push({
        club,
        aoa:  avg(aoaVals)  ?? undefined,
        path: avg(pathVals) ?? undefined,
        face: avg(faceVals) ?? undefined,
        f2p:  avg(f2pVals)  ?? undefined,
      });
    }
    out.sort((a,b)=> (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return out;
  }, [filteredOutliers, allClubs]);

  // simple formatter for KPI text
  const fmt = (n?: number) => (n != null && Number.isFinite(n) ? n.toFixed(1) : "—");

  const swings = (
    <div
      key="swings"
      draggable
      onDragStart={onDragStart("swings")}
      onDragOver={onDragOver("swings")}
      onDrop={onDrop("swings")}
    >
      <Card title="Swing Metrics (Avg per Club)" theme={T}>
        {swingRows.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {swingRows.map((r) => (
              <KpiCell
                key={r.club}
                theme={T}
                label={r.club}
                value={`${fmt(r.f2p)}° F2P`}
                sub={`AoA ${fmt(r.aoa)}° • Path ${fmt(r.path)}° • Face ${fmt(r.face)}°`}
              />
            ))}
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>
            No swing metric data yet.
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
