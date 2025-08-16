import React from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Scatter, ScatterChart, ZAxis, ReferenceLine, Label
} from "recharts";
import { Theme, colorForClub, alpha } from "./theme";
import { Shot, ClubRow, fmtNum, orderIndex } from "./utils";
import { Card, EmptyChart, Th, Td } from "./components/UI";

type ShapeBucket = { n: number; pct: number };

function classifyShapes(shots: Shot[]) {
  const buckets = { hook: 0, draw: 0, straight: 0, fade: 0, slice: 0 };
  const total = shots.length || 1;
  shots.forEach(s => {
    const axis = (s.SpinAxis_deg ?? 0);
    if (axis <= -6) buckets.hook++;
    else if (axis < -2) buckets.draw++;
    else if (axis <= 2) buckets.straight++;
    else if (axis < 6) buckets.fade++;
    else buckets.slice++;
  });
  const pct = (n: number): ShapeBucket => ({ n, pct: 100 * n / total });
  return {
    hook: pct(buckets.hook),
    draw: pct(buckets.draw),
    straight: pct(buckets.straight),
    fade: pct(buckets.fade),
    slice: pct(buckets.slice),
  };
}

function ShotShapeCard({ theme, shots }: { theme: Theme; shots: Shot[] }) {
  const T = theme;
  if (!shots.length) return <EmptyChart theme={T} />;
  const s = classifyShapes(shots);
  const Box = ({ title, bucket, bg, color }:{ title:string; bucket:ShapeBucket; bg:string; color:string }) => (
    <div className="rounded-2xl px-4 py-5" style={{ background: bg, border: `1px solid ${T.border}` }}>
      <div className="text-2xl font-semibold" style={{ color }}>{bucket.pct.toFixed(1)}%</div>
      <div className="mt-1 text-sm" style={{ color: T.text }}>{title} <span style={{ color: T.textDim }}>({bucket.n})</span></div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Box title="Hook" bucket={s.hook} bg={alpha("#EF4444",0.08)} color="#DC2626" />
      <Box title="Draw" bucket={s.draw} bg={alpha("#10B981",0.10)} color="#059669" />
      <Box title="Straight" bucket={s.straight} bg={alpha(T.brand,0.10)} color={T.brand} />
      <Box title="Fade" bucket={s.fade} bg={alpha("#F59E0B",0.10)} color="#D97706" />
      <Box title="Slice" bucket={s.slice} bg={alpha("#3B82F6",0.10)} color="#2563EB" />
    </div>
  );
}

