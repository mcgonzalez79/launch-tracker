// src/Dashboard.tsx
import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import { Card } from "./components/UI";
import {
  ResponsiveContainer,
  ScatterChart, Scatter,
  BarChart, Bar,
  Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell
} from "recharts";

/* =========================
   Types (props from App.tsx)
========================= */
type KPI = { mean: number; n: number; std: number };
type KPIs = { carry: KPI; ball: KPI; club: KPI; smash: KPI };

type Props = {
  theme: Theme;
  cardOrder: string[];
  setCardOrder: (v: string[]) => void;

  onDragStart: (key: string) => (e: React.DragEvent) => void;
  onDragOver: (key: string) => (e: React.DragEvent) => void;
  onDrop: (key: string) => (e: React.DragEvent) => void;

  hasData: boolean;
  kpis: KPIs;

  filteredOutliers: Shot[];
  filtered: Shot[];
  shots: Shot[];

  tableRows: ClubRow[];
  clubs: string[];
};

/* =========================
   Small helpers
========================= */
function isNum(x: any): x is number {
  return typeof x === "number" && Number.isFinite(x);
}
function avg(xs: number[]) { return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0; }

/** Round out domain by step (e.g., nearest 5) with padding */
function domainOf(values: number[], step = 1, pad = step): [number, number] {
  if (!values.length) return [0, 1];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  lo = Math.floor((lo - pad) / step) * step;
  hi = Math.ceil((hi + pad) / step) * step;
  if (lo === hi) hi = lo + step;
  return [lo, hi];
}

/** Build a stable per-club color map */
function buildClubColorMap(clubs: string[]) {
  const PALETTE = [
    "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
    "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ab",
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"
  ];
  const m = new Map<string, string>();
  clubs.forEach((c, i) => m.set(c, PALETTE[i % PALETTE.length]));
  return m;
}

