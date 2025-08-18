import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import {
  ResponsiveContainer,
  LineChart, Line,
  ScatterChart, Scatter,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, Label
} from "recharts";

/* =========================
   Props
========================= */
type Props = {
  theme: Theme;

  // from App.tsx
  tableRows: ClubRow[];                 // (may be empty — we compute inside as needed)
  filteredOutliers: Shot[];             // outliers removed
  filteredNoClubOutliers: Shot[];       // alias of filteredOutliers in your App
  filteredNoClubRaw: Shot[];            // raw (no outlier removal)
  allClubs: string[];                   // full club list (ordered)
  insightsOrder: string[];

  onDragStart: (key: string) => (e: React.DragEvent) => void;
  onDragOver: (key: string) => (e: React.DragEvent) => void;
  onDrop: (_key: string) => (_: React.DragEvent) => void;
};

/* =========================
   Helpers
========================= */
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function domainPad([min, max]: [number, number], pct = 0.05) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [min, max] as [number, number];
  const span = max - min;
  const pad = Math.max(1, span * pct);
  return [Math.floor(min - pad), Math.ceil(max + pad)] as [number, number];
}

function safeMin(nums: number[]) {
  return nums.length ? Math.min(...nums) : 0;
}

function safeMax(nums: number[]) {
  return nums.length ? Math.max(...nums) : 0;
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function groupBy<T>(rows: T[], keyFn: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

function avg(nums: number[]) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function maxBy<T>(rows: T[], val: (x: T) => number | null) {
  let best: T | null = null;
  let bestV = -Infinity;
  for (const r of rows) {
    const v = val(r);
    if (v != null && v > bestV) {
      bestV = v;
      best = r;
    }
  }
  return best;
}

// Lightweight KPI tile used in Highlights
function KpiCell({
  label,
  value,
  sub,
  theme: T,
}: {
  label: string;
  value: string;
  sub?: string;
  theme: Theme;
}) {
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
}: Props) {

  /* ---------- Distance Distribution (Box & Whisker) ---------- */
  const distData = useMemo(() => {
    const groups = groupBy(filteredOutliers.filter(s => isNum(s.CarryDistance_yds)), s => s.Club || "Unknown");
    const out: { club: string; q1: number; q3: number; min: number; max: number }[] = [];
    for (const [club, shots] of groups.entries()) {
      const vals = shots.map(s => s.CarryDistance_yds as number).sort((a,b)=>a-b);
      const q1 = quantile(vals, 0.25);
      const q3 = quantile(vals, 0.75);
      const min = vals.length ? vals[0] : 0;
      const max = vals.length ? vals[vals.length - 1] : 0;
      if (q1 != null && q3 != null) out.push({ club, q1, q3, min, max });
    }
    // Sort by your master club order
    const order = new Map(allClubs.map((c, i) => [c, i]));
    out.sort((a, b) => (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return out;
  }, [filteredOutliers, allClubs]);

  const distDomain = useMemo(() => {
    const vals = filteredOutliers.map(s => s.CarryDistance_yds).filter(isNum) as number[];
    if (!vals.length) return [0, 100] as [number, number];
    return domainPad([safeMin(vals), safeMax(vals)] as [number, number]);
  }, [filteredOutliers]);

  const distanceDistribution = (
    <div key="distanceDistribution" draggable onDragStart={onDragStart("distanceDistribution")} onDragOver={onDragOver("distanceDistribution")} onDrop={onDrop("distanceDistribution")}>
      <Card title="Distance Distribution" theme={T}>
        {distData.length ? (
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={distData} layout="vertical" margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={distDomain as any} tick={{ fontSize: 12 }}>
                  <Label value="Distance (yds)" position="insideBottom" dy={10} />
                </XAxis>
                <YAxis dataKey="club" type="category" width={80} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend verticalAlign="top" height={24} />
                {/* Render Q1-Q3 as a bar (box), min/max as whiskers via ReferenceLine pairs */}
                <Bar dataKey="q3" stackId="q" name="Q3" />
                <Bar dataKey="q1" stackId="q" name="Q1" />
                {distData.map((row, i) => (
                  <ReferenceLine key={`min-${i}`} x={row.min} strokeDasharray="3 3" />
                ))}
                {distData.map((row, i) => (
                  <ReferenceLine key={`max-${i}`} x={row.max} strokeDasharray="3 3" />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No carry data available.</div>}
      </Card>
    </div>
  );

  /* ---------- Highlights (PR Carry, PR Total, Most Consistent) ---------- */
  const prCarryShot = useMemo(() => {
    return maxBy(filteredNoClubRaw, s => isNum(s.CarryDistance_yds) ? s.CarryDistance_yds! : null);
  }, [filteredNoClubRaw]);

  const prTotalShot = useMemo(() => {
    return maxBy(filteredNoClubRaw, s => isNum(s.TotalDistance_yds) ? s.TotalDistance_yds! : null);
  }, [filteredNoClubRaw]);

  const mostConsistent = useMemo(() => {
    const MIN = 5;
    const groups = groupBy(filteredNoClubRaw.filter(s => isNum(s.CarryDistance_yds)), s => s.Club || "Unknown");
    let bestClub: string | null = null;
    let bestSd = Infinity;
    for (const [club, shots] of groups.entries()) {
      if (shots.length < MIN) continue;
      const carries = shots.map(s => s.CarryDistance_yds as number);
      const m = carries.reduce((a,b)=>a+b, 0) / carries.length;
      const variance = carries.reduce((a,b)=>a + (b - m) ** 2, 0) / carries.length;
      const sd = Math.sqrt(variance);
      if (sd < bestSd) { bestSd = sd; bestClub = club; }
    }
    return bestClub ? { club: bestClub, sd: bestSd } : null;
  }, [filteredNoClubRaw]);

  const highlights = (
    <div key="highlights" draggable onDragStart={onDragStart("highlights")} onDragOver={onDragOver("highlights")} onDrop={onDrop("highlights")}>
      <Card title="Highlights" theme={T}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCell
            theme={T}
            label="PR • Carry"
            value={prCarryShot && isNum(prCarryShot.CarryDistance_yds) ? `${Math.round(prCarryShot.CarryDistance_yds)} yds` : "—"}
            sub={prCarryShot ? `${prCarryShot.Club || "Unknown"}${prCarryShot.Timestamp ? ` • ${new Date(prCarryShot.Timestamp).toLocaleDateString()}` : ""}` : "No data"}
          />
          <KpiCell
            theme={T}
            label="PR • Total Distance"
            value={prTotalShot && isNum(prTotalShot.TotalDistance_yds) ? `${Math.round(prTotalShot.TotalDistance_yds)} yds` : "—"}
            sub={prTotalShot ? `${prTotalShot.Club || "Unknown"}${prTotalShot.Timestamp ? ` • ${new Date(prTotalShot.Timestamp).toLocaleDateString()}` : ""}` : "No data"}
          />
          <KpiCell
            theme={T}
            label="Most Consistent Club"
            value={mostConsistent ? mostConsistent.club : "—"}
            sub={mostConsistent ? `Lowest carry SD ≈ ${mostConsistent.sd.toFixed(1)} yds` : "Need ≥5 shots"}
          />
        </div>
      </Card>
    </div>
  );

  /* ---------- Swing Metrics (per-club averages: AoA, Path, Face, F2P) ---------- */
  const swingRows = useMemo(() => {
    const groups = groupBy(filteredOutliers, s => s.Club || "Unknown");
    const out: { club: string; aoa?: number; path?: number; face?: number; f2p?: number }[] = [];
    for (const [club, shots] of groups.entries()) {
      const aoaVals = shots.map(s => s.AttackAngle_deg).filter(isNum) as number[];
      const pathVals = shots.map(s => s.ClubPath_deg).filter(isNum) as number[];
      const faceVals = shots.map(s => s.ClubFace_deg).filter(isNum) as number[];
      const f2pVals = shots.map(s => s.FaceToPath_deg).filter(isNum) as number[];
      out.push({
        club,
        aoa: avg(aoaVals) ?? undefined,
        path: avg(pathVals) ?? undefined,
        face: avg(faceVals) ?? undefined,
        f2p: avg(f2pVals) ?? undefined,
      });
    }
    const order = new Map(allClubs.map((c, i) => [c, i]));
    out.sort((a, b) => (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return out;
  }, [filteredOutliers, allClubs]);

  const swingMetrics = (
    <div key="swingMetrics" draggable onDragStart={onDragStart("swingMetrics")} onDragOver={onDragOver("swingMetrics")} onDrop={onDrop("swingMetrics")}>
      <Card title="Swing Metrics" theme={T}>
        {swingRows.length ? (
          <div className="overflow-auto rounded-lg border" style={{ borderColor: T.border }}>
            <table className="w-full text-sm" style={{ color: T.text }}>
              <thead style={{ background: T.panelAlt }}>
                <tr>
                  <th className="text-left px-2 py-1">Club</th>
                  <th className="text-right px-2 py-1">AoA (°)</th>
                  <th className="text-right px-2 py-1">Path (°)</th>
                  <th className="text-right px-2 py-1">Face (°)</th>
                  <th className="text-right px-2 py-1">F2P (°)</th>
                </tr>
              </thead>
              <tbody>
                {swingRows.map((r) => (
                  <tr key={r.club} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td className="px-2 py-1">{r.club}</td>
                    <td className="px-2 py-1 text-right">{r.aoa != null ? r.aoa.toFixed(1) : ""}</td>
                    <td className="px-2 py-1 text-right">{r.path != null ? r.path.toFixed(1) : ""}</td>
                    <td className="px-2 py-1 text-right">{r.face != null ? r.face.toFixed(1) : ""}</td>
                    <td className="px-2 py-1 text-right">{r.f2p != null ? r.f2p.toFixed(1) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No swing metric data yet.</div>}
      </Card>
    </div>
  );

  /* ---------- Warnings (simple gapping warnings) ---------- */
  const warningsData = useMemo(() => {
    // very simple: flag if sequential clubs have very close average carry
    const groups = groupBy(filteredOutliers.filter(s => isNum(s.CarryDistance_yds)), s => s.Club || "Unknown");
    const avgByClub: { club: string; carry?: number }[] = [];
    for (const [club, shots] of groups.entries()) {
      const carries = shots.map(s => s.CarryDistance_yds as number);
      const m = avg(carries) ?? undefined;
      avgByClub.push({ club, carry: m });
    }
    const order = new Map(allClubs.map((c, i) => [c, i]));
    avgByClub.sort((a, b) => (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));

    const flags: { clubs: string; note: string }[] = [];
    for (let i = 1; i < avgByClub.length; i++) {
      const prev = avgByClub[i - 1];
      const cur = avgByClub[i];
      if (prev.carry != null && cur.carry != null && Math.abs(cur.carry - prev.carry) < 8) {
        flags.push({ clubs: `${prev.club} ↔ ${cur.club}`, note: `Avg carry gap is small (${Math.abs(cur.carry - prev.carry).toFixed(1)} yds)` });
      }
    }
    return flags;
  }, [filteredOutliers, allClubs]);

  const warnings = (
    <div key="warnings" draggable onDragStart={onDragStart("warnings")} onDragOver={onDragOver("warnings")} onDrop={onDrop("warnings")}>
      <Card title="Gapping Warnings" theme={T}>
        {warningsData.length ? (
          <ul className="text-sm list-disc pl-6" style={{ color: T.text }}>
            {warningsData.map((w, i) => (
              <li key={i}>{w.clubs}: {w.note}</li>
            ))}
          </ul>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No warnings.</div>}
      </Card>
    </div>
  );

  /* ---------- Personal Records (Carry/Total per club) ---------- */
  const prRows = useMemo(() => {
    const groups = groupBy(filteredOutliers, s => s.Club || "Unknown");
    const out: { club: string; carry?: number; total?: number }[] = [];
    for (const [club, shots] of groups.entries()) {
      const bestCarry = maxBy(shots, s => isNum(s.CarryDistance_yds) ? s.CarryDistance_yds! : null);
      const bestTotal = maxBy(shots, s => isNum(s.TotalDistance_yds) ? s.TotalDistance_yds! : null);
      out.push({
        club,
        carry: bestCarry && isNum(bestCarry.CarryDistance_yds) ? bestCarry.CarryDistance_yds : undefined,
        total: bestTotal && isNum(bestTotal.TotalDistance_yds) ? bestTotal.TotalDistance_yds : undefined,
      });
    }
    const order = new Map(allClubs.map((c, i) => [c, i]));
    out.sort((a, b) => (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return out;
  }, [filteredOutliers, allClubs]);

  const personalRecords = (
    <div key="personalRecords" draggable onDragStart={onDragStart("personalRecords")} onDragOver={onDragOver("personalRecords")} onDrop={onDrop("personalRecords")}>
      <Card title="Personal Records (by Club)" theme={T}>
        {prRows.length ? (
          <div className="overflow-auto rounded-lg border" style={{ borderColor: T.border }}>
            <table className="w-full text-sm" style={{ color: T.text }}>
              <thead style={{ background: T.panelAlt }}>
                <tr>
                  <th className="text-left px-2 py-1">Club</th>
                  <th className="text-right px-2 py-1">Best Carry (yds)</th>
                  <th className="text-right px-2 py-1">Best Total (yds)</th>
                </tr>
              </thead>
              <tbody>
                {prRows.map((r) => (
                  <tr key={r.club} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td className="px-2 py-1">{r.club}</td>
                    <td className="px-2 py-1 text-right">{r.carry != null ? r.carry.toFixed(1) : ""}</td>
                    <td className="px-2 py-1 text-right">{r.total != null ? r.total.toFixed(1) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No PRs yet.</div>}
      </Card>
    </div>
  );

  /* ---------- Progress (line chart showing carry over time; only when one club selected upstream) ---------- */
  const progressData = useMemo(() => {
    // Assume upstream only passes a single club's shots when exactly one club is selected.
    // If multiple clubs are selected, App can pass an empty array or mixed shots — we skip drawing.
    const clubs = new Set(filteredOutliers.map(s => s.Club));
    if (clubs.size !== 1) return [] as { t: string; carry?: number }[];
    const ordered = [...filteredOutliers]
      .filter(s => isNum(s.CarryDistance_yds) && s.Timestamp)
      .sort((a, b) => new Date(a.Timestamp!).getTime() - new Date(b.Timestamp!).getTime());
    return ordered.map(s => ({ t: s.Timestamp!, carry: s.CarryDistance_yds as number }));
  }, [filteredOutliers]);

  const progress = (
    <div key="progress" draggable onDragStart={onDragStart("progress")} onDragOver={onDragOver("progress")} onDrop={onDrop("progress")}>
      <Card title="Club Progress (Carry)" theme={T}>
        {progressData.length ? (
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={progressData} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
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

  /* ---------- Weaknesses (very simple heuristic) ---------- */
  const weaknessList = useMemo(() => {
    const missLeft = filteredOutliers.filter(s => isNum(s.FaceToPath_deg) && (s.FaceToPath_deg as number) < -2).length;
    const missRight = filteredOutliers.filter(s => isNum(s.FaceToPath_deg) && (s.FaceToPath_deg as number) > 2).length;
    const short = filteredOutliers.filter(s => isNum(s.SmashFactor) && (s.SmashFactor as number) < 1.4).length;
    const list: string[] = [];
    if (missLeft > missRight && missLeft > 5) list.push("Tendency: Face closed to path (left)");
    if (missRight > missLeft && missRight > 5) list.push("Tendency: Face open to path (right)");
    if (short > 5) list.push("Lower smash — efficiency opportunities");
    return list;
  }, [filteredOutliers]);

  const weaknesses = (
    <div key="weaknesses" draggable onDragStart={onDragStart("weaknesses")} onDragOver={onDragOver("weaknesses")} onDrop={onDrop("weaknesses")}>
      <Card title="Weaknesses" theme={T}>
        {weaknessList.length ? (
          <ul className="text-sm list-disc pl-6" style={{ color: T.text }}>
            {weaknessList.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No obvious weaknesses detected.</div>}
      </Card>
    </div>
  );

  const cardMap: Record<string, React.ReactNode> = {
    distanceDistribution,
    highlights,
    swingMetrics,
    warnings,
    personalRecords,
    progress,
    weaknesses,
  };

  return (
    <div className="grid gap-4">
      {insightsOrder.map((key) => cardMap[key] ?? null)}
    </div>
  );
}
