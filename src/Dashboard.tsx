import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import { Card } from "./components/UI";
import {
  ResponsiveContainer,
  ScatterChart, Scatter,
  BarChart, Bar,
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

/** Safe average by club */
function averageBy<T extends keyof Shot>(rows: Shot[], key: T): number | null {
  const vals = rows.map(r => r[key]).filter(isNum) as number[];
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Group shots by club name */
function groupByClub(rows: Shot[]) {
  const map = new Map<string, Shot[]>();
  for (const s of rows) {
    const k = s.Club || "Unknown";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(s);
  }
  return map;
}

/** Nice axis domain helper */
function domainOf(vals: number[], pad = 0): [number, number] {
  if (!vals.length) return [0, 0];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
}

/* =========================
   Dashboard
========================= */
export default function DashboardCards(props: Props) {
  const {
    theme: T,
    cardOrder,
    onDragStart,
    onDragOver,
    onDrop,
    hasData,
    kpis,
    filteredOutliers,
    filtered,
    // shots,
    // tableRows,
    clubs,
  } = props;

  /* ---------- KPI Card ---------- */
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
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCell label="Carry (avg)" value={kpis.carry.mean.toFixed(1)} unit="yds" />
            <KpiCell label="Ball speed (avg)" value={kpis.ball.mean.toFixed(1)} unit="mph" />
            <KpiCell label="Club speed (avg)" value={kpis.club.mean.toFixed(1)} unit="mph" />
            <KpiCell label="Smash (avg)" value={kpis.smash.mean.toFixed(3)} />
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>Import some shots to see KPIs.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Shot Shape (distribution by LaunchDirection/ClubFace) ---------- */
  const shapeData = useMemo(() => {
    const angles = filteredOutliers
      .map(s => isNum(s.LaunchDirection_deg) ? s.LaunchDirection_deg! : (isNum(s.ClubFace_deg) ? s.ClubFace_deg! : null))
      .filter(isNum);

    const binSize = 2;
    const map = new Map<number, number>();
    for (const a of angles) {
      const bin = Math.round(a / binSize) * binSize;
      map.set(bin, (map.get(bin) ?? 0) + 1);
    }
    const arr = Array.from(map.entries()).map(([bin, count]) => ({ bin, count }));
    arr.sort((a, b) => a.bin - b.bin);
    return arr;
  }, [filteredOutliers]);

  const shapeDomain = useMemo(() => {
    const xs = shapeData.map(d => d.bin);
    return domainOf(xs, 2);
  }, [shapeData]);

  
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

  /* ---------- Dispersion (Carry Deviation vs Carry Distance) ---------- */
  const dispersionData = useMemo(
    () =>
      filteredOutliers
        .filter(s => isNum(s.CarryDeviationDistance_yds) && isNum(s.CarryDistance_yds))
        .map(s => ({
          x: s.CarryDeviationDistance_yds!, // lateral (yds, left - / right +)
          y: s.CarryDistance_yds!,
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
              <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={T.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={dispXDomain as any}
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  label={{ value: "Lateral @ carry (yds, − left / + right)", position: "insideBottom", offset: -2, fill: T.textDim, fontSize: 12 }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  domain={dispYDomain as any}
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  label={{ value: "Carry (yds)", angle: -90, position: "insideLeft", fill: T.textDim, fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
                  // Use formatter's 3rd arg (item) to read item.payload safely, and avoid labelFormatter typing issues
                  formatter={(val: any, name: string, item: any) => {
                    const p = item?.payload;
                    if (name === "x") return [`${val?.toFixed?.(1)} yds`, `Lateral${p?.Club ? ` — ${p.Club}` : ""}`];
                    if (name === "y") return [`${val?.toFixed?.(1)} yds`, "Carry"];
                    return [val, name];
                  }}
                />
                <Legend wrapperStyle={{ color: T.text }} />
                <ReferenceLine x={0} stroke={T.border} />
                <Scatter name="Shots" data={dispersionData} fill={T.brand} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No dispersion data available.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Gapping (avg carry per club) ---------- */
  const gapData = useMemo(() => {
    const groups = groupByClub(filteredOutliers);
    const rows: { club: string; carry: number }[] = [];
    for (const [club, list] of groups.entries()) {
      const avgCarry = averageBy(list, "CarryDistance_yds");
      if (avgCarry != null) rows.push({ club, carry: avgCarry });
    }
    // keep the order the parent derived (clubs prop)
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
              <BarChart data={gapData} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
                <CartesianGrid stroke={T.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="club"
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  label={{ value: "Carry (yds)", angle: -90, position: "insideLeft", fill: T.textDim, fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
                  formatter={(v: any) => [`${(v as number)?.toFixed?.(1)} yds`, "Avg Carry"]}
                />
                <Bar dataKey="carry" fill={T.brand} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No gapping data available.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Efficiency (Ball vs Club speed scatter) ---------- */
  const efficiencyData = useMemo(
    () =>
      filteredOutliers
        .filter(s => isNum(s.ClubSpeed_mph) && isNum(s.BallSpeed_mph))
        .map(s => ({
          x: s.ClubSpeed_mph!,
          y: s.BallSpeed_mph!,
          Club: s.Club,
          Timestamp: s.Timestamp,
        })),
    [filteredOutliers]
  );

  const effXMin = 50; // floor at 50 mph
  const effXMax = useMemo(() => {
    const xs = efficiencyData.map(d => d.x);
    return xs.length ? Math.max(Math.ceil(Math.max(...xs) + 2), effXMin) : effXMin + 20;
  }, [efficiencyData]);

  const effCard = (
    <div key="eff" draggable onDragStart={onDragStart("eff")} onDragOver={onDragOver("eff")} onDrop={onDrop("eff")}>
      <Card title="Efficiency (Ball vs Club speed)" theme={T}>
        {efficiencyData.length ? (
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={T.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={[effXMin, effXMax]}
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  label={{ value: "Club speed (mph)", position: "insideBottom", offset: -2, fill: T.textDim, fontSize: 12 }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  domain={["dataMin - 2", "dataMax + 2"] as any}
                  tick={{ fill: T.tick, fontSize: 12 }}
                  stroke={T.tick}
                  label={{ value: "Ball speed (mph)", angle: -90, position: "insideLeft", fill: T.textDim, fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
                  formatter={(val: any, name: string, item: any) => {
                    const p = item?.payload;
                    if (name === "x") return [`${val?.toFixed?.(1)} mph`, `Club${p?.Club ? ` — ${p.Club}` : ""}`];
                    if (name === "y") return [`${val?.toFixed?.(1)} mph`, "Ball"];
                    return [val, name];
                  }}
                />
                <Legend wrapperStyle={{ color: T.text }} />
                <Scatter name="Shots" data={efficiencyData} fill={T.accent} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No speed data available.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Table (compact) ---------- */
  const tableCard = (
    <div key="table" draggable onDragStart={onDragStart("table")} onDragOver={onDragOver("table")} onDrop={onDrop("table")}>
      <Card title="Recent Shots (first 50)" theme={T}>
        {filteredOutliers.length ? (
          <div className="overflow-auto rounded-lg border" style={{ borderColor: T.border }}>
            <table className="w-full text-sm" style={{ color: T.text }}>
              <thead style={{ background: T.panelAlt, color: T.text }}>
                <tr>
                  <th className="text-left px-2 py-1">Time</th>
                  <th className="text-left px-2 py-1">Session</th>
                  <th className="text-left px-2 py-1">Club</th>
                  <th className="text-right px-2 py-1">Carry</th>
                  <th className="text-right px-2 py-1">Ball</th>
                  <th className="text-right px-2 py-1">Club</th>
                  <th className="text-right px-2 py-1">Smash</th>
                  <th className="text-right px-2 py-1">Lateral</th>
                </tr>
              </thead>
              <tbody>
                {filteredOutliers.slice(0, 50).map((s, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td className="px-2 py-1">{s.Timestamp?.slice(0, 19).replace("T", " ")}</td>
                    <td className="px-2 py-1">{s.SessionId}</td>
                    <td className="px-2 py-1">{s.Club}</td>
                    <td className="px-2 py-1 text-right">{isNum(s.CarryDistance_yds) ? s.CarryDistance_yds!.toFixed(1) : ""}</td>
                    <td className="px-2 py-1 text-right">{isNum(s.BallSpeed_mph) ? s.BallSpeed_mph!.toFixed(1) : ""}</td>
                    <td className="px-2 py-1 text-right">{isNum(s.ClubSpeed_mph) ? s.ClubSpeed_mph!.toFixed(1) : ""}</td>
                    <td className="px-2 py-1 text-right">{isNum(s.SmashFactor) ? s.SmashFactor!.toFixed(3) : ""}</td>
                    <td className="px-2 py-1 text-right">{isNum(s.CarryDeviationDistance_yds) ? s.CarryDeviationDistance_yds!.toFixed(1) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>No rows to display.</div>
        )}
      </Card>
    </div>
  );

  /* ---------- Assemble by order ---------- */
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
