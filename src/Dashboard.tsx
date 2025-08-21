import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import { Card } from "./components/UI";
import {
  ResponsiveContainer,
  ScatterChart, Scatter,
  BarChart, Bar,
  Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
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
  onDrop: (_key: string) => (_: React.DragEvent) => void;

  hasData: boolean;
  kpis: KPIs;

  filteredOutliers: Shot[];
  filtered: Shot[];
  shots: Shot[];

  tableRows: ClubRow[];
  clubs: string[]; // may be temporarily undefined from parent – guard below
};

/* =========================
   Small helpers
========================= */
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function average(nums: number[]): number {
  const xs = nums.filter(isNum) as number[];
  return xs.length ? xs.reduce((a,b)=>a+b,0) / xs.length : 0;
}

/* =========================
   Component
========================= */
export default function DashboardCards(props: Props) {
  const {
    theme: T,
    cardOrder, setCardOrder,
    onDragStart, onDragOver, onDrop,
    hasData, kpis,
    filteredOutliers, filtered, shots, tableRows, clubs,
  } = props;

  const CLUB_PALETTE = [
    "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
    "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ab",
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"
  ];

  // SAFETY: guard clubs with ?? [] so we never call forEach on undefined
  const clubColor = useMemo(() => {
    const m = new Map<string, string>();
    (clubs ?? []).forEach((c, i) => m.set(c, CLUB_PALETTE[i % CLUB_PALETTE.length]));
    return m;
  }, [clubs]);

  /* ---------- KPIs ---------- */
  const avgTotalDistance = useMemo(() => {
    const xs = filteredOutliers.map(s => s.TotalDistance_yds).filter(isNum) as number[];
    return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
  }, [filteredOutliers]);

  const kpiCard = (
    <div key="kpis" draggable onDragStart={onDragStart("kpis")} onDragOver={onDragOver("kpis")} onDrop={onDrop("kpis")}>
      <Card title="Key Metrics" theme={T}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg p-3 border" style={{ background: T.panel, borderColor: T.border }}>
            <div className="text-xs" style={{ color: T.textDim }}>Avg Carry</div>
            <div className="text-2xl font-semibold">{kpis.carry.mean.toFixed(1)} yds</div>
            <div className="text-xs" style={{ color: T.textDim }}>
              n={kpis.carry.n}, σ={kpis.carry.std.toFixed(1)}
            </div>
          </div>
          <div className="rounded-lg p-3 border" style={{ background: T.panel, borderColor: T.border }}>
            <div className="text-xs" style={{ color: T.textDim }}>Avg Total</div>
            <div className="text-2xl font-semibold">{avgTotalDistance.toFixed(1)} yds</div>
          </div>
          <div className="rounded-lg p-3 border" style={{ background: T.panel, borderColor: T.border }}>
            <div className="text-xs" style={{ color: T.textDim }}>Avg Ball Speed</div>
            <div className="text-2xl font-semibold">{kpis.ball.mean.toFixed(1)} mph</div>
          </div>
          <div className="rounded-lg p-3 border" style={{ background: T.panel, borderColor: T.border }}>
            <div className="text-xs" style={{ color: T.textDim }}>Avg Smash</div>
            <div className="text-2xl font-semibold">{kpis.smash.mean.toFixed(3)}</div>
          </div>
        </div>
      </Card>
    </div>
  );

  /* ---------- Shot Shape ---------- */
  const shapeCard = (
    <div key="shape" draggable onDragStart={onDragStart("shape")} onDragOver={onDragOver("shape")} onDrop={onDrop("shape")}>
      <Card title="Shot Shape Distribution" theme={T}>
        <div className="text-sm" style={{ color: T.textDim }}>Coming soon</div>
      </Card>
    </div>
  );

  /* ---------- Dispersion ---------- */
  const dispersionCard = (
    <div key="dispersion" draggable onDragStart={onDragStart("dispersion")} onDragOver={onDragOver("dispersion")} onDrop={onDrop("dispersion")}>
      <Card title="Dispersion" theme={T}>
        <div className="text-sm" style={{ color: T.textDim }}>Coming soon</div>
      </Card>
    </div>
  );

  /* ---------- Gapping (Avg Carry per Club) ---------- */
  const gapCard = (
    <div key="gap" draggable onDragStart={onDragStart("gap")} onDragOver={onDragOver("gap")} onDrop={onDrop("gap")}>
    <Card title="Gapping (Avg Carry per Club)" theme={T}>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart
              data={(clubs ?? []).map((c) => {
                const arr = filteredOutliers.filter(s => s.Club === c);
                const avgCarry = average(arr.map(s => s.CarryDistance_yds ?? NaN));
                const avgRoll = average(arr.map(s => (s.TotalDistance_yds ?? NaN) - (s.CarryDistance_yds ?? NaN)));
                const avgTotal = isNum(avgCarry) && isNum(avgRoll) ? avgCarry + avgRoll : NaN;
                return { club: c, carry: avgCarry, roll: avgRoll, total: avgTotal };
              })}
              margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
            >
              <CartesianGrid stroke={T.border} />
              <XAxis dataKey="club" stroke={T.text} />
              <YAxis stroke={T.text} />
              <Tooltip />
              <Legend />
              <Bar dataKey="carry" name="Avg Carry" fill={T.brand} />
              <Bar dataKey="roll"  name="Avg Roll"  fill={T.brand} fillOpacity={0.45} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );

  /* ---------- Efficiency (placeholder while trend is refined) ---------- */
  const efficiencyCard = (
    <div key="eff" draggable onDragStart={onDragStart("eff")} onDragOver={onDragOver("eff")} onDrop={onDrop("eff")}>
      <Card title="Efficiency (Club vs Ball Speed, Smash trend)" theme={T}>
        <div className="text-sm" style={{ color: T.textDim }}>Coming soon</div>
      </Card>
    </div>
  );

  /* ---------- Club Averages (spreadsheet) ---------- */
  const tableCard = (
    <div key="table" draggable onDragStart={onDragStart("table")} onDragOver={onDragOver("table")} onDrop={onDrop("table")}>
      <Card title="Club Averages" theme={T}>
        {tableRows.length ? (
          <div id="print-club-averages" style={{ overflowX: "auto" }}>
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ color: T.textDim }}>
                  <th className="text-left py-2 pr-3">Club</th>
                  <th className="text-right py-2 px-2">#</th>
                  <th className="text-right py-2 px-2">Avg Carry</th>
                  <th className="text-right py-2 px-2">Avg Total</th>
                  <th className="text-right py-2 px-2">Avg Smash</th>
                  <th className="text-right py-2 px-2">Avg Spin</th>
                  <th className="text-right py-2 px-2">Avg CS</th>
                  <th className="text-right py-2 px-2">Avg BS</th>
                  <th className="text-right py-2 px-2">Avg LA</th>
                  <th className="text-right py-2 px-2">Avg F2P</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr key={(r as any).club} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td className="py-2 pr-3">{(r as any).club}</td>
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

  const cardMap: Record<string, JSX.Element> = {
    kpis: kpiCard,
    shape: shapeCard,
    dispersion: dispersionCard,
    gap: gapCard,
    eff: efficiencyCard,
    table: tableCard,
  };

  return (
    <div className="grid gap-4">
      {cardOrder.map((key) => cardMap[key] ?? null)}
    </div>
  );
}
