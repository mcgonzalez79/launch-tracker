import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import { Card } from "./components/UI";
import {
  ResponsiveContainer,
  ScatterChart, Scatter,
  BarChart, Bar,
  ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine
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
  onDrop: (_key: string) => (_: React.DragEvent) => void;

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
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function average(nums: number[]): number { return nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : 0; }
function domainOf(vals: number[], pad = 0) {
  if (!vals.length) return [0, 1];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return [Math.floor(lo - pad), Math.ceil(hi + pad)];
}

/* =========================
   Component
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

  /* ---------- KPIs ---------- */
  const avgTotalDistance = useMemo(() => {
    const xs = filteredOutliers.map(s => s.TotalDistance_yds).filter(isNum) as number[];
    return average(xs);
  }, [filteredOutliers]);

  const KpiCell = ({ label, value, unit }: { label: string; value: string; unit?: string }) => (
    <div className="p-3 rounded-lg border" style={{ background: T.panelAlt, borderColor: T.border }}>
      <div className="text-xs" style={{ color: T.textDim }}>{label}</div>
      <div className="text-lg font-semibold" style={{ color: T.text }}>
        {value}{unit ? <span className="text-xs font-normal" style={{ color: T.textDim }}> {unit}</span> : null}
      </div>
    </div>
  );

  const kpiCard = (
    <div key="kpis" draggable onDragStart={onDragStart("kpis")} onDragOver={onDragOver("kpis")} onDrop={onDrop("kpis")}>
      <Card title="KPIs" theme={T}>
        {hasData ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCell label="Carry (avg)" value={kpis.carry.mean.toFixed(1)} unit="yds" />
            <KpiCell label="Ball speed (avg)" value={kpis.ball.mean.toFixed(1)} unit="mph" />
            <KpiCell label="Club speed (avg)" value={kpis.club.mean.toFixed(1)} unit="mph" />
            <KpiCell label="Smash (avg)" value={kpis.smash.mean.toFixed(3)} />
            <KpiCell label="Total (avg)" value={avgTotalDistance.toFixed(1)} unit="yds" />
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>Import some shots to see KPIs.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Shot Shape KPIs ---------- */
  const shapeAngles = useMemo(() => {
    return filteredOutliers
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
    <div key="shape" draggable onDragStart={onDragStart("shape")} onDragOver={onDragOver("shape")} onDrop={onDrop("shape")}>
      <Card title="Shot Shape (percent of shots)" theme={T}>
        {shapeAngles.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCell label="Hook" value={`${shapePercents.hook}%`} />
            <KpiCell label="Draw" value={`${shapePercents.draw}%`} />
            <KpiCell label="Straight" value={`${shapePercents.straight}%`} />
            <KpiCell label="Fade" value={`${shapePercents.fade}%`} />
            <KpiCell label="Slice" value={`${shapePercents.slice}%`} />
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
      filteredOutliers
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
  const dispYDomain = useMemo(() => domainOf(dispersionData.map(d => d.y), 5), [dispersionData]);

  const dispersionCard = (
    <div key="dispersion" draggable onDragStart={onDragStart("dispersion")} onDragOver={onDragOver("dispersion")} onDrop={onDrop("dispersion")}>
      <Card title="Dispersion (Carry lateral vs distance)" theme={T}>
        {dispersionData.length ? (
          <div style={{ height: 300 }}>
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
                    if (name === "x") return [`${val?.toFixed?.(1)} yds`, `Lateral${p?.Club ? ` — ${p.Club}` : ""}`];
                    if (name === "y") return [`${val?.toFixed?.(1)} yds`, "Carry"];
                    return [val, name];
                  }}
                />
                <Scatter name="Shots" data={dispersionData} fill={T.accent} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No dispersion data.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Gapping ---------- */
  const gapData = useMemo(() => {
    const byClub = new Map<string, Shot[]>();
    for (const s of filteredOutliers) {
      const k = s.Club || "Unknown";
      if (!byClub.has(k)) byClub.set(k, []);
      byClub.get(k)!.push(s);
    }
    const rows: { club: string; carry: number }[] = [];
    for (const [club, arr] of Array.from(byClub.entries())) {
      const xs = arr.map(s => s.CarryDistance_yds).filter(isNum) as number[];
      const avgCarry = average(xs);
      if (!Number.isNaN(avgCarry)) rows.push({ club, carry: avgCarry });
    }
    const order = new Map(clubs.map((c, i) => [c, i]));
    rows.sort((a, b) => (order.get(a.club) ?? 999) - (order.get(b.club) ?? 999));
    return rows;
  }, [filteredOutliers, clubs]);

  const gapCard = (
    <div key="gap" draggable onDragStart={onDragStart("gap")} onDragOver={onDragOver("gap")} onDrop={onDrop("gap")}>
      <Card title="Gapping (avg carry per club)" theme={T}>
        {gapData.length ? (
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={gapData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis dataKey="club" tick={{ fill: T.tick, fontSize: 12 }} stroke={T.tick} />
                <YAxis tick={{ fill: T.tick, fontSize: 12 }} stroke={T.tick} label={{ value: "Carry (yds)", angle: -90, position: "insideLeft", fill: T.textDim, fontSize: 12 }} />
                <Tooltip contentStyle={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }} formatter={(val: any) => [typeof val === "number" ? val.toFixed(1) : val, "Carry"]} />
                <Bar dataKey="carry" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No gapping data.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Efficiency (Ball vs Club speed scatter + smash trend) ---------- */
  const efficiencyData = useMemo(
    () =>
      filteredOutliers
        .filter(s => isNum(s.ClubSpeed_mph) && isNum(s.BallSpeed_mph))
        .map(s => ({
          x: s.ClubSpeed_mph as number,
          y: s.BallSpeed_mph as number,
          Club: s.Club,
          Timestamp: s.Timestamp,
        })),
    [filteredOutliers]
  );

  const effXMin = 50;
  const effXMax = useMemo(() => {
    const xs = efficiencyData.map(d => d.x);
    return xs.length ? Math.max(Math.ceil(Math.max(...xs) + 2), effXMin) : effXMin + 20;
  }, [efficiencyData]);

  const smashMean = useMemo(() => {
    const pairs = efficiencyData;
    if (!pairs.length) return 1.45;
    const ratios = pairs.map(p => p.y / p.x);
    return ratios.reduce((a, b) => a + b, 0) / ratios.length;
  }, [efficiencyData]);

  const trendData = useMemo(() => ([
    { x: effXMin, y: smashMean * effXMin },
    { x: effXMax, y: smashMean * effXMax }
  ]), [smashMean, effXMin, effXMax]);

  const effCard = (
    <div key="eff" draggable onDragStart={onDragStart("eff")} onDragOver={onDragOver("eff")} onDrop={onDrop("eff")}>
      <Card title="Efficiency (Ball vs Club speed)" theme={T} right={`Trend ≈ ${smashMean.toFixed(3)} smash`}>
        {efficiencyData.length ? (
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis dataKey="x" type="number" domain={[effXMin, effXMax] as any} tick={{ fill: T.tick, fontSize: 12 }} stroke={T.tick} label={{ value: "Club speed (mph)", position: "insideBottom", dy: 10, fill: T.textDim, fontSize: 12 }} />
                <YAxis dataKey="y" type="number" domain={["dataMin - 2", "dataMax + 2"] as any} tick={{ fill: T.tick, fontSize: 12 }} stroke={T.tick} label={{ value: "Ball speed (mph)", angle: -90, position: "insideLeft", fill: T.textDim, fontSize: 12 }} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
                  formatter={(val: any, name: string, item: any) => {
                    const p = item?.payload;
                    if (name === "x") return [`${val?.toFixed?.(1)} mph`, `Club${p?.Club ? ` — ${p.Club}` : ""}`];
                    if (name === "y") return [`${val?.toFixed?.(1)} mph`, "Ball"];
                    return [val, name];
                  }}
                />
                <Legend wrapperStyle={{ color: T.text }} />
                <Scatter name="Shots" data={efficiencyData} fill={T.accent} />
                <Line type="linear" data={trendData as any} dataKey="y" dot={false} stroke={T.textDim} strokeDasharray="4 4" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No speed data available.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Club Averages (replace recent shots) ---------- */
  const clubAvgData = useMemo(() => (
    tableRows.map((r: any) => ({
      club: r.club,
      avgCarry: Number(r.avgCarry || 0),
      avgTotal: Number(r.avgTotal || 0),
      avgSmash: Number(r.avgSmash || 0),
      avgCS: Number(r.avgCS || 0),
      avgBS: Number(r.avgBS || 0),
    }))
  ), [tableRows]);

  const tableCard = (
    <div key="table" draggable onDragStart={onDragStart("table")} onDragOver={onDragOver("table")} onDrop={onDrop("table")}>
      <Card title="Club Averages" theme={T}>
        {clubAvgData.length ? (
          <div style={{ height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={clubAvgData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis dataKey="club" tick={{ fill: T.tick, fontSize: 12 }} stroke={T.tick} />
                <YAxis yAxisId="left" tick={{ fill: T.tick, fontSize: 12 }} stroke={T.tick} label={{ value: "Distance (yds)", angle: -90, position: "insideLeft", fill: T.textDim, fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: T.tick, fontSize: 12 }} stroke={T.tick} label={{ value: "Smash", angle: 90, position: "insideRight", fill: T.textDim, fontSize: 12 }} />
                <Tooltip contentStyle={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
                  formatter={(val:any, name:string)=>[typeof val==='number'? (name==='avgSmash'? val.toFixed(3): val.toFixed(1)) : val, name.replace('avg','')]} />
                <Legend />
                <Bar yAxisId="left" dataKey="avgCarry" name="Carry" />
                <Bar yAxisId="left" dataKey="avgTotal" name="Total" />
                <Line yAxisId="right" type="linear" dataKey="avgSmash" name="Smash" dot={false} stroke={T.textDim} strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No club averages available.</div>
        )}
      </Card>
    </div>
  );

  const cardMap: Record<string, JSX.Element> = {
    kpis: kpiCard,
    shape: shapeCard,
    dispersion: dispersionCard,
    gap: gapCard,
    eff: effCard,
    table: tableCard,
  };

  return (
    <div className="grid gap-4">
      {cardOrder.map((key) => cardMap[key] ?? null)}
    </div>
  );
}
