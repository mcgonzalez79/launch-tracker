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

  // When present, use this to truly ignore filters (for Highlights/Gapping)
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

      const ac = avg(carries) ?? 0;
      const at = avg(totals)  ?? ac; // if no totals, treat total ~= carry
      const ar = Math.max(0, at - ac);

      out.push({
        club,
        avgCarry: ac,
        avgRoll: ar,
        avgTotal: at,
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
                <Legend content={<DistLegend />} />
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

  /* ---------- SWINGS (Averages for one OR many selected clubs) ---------- */
  const selectedClubs = useMemo(
    () => Array.from(new Set(filteredOutliers.map(s => s.Club || "Unknown"))),
    [filteredOutliers]
  );

  type SwingRow = { club: string; n: number; aoa?: number; path?: number; face?: number; f2p?: number };
  const swingsByClub: SwingRow[] = useMemo(() => {
    if (!selectedClubs.length) return [];
    const byClub = groupBy(filteredOutliers, s => s.Club || "Unknown");
    const out: SwingRow[] = [];
    for (const club of selectedClubs) {
      const rows = byClub.get(club) || [];
      const aoaVals  = rows.map(s => s.AttackAngle_deg).filter(isNum) as number[];
      const pathVals = rows.map(s => s.ClubPath_deg).filter(isNum) as number[];
      const faceVals = rows.map(s => s.ClubFace_deg).filter(isNum) as number[];
      const f2pVals  = rows.map(s => s.FaceToPath_deg).filter(isNum) as number[];
      out.push({
        club,
        n: rows.length,
        aoa:  avg(aoaVals)  ?? undefined,
        path: avg(pathVals) ?? undefined,
        face: avg(faceVals) ?? undefined,
        f2p:  avg(f2pVals)  ?? undefined,
      });
    }
    return out;
  }, [filteredOutliers, selectedClubs]);

  const fmt1 = (n?: number) => (n != null && Number.isFinite(n) ? n.toFixed(1) : "—");

  const swings = (
    <div
      key="swings"
      draggable
      onDragStart={onDragStart("swings")}
      onDragOver={onDragOver("swings")}
      onDrop={onDrop("swings")}
    >
      <Card title="Swing Metrics (Selected Clubs — Averages)" theme={T}>
        {swingsByClub.length ? (
          <div className="grid gap-4">
            {swingsByClub.map((row) => (
              <div key={row.club} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCell theme={T} label={`${row.club} • AoA`}  value={`${fmt1(row.aoa)}°`}  sub={`n=${row.n}`} />
                <KpiCell theme={T} label={`${row.club} • Path`} value={`${fmt1(row.path)}°`} sub={`n=${row.n}`} />
                <KpiCell theme={T} label={`${row.club} • Face`} value={`${fmt1(row.face)}°`} sub={`n=${row.n}`} />
                <KpiCell theme={T} label={`${row.club} • Face to Path`} value={`${fmt1(row.f2p)}°`} sub={`n=${row.n}`} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>
            Select one or more clubs to see average swing angles.
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

  /* ---------- GAPS (gapping warnings — IGNORE FILTERS, use ALL data) ---------- */
  const gapsRows = useMemo(() => {
    const ALLDATA = (allShots ?? filteredNoClubRaw).filter(s => isNum(s.CarryDistance_yds));
    const byClub = groupBy(ALLDATA, s => s.Club || "Unknown");
    // Average carry per club
    const avgs: { club: string; carry: number; n: number }[] = [];
    for (const [club, rows] of byClub.entries()) {
      const carries = rows.map(s => s.CarryDistance_yds as number);
      const a = avg(carries);
      if (a != null) avgs.push({ club, carry: a, n: carries.length });
    }
    // Sort by carry ascending to find near-overlaps
    avgs.sort((a,b)=> a.carry - b.carry);

    const THRESH = 8; // yards
    const out: { clubs: string; note: string }[] = [];
    for (let i=1;i<avgs.length;i++) {
      const d = Math.abs(avgs[i].carry - avgs[i-1].carry);
      if (d < THRESH) {
        out.push({
          clubs: `${avgs[i-1].club} ↔ ${avgs[i].club}`,
          note: `Avg carry gap small (${d.toFixed(1)} yds)`
        });
      }
    }
    return out;
  }, [allShots, filteredNoClubRaw]);

  const gaps = (
    <div key="gaps" draggable onDragStart={onDragStart("gaps")} onDragOver={onDragOver("gaps")} onDrop={onDrop("gaps")}>
      <Card title="Gapping Warnings (All Data)" theme={T}>
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

  // Trendline: simple least-squares on index vs carry; write yhat to 'trend'
  const progressWithTrend = useMemo(() => {
    const rows = [...progressRows];
    if (rows.length < 2) return rows;
    const n = rows.length;
    const xs = rows.map((_, i) => i);
    const ys = rows.map(r => r.carry);

    const mean = (arr: number[]) => arr.reduce((a,b)=>a+b,0)/arr.length;
    const xbar = mean(xs);
    const ybar = mean(ys);
    let num = 0, den = 0;
    for (let i=0;i<n;i++) {
      num += (xs[i]-xbar)*(ys[i]-ybar);
      den += (xs[i]-xbar)*(xs[i]-xbar);
    }
    const slope = den === 0 ? 0 : num/den;
    const intercept = ybar - slope * xbar;

    return rows.map((r, i) => ({ ...r, trend: intercept + slope * i }));
  }, [progressRows]);

  const progress = (
    <div key="progress" draggable onDragStart={onDragStart("progress")} onDragOver={onDragOver("progress")} onDrop={onDrop("progress")}>
      <Card title="Club Progress (Carry) + Trend" theme={T}>
        {progressWithTrend.length ? (
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={progressWithTrend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis dataKey="t" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="carry" name="Carry (yds)" dot={false} />
                <Line type="monotone" dataKey="trend" name="Trend (linear)" dot={false} strokeDasharray="5 5" />
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
