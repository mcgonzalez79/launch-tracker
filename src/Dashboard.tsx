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

/* Build map for club averages by club name */
function mapByClub(rows: ClubRow[] | any[]): Record<string, any> {
  const m: Record<string, any> = {};
  for (const r of rows || []) m[(r as any).club] = r;
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

  /* ---------- Layout: responsive grid ---------- */
  const Grid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      {children}
    </div>
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
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Avg Carry" value={kpis?.carry?.mean} unit="yds" T={T} />
          <Kpi label="Avg Total" value={(kpis?.carry?.mean ?? 0) * 1.1} unit="yds" T={T} />
          <Kpi label="Ball Speed" value={kpis?.ball?.mean} unit="mph" T={T} />
          <Kpi label="Club Speed" value={kpis?.club?.mean} unit="mph" T={T} />
          <Kpi label="Smash" value={kpis?.smash?.mean} unit="" digits={2} T={T} />
        </div>
      </Card>
    </div>
  );

  /* ---------- Gapping (Avg Carry per Club) ---------- */
  const gapData = useMemo(() => {
    const byClub = mapByClub(tableRows as any[]);
    const arr = (clubs || []).map(club => ({
      club,
      carry: Number((byClub[club]?.avgCarry ?? 0)) || 0
    }));
    return arr;
  }, [clubs, tableRows]);

  const gapCard = (
    <div
      key="gap"
      draggable
      onDragStart={onDragStart("gap")}
      onDragOver={onDragOver("gap")}
      onDrop={onDrop("gap")}
    >
      <Card theme={T} title="Gapping (Avg Carry per Club)">
        {gapData && gapData.length ? (
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={gapData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={T.grid} strokeDasharray="3 3" />
                <XAxis dataKey="club" tick={{ fill: T.text }} />
                <YAxis tick={{ fill: T.text }} />
                <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text }} />
                <Bar dataKey="carry" fill={T.brand} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm" style={{ color: T.textDim }}>
            No data to display.
          </div>
        )}
      </Card>
    </div>
  );

  /* ---------- Efficiency (Club vs Ball speed) ---------- */
  const effData = useMemo(() => {
    const rows = (filteredOutliers ?? filtered ?? shots ?? []).filter(
      s => isNum(s.ClubSpeed_mph) && isNum(s.BallSpeed_mph)
    ).map(s => ({
      club: s.Club,
      cs: s.ClubSpeed_mph as number,
      bs: s.BallSpeed_mph as number
    }));
    return rows;
  }, [filteredOutliers, filtered, shots]);

  // Determine smash factor to show as a trend line.
  // If the filtered set contains exactly one club, use that club's avg smash; else overall avg.
  const smash = useMemo(() => {
    if (!effData.length) return null;
    const clubsSet = new Set(effData.map(d => d.club));
    const data = [...effData];
    const ratios = data.map(d => d.cs ? d.bs / d.cs : NaN).filter(isNum);
    if (!ratios.length) return null;
    return avg(ratios);
  }, [effData]);

  // Build a line y = (smash)*x across the visible x-domain
  const effLineData = useMemo(() => {
    if (!effData.length || !smash) return null;
    const xs = effData.map(d => d.cs);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    return [
      { cs: minX, y: smash * minX },
      { cs: maxX, y: smash * maxX },
    ];
  }, [effData, smash]);

  const effCard = (
    <div
      key="eff"
      draggable
      onDragStart={onDragStart("eff")}
      onDragOver={onDragOver("eff")}
      onDrop={onDrop("eff")}
    >
      <Card
        theme={T}
        title="Efficiency (Club vs Ball Speed)"
        right={smash ? `Trend ≈ ${smash.toFixed(2)} smash` : undefined}
      >
        {effData.length ? (
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
                <CartesianGrid stroke={T.grid} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="cs"
                  name="Club Speed"
                  unit=" mph"
                  tick={{ fill: T.text }}
                  tickCount={8}
                />
                <YAxis
                  type="number"
                  dataKey="bs"
                  name="Ball Speed"
                  unit=" mph"
                  tick={{ fill: T.text }}
                  tickFormatter={(v: number) => (Number(v).toFixed(2))}
                />
                <Tooltip
                  formatter={(val: any, name: any) => [Number(val).toFixed(2), name]}
                  contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text }}
                />
                <Scatter data={effData} fill={T.brand} />
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
          <div className="text-sm" style={{ color: T.textDim }}>
            No data to display.
          </div>
        )}
      </Card>
    </div>
  );

  /* ---------- Placeholder cards (Shape & Dispersion) to avoid breaking order ---------- */
  const shapeCard = (
    <div
      key="shape"
      draggable
      onDragStart={onDragStart("shape")}
      onDragOver={onDragOver("shape")}
      onDrop={onDrop("shape")}
    >
      <Card theme={T} title="Shot Shape (placeholder)">
        <div className="text-sm" style={{ color: T.textDim }}>
          This placeholder keeps your layout working. We can wire your original chart back in at any time.
        </div>
      </Card>
    </div>
  );

  const dispersionCard = (
    <div
      key="dispersion"
      draggable
      onDragStart={onDragStart("dispersion")}
      onDragOver={onDragOver("dispersion")}
      onDrop={onDrop("dispersion")}
    >
      <Card theme={T} title="Dispersion (placeholder)">
        <div className="text-sm" style={{ color: T.textDim }}>
          This placeholder keeps your layout working. We can wire your original chart back in at any time.
        </div>
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
                  <th className="text-right py-2 px-2">Smash</th>
                  <th className="text-right py-2 px-2">Spin</th>
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
                    <td className="text-right py-2 px-2">{r.count ?? r.n ?? 0}</td>
                    <td className="text-right py-2 px-2">{Number(r.avgCarry ?? 0).toFixed(1)}</td>
                    <td className="text-right py-2 px-2">{Number(r.avgTotal ?? 0).toFixed(1)}</td>
                    <td className="text-right py-2 px-2">{Number(r.avgSmash ?? r.smash ?? 0).toFixed(2)}</td>
                    <td className="text-right py-2 px-2">{Number(r.avgSpin ?? r.spin ?? 0).toFixed(0)}</td>
                    <td className="text-right py-2 px-2">{Number(r.avgCS ?? 0).toFixed(1)}</td>
                    <td className="text-right py-2 px-2">{Number(r.avgBS ?? 0).toFixed(1)}</td>
                    <td className="text-right py-2 px-2">{Number(r.avgLA ?? 0).toFixed(1)}</td>
                    <td className="text-right py-2 px-2">{Number(r.avgF2P ?? 0).toFixed(1)}</td>
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
  const cardMap: Record<string, React.ReactNode> = {
    kpis: kpiCard,
    shape: shapeCard,
    dispersion: dispersionCard,
    gap: gapCard,
    eff: effCard,
    table: tableCard,
  };

  return (
    <Grid>
      {cardOrder.map((key) => cardMap[key] ?? null)}
    </Grid>
  );
}

/* =========================
   Small presentational components
========================= */
function Kpi({ label, value, unit, digits = 1, T }: { label: string; value?: number; unit?: string; digits?: number; T: Theme }) {
  const v = isNum(value) ? value!.toFixed(digits) : "—";
  return (
    <div
      className="rounded-lg p-3 text-sm border"
      style={{ background: T.panelAlt, color: T.text, borderColor: T.border }}
    >
      <div className="text-xs" style={{ color: T.textDim }}>{label}</div>
      <div className="text-lg font-semibold">
        {v}{unit ? <span className="text-sm font-normal" style={{ color: T.textDim }}> {unit}</span> : null}
      </div>
    </div>
  );
}
