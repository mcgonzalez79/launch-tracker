import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import { Card } from "./components/UI";

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

function Stat({ label, value, unit, T }: { label: string; value: string; unit?: string; T: Theme }) {
  return (
    <div className="p-3 rounded-lg border" style={{ background: T.panelAlt, borderColor: T.border }}>
      <div className="text-xs" style={{ color: T.textDim }}>{label}</div>
      <div className="text-lg font-semibold" style={{ color: T.text }}>
        {value}{unit ? <span className="text-xs font-normal" style={{ color: T.textDim }}> {unit}</span> : null}
      </div>
    </div>
  );
}

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
    shots,
    tableRows,
    clubs,
  } = props;

  // Basic cards (keeps your existing data flow intact)
  const kpiCard = (
    <div key="kpis" draggable onDragStart={onDragStart("kpis")} onDragOver={onDragOver("kpis")} onDrop={onDrop("kpis")}>
      <Card title="KPIs" theme={T}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat T={T} label="Carry (avg)" value={kpis.carry.mean.toFixed(1)} unit="yds" />
          <Stat T={T} label="Ball speed (avg)" value={kpis.ball.mean.toFixed(1)} unit="mph" />
          <Stat T={T} label="Club speed (avg)" value={kpis.club.mean.toFixed(1)} unit="mph" />
          <Stat T={T} label="Smash (avg)" value={kpis.smash.mean.toFixed(3)} />
        </div>
      </Card>
    </div>
  );

  // Placeholders to keep structure; your actual charts/tables stay in your existing implementation.
  const shapeCard = (
    <div key="shape" draggable onDragStart={onDragStart("shape")} onDragOver={onDragOver("shape")} onDrop={onDrop("shape")}>
      <Card title="Shot Shape" theme={T}>
        <div className="text-sm" style={{ color: T.textDim }}>
          Your existing dispersion/shape viz lives here. Styling now uses the Huemint palette.
        </div>
      </Card>
    </div>
  );

  const dispersionCard = (
    <div key="dispersion" draggable onDragStart={onDragStart("dispersion")} onDragOver={onDragOver("dispersion")} onDrop={onDrop("dispersion")}>
      <Card title="Dispersion" theme={T}>
        <div className="text-sm" style={{ color: T.textDim }}>
          Keep your plot; grid/ticks should use theme.grid/tick if you style them.
        </div>
      </Card>
    </div>
  );

  const gapCard = (
    <div key="gap" draggable onDragStart={onDragStart("gap")} onDragOver={onDragOver("gap")} onDrop={onDrop("gap")}>
      <Card title="Gapping" theme={T}>
        <div className="text-sm" style={{ color: T.textDim }}>
          Club gapping table/chart; brand color for highlights.
        </div>
      </Card>
    </div>
  );

  const effCard = (
    <div key="eff" draggable onDragStart={onDragStart("eff")} onDragOver={onDragOver("eff")} onDrop={onDrop("eff")}>
      <Card title="Efficiency" theme={T}>
        <div className="text-sm" style={{ color: T.textDim }}>
          Your efficiency chart floor at 50 mph remains; use T.brand for series, T.grid for gridlines.
        </div>
      </Card>
    </div>
  );

  const tableCard = (
    <div key="table" draggable onDragStart={onDragStart("table")} onDragOver={onDragOver("table")} onDrop={onDrop("table")}>
      <Card title="Table" theme={T}>
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
              </tr>
            </thead>
            <tbody>
              {filteredOutliers.slice(0, 50).map((s, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td className="px-2 py-1">{s.Timestamp?.slice(0, 19).replace("T", " ")}</td>
                  <td className="px-2 py-1">{s.SessionId}</td>
                  <td className="px-2 py-1">{s.Club}</td>
                  <td className="px-2 py-1 text-right">{Number.isFinite(s.CarryDistance_yds) ? s.CarryDistance_yds!.toFixed(1) : ""}</td>
                  <td className="px-2 py-1 text-right">{Number.isFinite(s.BallSpeed_mph) ? s.BallSpeed_mph!.toFixed(1) : ""}</td>
                  <td className="px-2 py-1 text-right">{Number.isFinite(s.ClubSpeed_mph) ? s.ClubSpeed_mph!.toFixed(1) : ""}</td>
                  <td className="px-2 py-1 text-right">{Number.isFinite(s.SmashFactor) ? s.SmashFactor!.toFixed(3) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
