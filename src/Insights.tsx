import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import { Card } from "./components/UI";
import {
  ResponsiveContainer,
  LineChart, Line,
  ScatterChart, Scatter,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine
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

function domainOf(vals: number[], pad = 0): [number, number] {
  if (!vals.length) return [0, 0];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
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

/* =========================
   Component
========================= */
export default function InsightsView(props: Props) {
  const {
    theme: T,
    filteredOutliers,
    filteredNoClubOutliers,
    filteredNoClubRaw,
    allClubs,
    insightsOrder,
    onDragStart, onDragOver, onDrop,
  } = props;

  /* ---------- Distance Box (histogram of carry) ---------- */
  const distanceBins = useMemo(() => {
    const vals = filteredOutliers.map(s => s.CarryDistance_yds).filter(isNum);
    if (!vals.length) return [];
    // bin width = 5 yds
    const w = 5;
    const map = new Map<number, number>();
    for (const v of vals) {
      const b = Math.round(v / w) * w;
      map.set(b, (map.get(b) ?? 0) + 1);
    }
    const rows = Array.from(map.entries()).map(([bin, count]) => ({ bin, count }));
    rows.sort((a, b) => a.bin - b.bin);
    return rows;
  }, [filteredOutliers]);

  const distDomain = useMemo(() => domainOf(distanceBins.map(d => d.bin), 5), [distanceBins]);

  const distanceBox = (
    <div key="distanceBox" draggable onDragStart={onDragStart("distanceBox")} onDragOver={onDragOver("distanceBox")} onDrop={onDrop("distanceBox")}>
      <Card title="Distance Distribution (Carry)" theme={T}>
        {distanceBins.length ? (
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={distanceBins} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid stroke={T.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="bin"
                  type="number"
                  domain={distDomain as any}
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  label={{ value: "Carry (yds)", position: "insideBottom", offset: -2, fill: T.textDim, fontSize: 12 }}
                />
                <YAxis tick={{ fill: T.tick, fontSize: 12 }} stroke={T.tick} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
                  formatter={(v: any, _n: string, p: any) => [`${v}`, `${p?.payload?.bin} yds`]}
                />
                <Bar dataKey="count" fill={T.brand} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No carry data available.</div>}
      </Card>
    </div>
  );

  /* ---------- Highlights (best ball speed & carry per club) ---------- */
  const highlightsData = useMemo(() => {
    const groups = groupBy(filteredOutliers, s => s.Club || "Unknown");
    const out: { club: string; bestCarry?: number; bestBall?: number }[] = [];
    for (const [club, shots] of groups.entries()) {
      const bestCarry = maxBy(shots, s => isNum(s.CarryDistance_yds) ? s.CarryDistance_yds! : null);
      const bestBall = maxBy(shots, s => isNum(s.BallSpeed_mph) ? s.BallSpeed_mph! : null);
      out.push({
        club,
        bestCarry: bestCarry && isNum(bestCarry.CarryDistance_yds) ? bestCarry.CarryDistance_yds! : undefined,
        bestBall: bestBall && isNum(bestBall.BallSpeed_mph) ? bestBall.BallSpeed_mph! : undefined,
      });
    }
    // order by your allClubs order
    const order = new Map(allClubs.map((c, i) => [c, i]));
    out.sort((a, b) => (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return out;
  }, [filteredOutliers, allClubs]);

  const highlights = (
    <div key="highlights" draggable onDragStart={onDragStart("highlights")} onDragOver={onDragOver("highlights")} onDrop={onDrop("highlights")}>
      <Card title="Highlights (Best per Club)" theme={T}>
        {highlightsData.length ? (
          <div className="overflow-auto rounded-lg border" style={{ borderColor: T.border }}>
            <table className="w-full text-sm" style={{ color: T.text }}>
              <thead style={{ background: T.panelAlt }}>
                <tr>
                  <th className="text-left px-2 py-1">Club</th>
                  <th className="text-right px-2 py-1">Best Carry (yds)</th>
                  <th className="text-right px-2 py-1">Best Ball (mph)</th>
                </tr>
              </thead>
              <tbody>
                {highlightsData.map((r) => (
                  <tr key={r.club} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td className="px-2 py-1">{r.club}</td>
                    <td className="px-2 py-1 text-right">{r.bestCarry != null ? r.bestCarry.toFixed(1) : ""}</td>
                    <td className="px-2 py-1 text-right">{r.bestBall != null ? r.bestBall.toFixed(1) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No club highlights yet.</div>}
      </Card>
    </div>
  );

  /* ---------- Swing Metrics (per-club averages: AoA, Path, Face, F2P) ---------- */
  const swingRows = useMemo(() => {
    const groups = groupBy(filteredOutliers, s => s.Club || "Unknown");
    const out: { club: string; aoa?: number; path?: number; face?: number; f2p?: number }[] = [];
    for (const [club, rows] of groups.entries()) {
      const aoa = avg(rows.map(s => s.AttackAngle_deg).filter(isNum));
      const path = avg(rows.map(s => s.ClubPath_deg).filter(isNum));
      const face = avg(rows.map(s => s.ClubFace_deg).filter(isNum));
      const f2p = avg(rows.map(s => s.FaceToPath_deg).filter(isNum));
      out.push({ club, aoa: aoa ?? undefined, path: path ?? undefined, face: face ?? undefined, f2p: f2p ?? undefined });
    }
    const order = new Map(allClubs.map((c, i) => [c, i]));
    out.sort((a, b) => (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return out;
  }, [filteredOutliers, allClubs]);

  const swingMetrics = (
    <div key="swingMetrics" draggable onDragStart={onDragStart("swingMetrics")} onDragOver={onDragOver("swingMetrics")} onDrop={onDrop("swingMetrics")}>
      <Card title="Swing Metrics (Avg per Club)" theme={T}>
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
                    <td className="px-2 py-1 text-right">{r.aoa != null ? r.aoa.toFixed(2) : ""}</td>
                    <td className="px-2 py-1 text-right">{r.path != null ? r.path.toFixed(2) : ""}</td>
                    <td className="px-2 py-1 text-right">{r.face != null ? r.face.toFixed(2) : ""}</td>
                    <td className="px-2 py-1 text-right">{r.f2p != null ? r.f2p.toFixed(2) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No swing metrics calculated.</div>}
      </Card>
    </div>
  );

  /* ---------- Warnings (basic heuristics) ---------- */
  const warningsList = useMemo(() => {
    const items: string[] = [];
    // Low smash overall
    const smashVals = filteredOutliers.map(s => s.SmashFactor).filter(isNum);
    const smashAvg = avg(smashVals);
    if (smashAvg != null && smashAvg < 1.40) {
      items.push(`Average smash factor is low (${smashAvg.toFixed(3)}). Consider contact quality drills.`);
    }
    // Excess lateral dispersion (IQR over 20 yds)
    const lateral = filteredOutliers.map(s => s.CarryDeviationDistance_yds).filter(isNum).sort((a, b) => a - b);
    if (lateral.length >= 8) {
      const q1 = lateral[Math.floor(lateral.length * 0.25)];
      const q3 = lateral[Math.floor(lateral.length * 0.75)];
      if (q3 - q1 > 20) items.push(`High lateral dispersion (IQR ${(q3 - q1).toFixed(1)} yds). Work on start-line control.`);
    }
    // AoA driver hint (if driver exists): if avg AoA < -1 with driver
    const driverRows = filteredOutliers.filter(s => (s.Club || "").toLowerCase().includes("driver"));
    if (driverRows.length) {
      const aoa = avg(driverRows.map(s => s.AttackAngle_deg).filter(isNum));
      if (aoa != null && aoa < -1) items.push(`Driver AoA averages ${aoa.toFixed(2)}° down. Try tee height/ball position for upward hit.`);
    }
    return items;
  }, [filteredOutliers]);

  const warnings = (
    <div key="warnings" draggable onDragStart={onDragStart("warnings")} onDragOver={onDragOver("warnings")} onDrop={onDrop("warnings")}>
      <Card title="Warnings" theme={T}>
        {warningsList.length ? (
          <ul className="list-disc pl-5 text-sm" style={{ color: T.text }}>
            {warningsList.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No warnings triggered.</div>}
      </Card>
    </div>
  );

  /* ---------- Personal Records (per-club PRs) ---------- */
  const prs = useMemo(() => {
    const groups = groupBy(filteredNoClubRaw, s => s.Club || "Unknown");
    const out: { club: string; carry?: number; ball?: number; clubspd?: number }[] = [];
    for (const [club, rows] of groups.entries()) {
      const bestCarry = maxBy(rows, s => isNum(s.CarryDistance_yds) ? s.CarryDistance_yds! : null);
      const bestBall = maxBy(rows, s => isNum(s.BallSpeed_mph) ? s.BallSpeed_mph! : null);
      const bestClub = maxBy(rows, s => isNum(s.ClubSpeed_mph) ? s.ClubSpeed_mph! : null);
      out.push({
        club,
        carry: bestCarry && isNum(bestCarry.CarryDistance_yds) ? bestCarry.CarryDistance_yds! : undefined,
        ball: bestBall && isNum(bestBall.BallSpeed_mph) ? bestBall.BallSpeed_mph! : undefined,
        clubspd: bestClub && isNum(bestClub.ClubSpeed_mph) ? bestClub.ClubSpeed_mph! : undefined,
      });
    }
    // keep club order
    const order = new Map(allClubs.map((c, i) => [c, i]));
    out.sort((a, b) => (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return out;
  }, [filteredNoClubRaw, allClubs]);

  const personalRecords = (
    <div key="personalRecords" draggable onDragStart={onDragStart("personalRecords")} onDragOver={onDragOver("personalRecords")} onDrop={onDrop("personalRecords")}>
      <Card title="Personal Records" theme={T}>
        {prs.length ? (
          <div className="overflow-auto rounded-lg border" style={{ borderColor: T.border }}>
            <table className="w-full text-sm" style={{ color: T.text }}>
              <thead style={{ background: T.panelAlt }}>
                <tr>
                  <th className="text-left px-2 py-1">Club</th>
                  <th className="text-right px-2 py-1">Max Carry (yds)</th>
                  <th className="text-right px-2 py-1">Max Ball (mph)</th>
                  <th className="text-right px-2 py-1">Max Club (mph)</th>
                </tr>
              </thead>
              <tbody>
                {prs.map((r) => (
                  <tr key={r.club} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td className="px-2 py-1">{r.club}</td>
                    <td className="px-2 py-1 text-right">{r.carry != null ? r.carry.toFixed(1) : ""}</td>
                    <td className="px-2 py-1 text-right">{r.ball != null ? r.ball.toFixed(1) : ""}</td>
                    <td className="px-2 py-1 text-right">{r.clubspd != null ? r.clubspd.toFixed(1) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No records yet.</div>}
      </Card>
    </div>
  );

  /* ---------- Progress (average carry per day/session) ---------- */
  const progressData = useMemo(() => {
    // aggregate by SessionId (which you set to yyyy-mm-dd)
    const groups = groupBy(filteredNoClubOutliers, s => s.SessionId || "Unknown");
    const out: { session: string; carryAvg: number }[] = [];
    for (const [session, rows] of groups.entries()) {
      const carries = rows.map(s => s.CarryDistance_yds).filter(isNum);
      const a = avg(carries);
      if (a != null) out.push({ session, carryAvg: a });
    }
    // sort sessions by date string asc (yyyy-mm-dd sorts lexicographically)
    out.sort((a, b) => a.session.localeCompare(b.session));
    return out;
  }, [filteredNoClubOutliers]);

  const progress = (
    <div key="progress" draggable onDragStart={onDragStart("progress")} onDragOver={onDragOver("progress")} onDrop={onDrop("progress")}>
      <Card title="Progress (Avg Carry by Session)" theme={T}>
        {progressData.length ? (
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={progressData} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
                <CartesianGrid stroke={T.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="session"
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  interval={Math.max(0, Math.floor(progressData.length / 8) - 1)}
                  angle={-20}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  label={{ value: "Avg Carry (yds)", angle: -90, position: "insideLeft", fill: T.textDim, fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
                  formatter={(v: any) => [`${(v as number).toFixed?.(1)} yds`, "Avg Carry"]}
                />
                <Legend wrapperStyle={{ color: T.text }} />
                <Line type="monotone" dataKey="carryAvg" stroke={T.brand} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No sessions to chart.</div>}
      </Card>
    </div>
  );

  /* ---------- Weaknesses (clubs with low smash or high lateral) ---------- */
  const weaknessesData = useMemo(() => {
    const groups = groupBy(filteredOutliers, s => s.Club || "Unknown");
    type Row = { club: string; smashAvg?: number; lateralIQR?: number };
    const rows: Row[] = [];
    for (const [club, list] of groups.entries()) {
      const smash = list.map(s => s.SmashFactor).filter(isNum);
      const lateral = list.map(s => s.CarryDeviationDistance_yds).filter(isNum).sort((a, b) => a - b);
      const smashAvg = avg(smash) ?? undefined;
      let lateralIQR: number | undefined;
      if (lateral.length >= 8) {
        const q1 = lateral[Math.floor(lateral.length * 0.25)];
        const q3 = lateral[Math.floor(lateral.length * 0.75)];
        lateralIQR = q3 - q1;
      }
      rows.push({ club, smashAvg, lateralIQR });
    }
    // sort by smash ascending, then lateral IQR descending
    rows.sort((a, b) => {
      const sA = a.smashAvg ?? Infinity;
      const sB = b.smashAvg ?? Infinity;
      if (sA !== sB) return sA - sB;
      const lA = a.lateralIQR ?? -Infinity;
      const lB = b.lateralIQR ?? -Infinity;
      return lB - lA;
    });
    return rows;
  }, [filteredOutliers]);

  const weaknesses = (
    <div key="weaknesses" draggable onDragStart={onDragStart("weaknesses")} onDragOver={onDragOver("weaknesses")} onDrop={onDrop("weaknesses")}>
      <Card title="Weaknesses (Heuristics)" theme={T}>
        {weaknessesData.length ? (
          <div className="overflow-auto rounded-lg border" style={{ borderColor: T.border }}>
            <table className="w-full text-sm" style={{ color: T.text }}>
              <thead style={{ background: T.panelAlt }}>
                <tr>
                  <th className="text-left px-2 py-1">Club</th>
                  <th className="text-right px-2 py-1">Avg Smash</th>
                  <th className="text-right px-2 py-1">Lateral IQR (yds)</th>
                </tr>
              </thead>
              <tbody>
                {weaknessesData.map((r) => (
                  <tr key={r.club} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td className="px-2 py-1">{r.club}</td>
                    <td className="px-2 py-1 text-right">{r.smashAvg != null ? r.smashAvg.toFixed(3) : ""}</td>
                    <td className="px-2 py-1 text-right">{r.lateralIQR != null ? r.lateralIQR.toFixed(1) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No weaknesses detected.</div>}
      </Card>
    </div>
  );

  /* ---------- Assemble by order ---------- */
  const cardMap: Record<string, JSX.Element> = {
    distanceBox,
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