function RangeDispersion({ theme, shots, clubs }:{ theme: Theme; shots: Shot[]; clubs: string[] }) {
  const T = theme;
  if (!shots.length) return <EmptyChart theme={T} />;
  const lateralDev = (s: Shot): number | undefined => {
    if (s.CarryDeviationDistance_yds !== undefined) return s.CarryDeviationDistance_yds;
    if (s.LaunchDirection_deg !== undefined && s.CarryDistance_yds !== undefined) {
      return (s.CarryDistance_yds as number) * Math.sin(((s.LaunchDirection_deg as number) * Math.PI) / 180);
    }
    return undefined;
  };
  const pts = shots.map(s => {
    const x = s.CarryDistance_yds;
    const y = lateralDev(s);
    return (x == null || y == null) ? null : { x, y, club: s.Club };
  }).filter(Boolean) as {x:number;y:number;club:string}[];

  if (!pts.length) return <EmptyChart theme={T} />;

  const domainX = [Math.floor(Math.min(...pts.map(p=>p.x)))-5, Math.ceil(Math.max(...pts.map(p=>p.x)))+5];
  const domainY = [Math.floor(Math.min(...pts.map(p=>p.y)))-5, Math.ceil(Math.max(...pts.map(p=>p.y)))+5];

  const byClub = new Map<string, {x:number;y:number}[]>();
  pts.forEach(p => { if (!byClub.has(p.club)) byClub.set(p.club, []); byClub.get(p.club)!.push({x:p.x,y:p.y}); });

  const series = clubs.filter(c => byClub.has(c)).map(club => ({
    club,
    data: byClub.get(club)!,
    color: colorForClub(club),
  }));

  return (
    <div>
      <div className="w-full" style={{ height: 320 }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <CartesianGrid stroke={alpha(T.textDim,0.2)} />
            <XAxis type="number" dataKey="x" name="Carry (yd)" domain={domainX} tick={{ fill: T.text }} label={{ value: "Carry (yds)", position: "insideBottom", dy: 10, fill: T.text }} />
            <YAxis type="number" dataKey="y" name="Lateral (yd)" domain={domainY} tick={{ fill: T.text }} label={{ value: "Lateral deviation (yds)", angle: -90, position: "insideLeft", fill: T.text }} />
            {series.map(s => (
              <Scatter key={s.club} data={s.data} name={s.club} fill={alpha(s.color,0.9)} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {/* Legend outside chart */}
      <div className="flex flex-wrap gap-3 mt-3">
        {series.map(s => (
          <div key={s.club} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />
            <span style={{ color: T.text }}>{s.club}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GapChart({ theme, shots, clubs }:{ theme: Theme; shots: Shot[]; clubs: string[] }) {
  const T = theme;
  if (!shots.length) return <EmptyChart theme={T} />;
  // average carry per club
  const byClub = new Map<string, number[]>();
  shots.forEach(s => {
    if (s.Club && s.CarryDistance_yds != null) {
      if (!byClub.has(s.Club)) byClub.set(s.Club, []);
      byClub.get(s.Club)!.push(s.CarryDistance_yds as number);
    }
  });
  let rows = Array.from(byClub.entries()).map(([club, arr]) => ({
    club,
    avg: arr.reduce((a,b)=>a+b,0)/arr.length
  }));
  // order LW -> ... -> Driver
  rows.sort((a,b)=> orderIndex(b.club) - orderIndex(a.club));

  return (
    <div style={{ height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 10, right: 10, bottom: 30, left: 10 }}>
          <CartesianGrid stroke={alpha(T.textDim,0.2)} />
          <XAxis dataKey="club" tick={{ fill: T.text }} angle={-30} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: T.text }} label={{ value: "Avg Carry (yds)", angle: -90, position: "insideLeft", fill: T.text }} />
          <Tooltip />
          <Bar dataKey="avg" fill={alpha(T.brand,0.9)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EfficiencyChart({ theme, shots }:{ theme: Theme; shots: Shot[] }) {
  const T = theme;
  if (!shots.length) return <EmptyChart theme={T} />;
  const points = shots.map(s => {
    if (s.ClubSpeed_mph != null && s.BallSpeed_mph != null) {
      return { x: s.ClubSpeed_mph as number, y: s.BallSpeed_mph as number, club: s.Club };
    }
    return null;
  }).filter(Boolean) as {x:number;y:number;club:string}[];

  if (!points.length) return <EmptyChart theme={T} />;

  const xs = points.map(p=>p.x);
  const ys = points.map(p=>p.y);
  const xmin = Math.floor(Math.min(...xs))-2, xmax = Math.ceil(Math.max(...xs))+2;
  const smashAvg = ys.reduce((a,b)=>a+b,0)/xs.reduce((a,b)=>a+b,0); // ≈ average smash

  const seg = [{ x: xmin, y: smashAvg * xmin }, { x: xmax, y: smashAvg * xmax }];

  return (
    <div style={{ height: 320 }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
          <CartesianGrid stroke={alpha(T.textDim,0.2)} />
          <XAxis type="number" dataKey="x" name="Club Speed" tick={{ fill: T.text }} label={{ value: "Club Speed (mph)", position: "insideBottom", dy: 10, fill: T.text }} />
          <YAxis type="number" dataKey="y" name="Ball Speed" tick={{ fill: T.text }} label={{ value: "Ball Speed (mph)", angle: -90, position: "insideLeft", fill: T.text }} />
          <Tooltip />
          <Scatter data={points} fill={alpha(T.brand,0.9)} />
          <ReferenceLine segment={seg} ifOverflow="extendDomain" stroke={T.brand} strokeDasharray="6 4">
            <Label position="right" value={`Smash ~ ${smashAvg.toFixed(3)}`} fill={T.text} />
          </ReferenceLine>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function AveragesTable({ theme, rows }:{ theme: Theme; rows: ClubRow[] }) {
  const T = theme;
  if (!rows.length) return <EmptyChart theme={T} />;
  return (
    <div className="overflow-auto">
      <table className="min-w-full">
        <thead>
          <tr>
            <Th theme={T}>Club</Th>
            <Th theme={T}>Shots</Th>
            <Th theme={T}>Avg Carry</Th>
            <Th theme={T}>Avg Total</Th>
            <Th theme={T}>Smash</Th>
            <Th theme={T}>Spin</Th>
            <Th theme={T}>Club Spd</Th>
            <Th theme={T}>Ball Spd</Th>
            <Th theme={T}>Launch</Th>
            <Th theme={T}>F2P</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r=>(
            <tr key={r.club}>
              <Td>{r.club}</Td>
              <Td>{r.count}</Td>
              <Td>{fmtNum(r.avgCarry,1)}</Td>
              <Td>{fmtNum(r.avgTotal,1)}</Td>
              <Td>{fmtNum(r.avgSmash,3)}</Td>
              <Td>{fmtNum(r.avgSpin,0)}</Td>
              <Td>{fmtNum(r.avgCS,1)}</Td>
              <Td>{fmtNum(r.avgBS,1)}</Td>
              <Td>{fmtNum(r.avgLA,1)}</Td>
              <Td>{fmtNum(r.avgF2P,2)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Props = {
  theme: Theme;
  cardOrder: string[];
  setCardOrder: (v: string[]) => void;
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
  hasData: boolean;
  kpis: any;
  filteredOutliers: Shot[];
  filtered: Shot[];
  shots: Shot[];
  tableRows: ClubRow[];
  clubs: string[];
};

export default function DashboardCards(props: Props) {
  const { theme: T, cardOrder, onDragStart, onDragOver, onDrop,
    filteredOutliers, tableRows, clubs } = props;

  // Cards map — launchspin removed. Unknown keys are ignored.
  const CARDS: Record<string, { title: string; render: () => React.ReactNode }> = {
    kpis: { title: "KPIs", render: () => {
      const pool = filteredOutliers;
      if (!pool.length) return <EmptyChart theme={T} />;
      const avg = (arr:number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
      const vals = {
        carry: avg(pool.map(s=>s.CarryDistance_yds!).filter(v=>v!=null as any)),
        total: avg(pool.map(s=>s.TotalDistance_yds!).filter(v=>v!=null as any)),
        smash: avg(pool.map(s=>s.SmashFactor!).filter(v=>v!=null as any)),
        spin:  avg(pool.map(s=>s.SpinRate_rpm!).filter(v=>v!=null as any)),
        cs:    avg(pool.map(s=>s.ClubSpeed_mph!).filter(v=>v!=null as any)),
        bs:    avg(pool.map(s=>s.BallSpeed_mph!).filter(v=>v!=null as any)),
      };
      return (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div><div className="text-xs" style={{color:T.textDim}}>Avg Carry</div><div className="text-lg font-semibold">{fmtNum(vals.carry,1)} yds</div></div>
          <div><div className="text-xs" style={{color:T.textDim}}>Avg Total</div><div className="text-lg font-semibold">{fmtNum(vals.total,1)} yds</div></div>
          <div><div className="text-xs" style={{color:T.textDim}}>Avg Smash</div><div className="text-lg font-semibold">{fmtNum(vals.smash,3)}</div></div>
          <div><div className="text-xs" style={{color:T.textDim}}>Avg Spin</div><div className="text-lg font-semibold">{fmtNum(vals.spin,0)} rpm</div></div>
          <div><div className="text-xs" style={{color:T.textDim}}>Club Speed</div><div className="text-lg font-semibold">{fmtNum(vals.cs,1)} mph</div></div>
          <div><div className="text-xs" style={{color:T.textDim}}>Ball Speed</div><div className="text-lg font-semibold">{fmtNum(vals.bs,1)} mph</div></div>
        </div>
      );
    }},
    shape: { title: "Shot Shape Distribution", render: () =>
      <ShotShapeCard theme={T} shots={filteredOutliers} />
    },
    dispersion: { title: "Range Dispersion (Carry vs Lateral)", render: () =>
      <RangeDispersion theme={T} shots={filteredOutliers} clubs={clubs} />
    },
    gap: { title: "Gapping (Avg Carry by Club)", render: () =>
      <GapChart theme={T} shots={filteredOutliers} clubs={clubs} />
    },
    eff: { title: "Efficiency (Ball vs Club Speed) + Smash Trend", render: () =>
      <EfficiencyChart theme={T} shots={filteredOutliers} />
    },
    table: { title: "Club Averages", render: () =>
      <AveragesTable theme={T} rows={tableRows} />
    },
  };

  const keys = cardOrder.filter(k => CARDS[k]);

  return (
    <div className="grid grid-cols-1 gap-8">
      {keys.map((key) => {
        const card = CARDS[key];
        return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)} style={{ cursor: "grab" }}>
            <Card theme={T} title={card.title} dragHandle>{card.render()}</Card>
          </div>
        );
      })}
    </div>
  );
}
