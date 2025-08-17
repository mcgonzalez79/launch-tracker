import React, { useMemo, useEffect, useRef, useState } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import { Card } from "./components/UI";
import {
  ResponsiveContainer,
  LineChart, Line,
  Bar,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Customized
} from "recharts";

/* =========================
   Props
========================= */
type Props = {
  theme: Theme;

  // from App.tsx
  tableRows: ClubRow[];                 // may be empty — not used here
  filteredOutliers: Shot[];             // outliers removed, respects club selection
  filteredNoClubOutliers: Shot[];       // outliers removed, ignores club selection
  filteredNoClubRaw: Shot[];            // raw (no outlier removal), ignores club selection
  allClubs: string[];                   // full club list (ordered)
  insightsOrder: string[];

  onDragStart: (key: string) => (e: React.DragEvent) => void;
  onDragOver: (key: string) => (e: React.DragEvent) => void;
  onDrop: (_key: string) => (_: React.DragEvent) => void;
};

/* =========================
   Helpers
========================= */
function groupBy<T>(rows: T[], keyFn: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

function isNum(v: any): v is number { return typeof v === "number" && Number.isFinite(v); }

function avg(nums: number[]) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(nums: number[]) {
  if (nums.length < 2) return null;
  const m = avg(nums)!;
  const v = avg(nums.map(x => (x - m) ** 2))!;
  return Math.sqrt(v);
}

function quantile(sortedNums: number[], q: number) {
  if (!sortedNums.length) return null;
  const pos = (sortedNums.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedNums[base + 1] !== undefined) {
    return sortedNums[base] + rest * (sortedNums[base + 1] - sortedNums[base]);
  } else {
    return sortedNums[base];
  }
}

function maxBy<T>(rows: T[], val: (r: T) => number | null | undefined) {
  let best: T | null = null;
  let bestV = -Infinity;
  for (const r of rows) {
    const v = val(r);
    if (v != null && v > bestV) { bestV = v; best = r; }
  }
  return best;
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function shortDate(s?: string) {
  if (!s) return "";
  // Try simple ISO first
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toLocaleDateString();
  return s;
}

function domainOf(nums: number[], pad: number = 0) {
  const vals = nums.filter(isNum);
  if (!vals.length) return [0, 1];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return [Math.floor(lo - pad), Math.ceil(hi + pad)];
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

  /* ---------- Helpers derived from selection ---------- */
  const selectedClubs = useMemo(() => {
    const set = new Set<string>();
    for (const s of filteredOutliers) {
      if (s.Club) set.add(s.Club);
    }
    return Array.from(set);
  }, [filteredOutliers]);
  const singleSelectedClub = selectedClubs.length === 1 ? selectedClubs[0] : null;

  /* ---------- Distance Distribution (horizontal box & whisker per club) ---------- */
  type BoxRow = { club: string; min: number; q1: number; q3: number; max: number };
  const boxRows: BoxRow[] = useMemo(() => {
    const g = groupBy(filteredOutliers, s => s.Club || "Unknown");
    const order = new Map(allClubs.map((c, i) => [c, i]));
    const out: BoxRow[] = [];
    for (const [club, rows] of g.entries()) {
      const carries = rows.map(s => s.CarryDistance_yds).filter(isNum).sort((a, b) => a - b);
      if (carries.length >= 4) {
        const min = carries[0];
        const q1 = quantile(carries, 0.25)!;
        const q3 = quantile(carries, 0.75)!;
        const max = carries[carries.length - 1];
        out.push({ club, min, q1, q3, max });
      }
    }
    out.sort((a, b) => (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return out;
  }, [filteredOutliers, allClubs]);

  const distDomain = useMemo(() => domainOf(boxRows.flatMap(r => [r.min, r.max]), 5), [boxRows]);

  const distanceBox = (
    <div key="distanceBox" draggable onDragStart={onDragStart("distanceBox")} onDragOver={onDragOver("distanceBox")} onDrop={onDrop("distanceBox")}>
      <Card title="Distance Distribution — Carry (Horizontal Box & Whisker)" theme={T}>
        {boxRows.length ? (
          <div style={{ height: Math.max(220, 28 * boxRows.length) }}>
            <ResponsiveContainer>
              <ComposedChart data={boxRows} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                <CartesianGrid stroke={T.grid} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  domain={distDomain as any}
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  label={{ value: "Carry (yds)", position: "insideBottom", offset: -2, fill: T.textDim, fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="club"
                  tick={{ fill: T.tick, fontSize: 12 }}
                  width={90}
                  stroke={T.tick}
                />
                {/* Draw IQR boxes with a stacked trick: invisible offset up to q1, visible bar for (q3-q1) */}
                <Bar dataKey="q1" stackId="iqr" fill="transparent" />
                <Bar dataKey={(d: any) => Math.max(0, d.q3 - d.q1)} stackId="iqr" fill={T.brand} barSize={18} />
                {/* Whiskers via Customized */}
                <Customized component={(props: any) => {
                  const { yAxisMap, xAxisMap, offset, data } = props;
                  const yScale = yAxisMap[0].scale;
                  const xScale = xAxisMap[0].scale;
                  const items: any[] = [];
                  data.forEach((row: any, idx: number) => {
                    const y = (yScale as any)(row.club) + 0.5 * (yScale.bandwidth ? yScale.bandwidth() : 18);
                    const xMin = (xScale as any)(row.min);
                    const xQ1 = (xScale as any)(row.q1);
                    const xQ3 = (xScale as any)(row.q3);
                    const xMax = (xScale as any)(row.max);
                    const cap = 8;
                    items.push(
                      // left whisker line
                      <line key={`wl-${idx}`} x1={xMin} y1={y} x2={xQ1} y2={y} stroke={T.tick} />,
                      // left cap
                      <line key={`wcL-${idx}`} x1={xMin} y1={y - cap/2} x2={xMin} y2={y + cap/2} stroke={T.tick} />,
                      // right whisker line
                      <line key={`wr-${idx}`} x1={xQ3} y1={y} x2={xMax} y2={y} stroke={T.tick} />,
                      // right cap
                      <line key={`wcR-${idx}`} x1={xMax} y1={y - cap/2} x2={xMax} y2={y + cap/2} stroke={T.tick} />,
                    );
                  });
                  return <g clipPath={`inset(${offset.top}px ${offset.right}px ${offset.bottom}px ${offset.left}px)`}>{items}</g>;
                }} />
                <Tooltip
                  contentStyle={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
                  formatter={(v: any, n: any, p: any) => {
                    const r = p?.payload as BoxRow;
                    return [
                      `min ${r.min.toFixed(1)} • q1 ${r.q1.toFixed(1)} • q3 ${r.q3.toFixed(1)} • max ${r.max.toFixed(1)}`,
                      r.club
                    ];
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No carry data available.</div>}
      </Card>
    </div>
  );

  /* ---------- Highlights (global PRs + most consistent; ignores club selection) ---------- */
  // Compute once per actual dataset change (date/session/outlier), not when club selection changes.
  const makeSignature = (rows: Shot[]) => {
    const n = rows.length;
    let minTS = Infinity, maxTS = -Infinity, sumCarry = 0;
    for (const s of rows) {
      const t = Date.parse((s as any).Timestamp || "");
      if (!Number.isNaN(t)) {
        if (t < minTS) minTS = t;
        if (t > maxTS) maxTS = t;
      }
      const c = (typeof s.CarryDistance_yds === "number" && Number.isFinite(s.CarryDistance_yds)) ? s.CarryDistance_yds : 0;
      sumCarry += c;
    }
    return `${n}|${minTS}|${maxTS}|${Math.round(sumCarry)}`;
  };

  const computeHighlights = (rows: Shot[]) => {
    const bestCarry = maxBy(rows, s => isNum(s.CarryDistance_yds) ? s.CarryDistance_yds! : null);
    const bestTotal = maxBy(rows, s => isNum(s.TotalDistance_yds) ? s.TotalDistance_yds! : null);

    // consistency by club via carry stddev (min samples = 5)
    const g = groupBy(rows, s => s.Club || "Unknown");
    let mostConsistent: { club: string; sd: number; n: number } | null = null;
    for (const [club, rs] of g.entries()) {
      const carries = rs.map(s => s.CarryDistance_yds).filter(isNum);
      if (carries.length >= 5) {
        const sd = stddev(carries)!;
        if (!mostConsistent || sd < mostConsistent.sd) {
          mostConsistent = { club, sd, n: carries.length };
        }
      }
    }
    return {
      prCarry: bestCarry ? {
        value: bestCarry.CarryDistance_yds!,
        club: bestCarry.Club || "",
        date: shortDate((bestCarry as any).Timestamp),
      } : null,
      prTotal: bestTotal ? {
        value: bestTotal.TotalDistance_yds!,
        club: bestTotal.Club || "",
        date: shortDate((bestTotal as any).Timestamp),
      } : null,
      mostConsistent,
    } as const;
  };

  const candidateRows = (filteredNoClubRaw && filteredNoClubRaw.length) ? filteredNoClubRaw : filteredNoClubOutliers;
  const [highlightsInfo, setHighlightsInfo] = useState(() => computeHighlights(candidateRows));
  const prevSigRef = useRef<string>(makeSignature(candidateRows));
  const prevAllClubsKeyRef = useRef<string>(allClubs.join("|"));
  const prevSelectedClubsKeyRef = useRef<string>(selectedClubs.slice().sort().join("|"));

  useEffect(() => {
    const rows = (filteredNoClubRaw && filteredNoClubRaw.length) ? filteredNoClubRaw : filteredNoClubOutliers;
    const newSig = makeSignature(rows);
    const clubsKey = selectedClubs.slice().sort().join("|");
    const allClubsKey = allClubs.join("|");

    const datasetChanged = newSig !== prevSigRef.current;
    const clubsChanged = clubsKey !== prevSelectedClubsKeyRef.current;
    const allClubsChanged = allClubsKey !== prevAllClubsKeyRef.current;

    // If only the club selection changed, ignore; otherwise update.
    if (datasetChanged && (!clubsChanged || allClubsChanged)) {
      setHighlightsInfo(computeHighlights(rows));
      prevSigRef.current = newSig;
    }

    prevSelectedClubsKeyRef.current = clubsKey;
    prevAllClubsKeyRef.current = allClubsKey;
  }, [filteredNoClubRaw, filteredNoClubOutliers, allClubs, selectedClubs]);

  const highlights = (
    <div key="highlights" draggable onDragStart={onDragStart("highlights")} onDragOver={onDragOver("highlights")} onDrop={onDrop("highlights")}>
      <Card title="Highlights (All Clubs)" theme={T}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border p-3" style={{ borderColor: T.border }}>
            <div className="font-semibold" style={{ color: T.textDim }}>PR Carry</div>
            {highlightsInfo.prCarry ? (
              <div>
                <div className="text-2xl font-bold">{highlightsInfo.prCarry.value.toFixed(1)} yds</div>
                <div style={{ color: T.textDim }}>{highlightsInfo.prCarry.club || ""}</div>
                <div style={{ color: T.textDim }}>{highlightsInfo.prCarry.date}</div>
              </div>
            ) : <div style={{ color: T.textDim }}>—</div>}
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: T.border }}>
            <div className="font-semibold" style={{ color: T.textDim }}>PR Total</div>
            {highlightsInfo.prTotal ? (
              <div>
                <div className="text-2xl font-bold">{highlightsInfo.prTotal.value.toFixed(1)} yds</div>
                <div style={{ color: T.textDim }}>{highlightsInfo.prTotal.club || ""}</div>
                <div style={{ color: T.textDim }}>{highlightsInfo.prTotal.date}</div>
              </div>
            ) : <div style={{ color: T.textDim }}>—</div>}
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: T.border }}>
            <div className="font-semibold" style={{ color: T.textDim }}>Most Consistent Club</div>
            {highlightsInfo.mostConsistent ? (
              <div>
                <div className="text-xl font-semibold">{highlightsInfo.mostConsistent.club}</div>
                <div style={{ color: T.textDim }}>SD (Carry): {highlightsInfo.mostConsistent.sd.toFixed(1)} yds</div>
                <div style={{ color: T.textDim }}>Shots: {highlightsInfo.mostConsistent.n}</div>
              </div>
            ) : <div style={{ color: T.textDim }}>—</div>}
          </div>
        </div>
      </Card>
    </div>
  );

  /* ---------- Swing Metrics (only for single selected club) ---------- */
  const swingMetrics = (
    <div key="swingMetrics" draggable onDragStart={onDragStart("swingMetrics")} onDragOver={onDragOver("swingMetrics")} onDrop={onDrop("swingMetrics")}>
      <Card title="Swing Metrics" theme={T}>
        {singleSelectedClub ? (() => {
          const rows = filteredOutliers.filter(s => (s.Club || "Unknown") === singleSelectedClub);
          const aoa = avg(rows.map(s => s.AttackAngle_deg).filter(isNum));
          const path = avg(rows.map(s => s.ClubPath_deg).filter(isNum));
          const face = avg(rows.map(s => s.ClubFace_deg).filter(isNum));
          const f2p = avg(rows.map(s => s.FaceToPath_deg).filter(isNum));
          const cells: { label: string; val: number | null }[] = [
            { label: "Attack Angle (°)", val: aoa },
            { label: "Club Path (°)", val: path },
            { label: "Club Face (°)", val: face },
            { label: "Face to Path (°)", val: f2p },
          ];
          return (
            <div className="text-sm">
              <div className="mb-2" style={{ color: T.textDim }}>Club: {singleSelectedClub}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {cells.map((c) => (
                  <div key={c.label} className="rounded-lg border p-3" style={{ borderColor: T.border }}>
                    <div className="font-semibold" style={{ color: T.textDim }}>{c.label}</div>
                    <div className="text-xl font-bold">{c.val != null ? c.val.toFixed(2) : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })() : (() => {
          // Aggregate over all currently loaded data (ignores club selection)
          const rows = filteredNoClubOutliers;
          const aoa = avg(rows.map(s => s.AttackAngle_deg).filter(isNum));
          const path = avg(rows.map(s => s.ClubPath_deg).filter(isNum));
          const face = avg(rows.map(s => s.ClubFace_deg).filter(isNum));
          const f2p = avg(rows.map(s => s.FaceToPath_deg).filter(isNum));
          const cells: { label: string; val: number | null }[] = [
            { label: "Attack Angle (°)", val: aoa },
            { label: "Club Path (°)", val: path },
            { label: "Club Face (°)", val: face },
            { label: "Face to Path (°)", val: f2p },
          ];
          return (
            <div className="text-sm">
              <div className="mb-2" style={{ color: T.textDim }}>Scope: All currently loaded data</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {cells.map((c) => (
                  <div key={c.label} className="rounded-lg border p-3" style={{ borderColor: T.border }}>
                    <div className="font-semibold" style={{ color: T.textDim }}>{c.label}</div>
                    <div className="text-xl font-bold">{c.val != null ? c.val.toFixed(2) : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Card>
    </div>
  );

  /* ---------- Warnings (unchanged basic heuristics, still respects selection) ---------- */
  const warningsList = useMemo(() => {
    const items: string[] = [];
    // Low smash overall
    const smashVals = filteredOutliers.map(s => s.SmashFactor).filter(isNum);
    const sAvg = avg(smashVals);
    if (sAvg != null && sAvg < 1.40) items.push(`Low average smash factor (${sAvg.toFixed(2)}). Focus on centered contact.`);

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
      if (aoa != null && aoa < -1) items.push(`Driver AoA average ${aoa.toFixed(2)}° down. Try tee height/ball position for upward hit.`);
    }
    return items;
  }, [filteredOutliers]);

  const warnings = (
    <div key="warnings" draggable onDragStart={onDragStart("warnings")} onDragOver={onDragOver("warnings")} onDrop={onDrop("warnings")}>
      <Card title="Warnings (Heuristics)" theme={T}>
        {warningsList.length ? (
          <ul className="list-disc pl-5 text-sm" style={{ color: T.text }}>
            {warningsList.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No warnings triggered.</div>}
      </Card>
    </div>
  );

  /* ---------- Personal Records (only when a single club is selected; uses RAW rows) ---------- */
  const personalRecords = (
    <div key="personalRecords" draggable onDragStart={onDragStart("personalRecords")} onDragOver={onDragOver("personalRecords")} onDrop={onDrop("personalRecords")}>
      <Card title="Personal Records" theme={T}>
        {singleSelectedClub ? (() => {
          const rows = filteredNoClubRaw.filter(s => (s.Club || "Unknown") === singleSelectedClub);
          const bestCarry = maxBy(rows, s => isNum(s.CarryDistance_yds) ? s.CarryDistance_yds! : null);
          const bestTotal = maxBy(rows, s => isNum(s.TotalDistance_yds) ? s.TotalDistance_yds! : null);
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3" style={{ borderColor: T.border }}>
                <div className="font-semibold" style={{ color: T.textDim }}>PR Carry</div>
                {bestCarry ? (
                  <div>
                    <div className="text-2xl font-bold">{bestCarry.CarryDistance_yds!.toFixed(1)} yds</div>
                    <div style={{ color: T.textDim }}>{shortDate(bestCarry.Timestamp)}</div>
                  </div>
                ) : <div style={{ color: T.textDim }}>—</div>}
              </div>
              <div className="rounded-lg border p-3" style={{ borderColor: T.border }}>
                <div className="font-semibold" style={{ color: T.textDim }}>PR Total</div>
                {bestTotal ? (
                  <div>
                    <div className="text-2xl font-bold">{bestTotal.TotalDistance_yds!.toFixed(1)} yds</div>
                    <div style={{ color: T.textDim }}>{shortDate(bestTotal.Timestamp)}</div>
                  </div>
                ) : <div style={{ color: T.textDim }}>—</div>}
              </div>
            </div>
          );
        })() : <div className="text-sm" style={{ color: T.textDim }}>Select a single club to see its PRs.</div>}
      </Card>
    </div>
  );

  /* ---------- Progress (by session; unchanged, ignores club selection) ---------- */
  const progressData = useMemo(() => {
    const groups = groupBy(filteredNoClubOutliers, s => s.SessionId || "Unknown");
    const out: { session: string; carryAvg: number }[] = [];
    for (const [session, rows] of groups.entries()) {
      const carries = rows.map(s => s.CarryDistance_yds).filter(isNum);
      const a = avg(carries);
      if (a != null) out.push({ session, carryAvg: a });
    }
    out.sort((a, b) => a.session.localeCompare(b.session)); // yyyy-mm-dd sorts lexicographically
    return out;
  }, [filteredNoClubOutliers]);

  const progress = (
    <div key="progress" draggable onDragStart={onDragStart("progress")} onDragOver={onDragOver("progress")} onDrop={onDrop("progress")}>
      <Card title="Progress (Avg Carry by Session)" theme={T}>
        {progressData.length ? (
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={progressData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
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
                <Line type="monotone" dataKey="carryAvg" stroke={T.brand} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="text-sm" style={{ color: T.textDim }}>No session data available.</div>}
      </Card>
    </div>
  );

  /* ---------- Weaknesses placeholder (kept if you had it ordered) ---------- */
  const weaknesses = (
    <div key="weaknesses" draggable onDragStart={onDragStart("weaknesses")} onDragOver={onDragOver("weaknesses")} onDrop={onDrop("weaknesses")}>
      <Card title="Weaknesses" theme={T}>
        <div className="text-sm" style={{ color: T.textDim }}>Coming soon.</div>
      </Card>
    </div>
  );

  const cardMap: Record<string, React.ReactNode> = {
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