/* =========================
   Dashboard
========================= */
export default function DashboardCards(props: Props) {
  const {
    theme: T,
    cardOrder,
    onDragStart, onDragOver, onDrop,
    hasData,
    kpis,
    filteredOutliers,
    filtered,
    shots,
    tableRows,
    clubs,
  } = props;

  const clubColor = useMemo(() => buildClubColorMap(clubs || []), [clubs]);

  /* ---------- Layout: vertical full-width stack (like Insights) ---------- */
  const Stack: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="grid gap-4">{children}</div>
  );

  /* ---------- KPI Card ---------- */
  const kpiCard = (
    <div
      key="kpis"
      draggable
      onDragStart={onDragStart("kpis")}
      onDragOver={onDragOver("kpis")}
      onDrop={onDrop("kpis")}
    >
      <Card theme={T} title="KPIs" right={`n=${kpis?.carry?.n ?? 0}`}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCell label="Avg Carry" value={`${isNum(kpis?.carry?.mean) ? kpis!.carry.mean.toFixed(1) : "—"} yds`} theme={T} />
          <KpiCell label="Avg Total" value={`${isNum(kpis?.carry?.mean) ? (kpis!.carry.mean * 1.1).toFixed(1) : "—"} yds`} theme={T} />
          <KpiCell label="Ball Speed" value={`${isNum(kpis?.ball?.mean) ? kpis!.ball.mean.toFixed(1) : "—"} mph`} theme={T} />
          <KpiCell label="Club Speed" value={`${isNum(kpis?.club?.mean) ? kpis!.club.mean.toFixed(1) : "—"} mph`} theme={T} />
          <KpiCell label="Smash (avg)" value={`${isNum(kpis?.smash?.mean) ? kpis!.smash.mean.toFixed(3) : "—"}`} theme={T} />
        </div>
      </Card>
    </div>
  );

  /* ---------- Shot Shape KPIs ---------- */
  // Use LaunchDirection_deg when available; else fall back to ClubFace_deg as a directional proxy.
  const shapeAngles = useMemo(() => {
    return (filteredOutliers ?? [])
      .map(s => (isNum(s.LaunchDirection_deg) ? s.LaunchDirection_deg! : (isNum(s.ClubFace_deg) ? s.ClubFace_deg! : null)))
      .filter(isNum) as number[];
  }, [filteredOutliers]);

  const shapePercents = useMemo(() => {
    const total = shapeAngles.length || 1;
    let hook = 0, draw = 0, straight = 0, fade = 0, slice = 0;
    for (const a of shapeAngles) {
      if (a <= -6) hook++; else if (a < -2) draw++; else if (a <= 2) straight++; else if (a < 6) fade++; else slice++;
    }
    const pct = (n: number) => Math.round((n * 100) / total);
    return { hook: pct(hook), draw: pct(draw), straight: pct(straight), fade: pct(fade), slice: pct(slice) };
  }, [shapeAngles]);

  const shapeCard = (
    <div
      key="shape"
      draggable
      onDragStart={onDragStart("shape")}
      onDragOver={onDragOver("shape")}
      onDrop={onDrop("shape")}
    >
      <Card title="Shot Shape (percent of shots)" theme={T}>
        {shapeAngles.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCell label="Hook" value={`${shapePercents.hook}%`} theme={T} />
            <KpiCell label="Draw" value={`${shapePercents.draw}%`} theme={T} />
            <KpiCell label="Straight" value={`${shapePercents.straight}%`} theme={T} />
            <KpiCell label="Fade" value={`${shapePercents.fade}%`} theme={T} />
            <KpiCell label="Slice" value={`${shapePercents.slice}%`} theme={T} />
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No direction data.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Dispersion ---------- */
  const dispersionData = useMemo(
    () =>
      (filteredOutliers ?? [])
        .filter(s => isNum(s.CarryDeviationDistance_yds) && isNum(s.CarryDistance_yds))
        .map(s => ({
          x: (s.CarryDeviationDistance_yds as number) * -1, // left negative, right positive
          y: s.CarryDistance_yds as number,
          Club: s.Club,
          SessionId: s.SessionId,
          Timestamp: s.Timestamp,
        })),
    [filteredOutliers]
  );
  const dispXDomain = useMemo(() => domainOf(dispersionData.map(d => d.x), 5), [dispersionData]);
  const dispYDomain = useMemo(() => domainOf(dispersionData.map(d => d.y), 10), [dispersionData]);

  const dispersionCard = (
    <div
      key="dispersion"
      draggable
      onDragStart={onDragStart("dispersion")}
      onDragOver={onDragOver("dispersion")}
      onDrop={onDrop("dispersion")}
    >
      <Card title="Dispersion (Carry lateral vs distance)" theme={T}>
        {dispersionData.length ? (
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={dispXDomain as any}
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  label={{ value: "Lateral (yds, left - / right +)", position: "insideBottom", dy: 10, fill: T.textDim, fontSize: 12 }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  domain={dispYDomain as any}
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  label={{ value: "Carry (yds)", angle: -90, position: "insideLeft", fill: T.textDim, fontSize: 12 }}
                />
                <ReferenceLine x={0} stroke={T.grid} strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
                  formatter={(val: any, name: string, item: any) => {
                    const p = item?.payload;
                    if (name === "x") return [Number(val).toFixed(1), "Lateral (yds)"];
                    if (name === "y") return [Number(val).toFixed(1), "Carry (yds)"];
                    return [val, name];
                  }}
                  labelFormatter={(_, items) => {
                    const p = items && items[0] && (items[0] as any).payload;
                    return p ? `${p.Club || ""} – ${p.Timestamp || ""}` : "";
                  }}
                />
                <Scatter name="Shots" data={dispersionData}>
                  {dispersionData.map((d,i)=>(<Cell key={i} fill={clubColor.get(d.Club)||T.accent} />))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No dispersion data.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Gapping (avg carry per club) ---------- */
  const gapData = useMemo(() => {
    // Preserve display order using incoming clubs array
    const byClub = new Map<string, ClubRow>();
    for (const r of (tableRows || []) as any[]) byClub.set((r as any).club, r as any);
    return (clubs || []).map(club => ({
      club,
      carry: Number((byClub.get(club)?.avgCarry ?? 0)) || 0
    }));
  }, [tableRows, clubs]);

  const gapCard = (
    <div
      key="gap"
      draggable
      onDragStart={onDragStart("gap")}
      onDragOver={onDragOver("gap")}
      onDrop={onDrop("gap")}
    >
      <Card title="Gapping (avg carry per club)" theme={T}>
        {gapData.length ? (
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={gapData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis dataKey="club" tick={{ fill: T.tick, fontSize: 12 }} stroke={T.tick} />
                <YAxis tick={{ fill: T.tick, fontSize: 12 }} stroke={T.tick} label={{ value: "Carry (yds)", angle: -90, position: "insideLeft", fill: T.textDim, fontSize: 12 }} />
                <Tooltip contentStyle={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }} formatter={(val: any) => [typeof val === "number" ? val.toFixed(1) : val, "Carry"]} />
                <Bar dataKey="carry" fill={T.brand} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No gapping data.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Efficiency (Ball vs Club speed) ---------- */
  const efficiencyData = useMemo(
    () =>
      (filteredOutliers ?? [])
        .filter(s => isNum(s.ClubSpeed_mph) && isNum(s.BallSpeed_mph))
        .map(s => ({
          x: s.ClubSpeed_mph as number,
          y: s.BallSpeed_mph as number,
          Club: s.Club,
          Timestamp: s.Timestamp,
        })),
    [filteredOutliers]
  );

  // X domain starts at 50 mph as you requested earlier; auto-extend upper bound based on data
  const effXMin = 50;
  const effXMax = useMemo(() => {
    const xs = efficiencyData.map(d => d.x);
    return xs.length ? Math.max(Math.ceil(Math.max(...xs) + 2), effXMin + 20) : effXMin + 20;
  }, [efficiencyData]);

  // Smash trendline: y = m * x where m is average smash across visible points
  const smashMean = useMemo(() => {
    const ratios = efficiencyData.map(d => (d.x ? d.y / d.x : NaN)).filter(isNum);
    return ratios.length ? avg(ratios) : NaN;
  }, [efficiencyData]);

  const effLineData = useMemo(() => {
    if (!isNum(smashMean)) return null;
    return [
      { x: effXMin, y: smashMean * effXMin },
      { x: effXMax, y: smashMean * effXMax },
    ];
  }, [smashMean, effXMin, effXMax]);

  const effCard = (
    <div
      key="eff"
      draggable
      onDragStart={onDragStart("eff")}
      onDragOver={onDragOver("eff")}
      onDrop={onDrop("eff")}
    >
      <Card title="Efficiency (Ball vs Club speed)" theme={T} right={isNum(smashMean) ? `Trend ≈ ${smashMean.toFixed(3)} smash` : undefined}>
        {efficiencyData.length ? (
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 10, bottom: 24, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={[effXMin, effXMax] as any}
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  label={{ value: "Club Speed (mph)", position: "insideBottom", dy: 10, fill: T.textDim, fontSize: 12 }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  tickFormatter={(v: number) => Number(v).toFixed(2)}
                  label={{ value: "Ball Speed (mph)", angle: -90, position: "insideLeft", fill: T.textDim, fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
                  formatter={(val: any, name: any) => [Number(val).toFixed(2), name === "x" ? "Club Speed" : "Ball Speed"]}
                  labelFormatter={(_, items) => {
                    const p = items && items[0] && (items[0] as any).payload;
                    return p ? `${p.Club || ""} – ${p.Timestamp || ""}` : "";
                  }}
                />
                <Scatter name="Shots" data={efficiencyData}>
                  {efficiencyData.map((d,i)=>(<Cell key={i} fill={clubColor.get(d.Club)||T.accent} />))}
                </Scatter>
                {effLineData ? (
                  <Line
                    data={effLineData}
                    type="linear"
                    dataKey="y"
                    dot={false}
                    stroke={T.text}
                    strokeDasharray="6 6"
                    isAnimationActive={false}
                  />
                ) : null}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No efficiency data.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Club Averages Table (with print anchor id) ---------- */
  const tableCard = (
    <div
      key="table"
      draggable
      onDragStart={onDragStart("table")}
      onDragOver={onDragOver("table")}
      onDrop={onDrop("table")}
    >
      <Card theme={T} title="Club Averages">
        {tableRows && tableRows.length ? (
          <div className="overflow-auto">
            <table id="print-club-averages-table" className="min-w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: T.panelAlt, color: T.text }}>
                  <th className="text-left py-2 px-2">Club</th>
                  <th className="text-right py-2 px-2">Shots</th>
                  <th className="text-right py-2 px-2">Avg Carry</th>
                  <th className="text-right py-2 px-2">Avg Total</th>
                  <th className="text-right py-2 px-2">Avg Smash</th>
                  <th className="text-right py-2 px-2">Avg Spin</th>
                  <th className="text-right py-2 px-2">Club Spd</th>
                  <th className="text-right py-2 px-2">Ball Spd</th>
                  <th className="text-right py-2 px-2">Launch</th>
                  <th className="text-right py-2 px-2">Face-Path</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r: any) => (
                  <tr key={r.club} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td className="py-2 px-2">{r.club}</td>
                    <td className="text-right py-2 px-2">{(r as any).count}</td>
                    <td className="text-right py-2 px-2">{Number((r as any).avgCarry ?? 0).toFixed(1)}</td>
                    <td className="text-right py-2 px-2">{Number((r as any).avgTotal ?? 0).toFixed(1)}</td>
                    <td className="text-right py-2 px-2">{Number((r as any).avgSmash ?? 0).toFixed(3)}</td>
                    <td className="text-right py-2 px-2">{Number((r as any).avgSpin ?? 0).toFixed(0)}</td>
                    <td className="text-right py-2 px-2">{Number((r as any).avgCS ?? 0).toFixed(1)}</td>
                    <td className="text-right py-2 px-2">{Number((r as any).avgBS ?? 0).toFixed(1)}</td>
                    <td className="text-right py-2 px-2">{Number((r as any).avgLA ?? 0).toFixed(1)}</td>
                    <td className="text-right py-2 px-2">{Number((r as any).avgF2P ?? 0).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No club averages available.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Card map & render ---------- */
  const cardMap: Record<string, JSX.Element> = {
    kpis: kpiCard,
    shape: shapeCard,
    dispersion: dispersionCard,
    gap: gapCard,
    eff: effCard,
    table: tableCard,
  };

  return (
    <Stack>
      {cardOrder.map((key) => cardMap[key] ?? null)}
    </Stack>
  );
}

/* =========================
   Small presentational components
========================= */
function KpiCell({
  label, value, theme: T
}: { label: string; value: string; theme: Theme; }) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: T.panelAlt, borderColor: T.border }}>
      <div className="text-xs mb-1" style={{ color: T.textDim }}>{label}</div>
      <div className="text-xl md:text-2xl font-semibold" style={{ color: T.text }}>{value}</div>
    </div>
  );
}
