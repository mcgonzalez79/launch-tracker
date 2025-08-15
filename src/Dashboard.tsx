import React from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Scatter, ScatterChart, ZAxis, ReferenceLine, Label   // ← add Label
} from "recharts";
import { Theme, clubPalette, colorForClub, CARRY_BAR, TOTAL_BAR, alpha } from "./theme";
import { Shot, ClubRow, fmtNum } from "./utils";
import { Card, KPI, EmptyChart, Th, Td } from "./components/UI";

/* Shot shape distribution (boxes) */
function ShotShape({ theme, draw, straight, fade }:{ theme: Theme; draw:{n:number;pct:number}; straight:{n:number;pct:number}; fade:{n:number;pct:number} }) {
  const T = theme;
  const Box = ({ title, pct, n, bg, color }:{ title:string; pct:number; n:number; bg:string; color:string }) => (
    <div className="rounded-2xl px-6 py-6" style={{ background: bg, border: `1px solid ${T.border}` }}>
      <div className="text-2xl font-semibold" style={{ color }}>{pct.toFixed(1)}%</div>
      <div className="mt-1 text-sm" style={{ color: T.text }}>{title}</div>
      <div className="text-xs" style={{ color: T.textDim }}>{n} shots</div>
    </div>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Box title="Draw" pct={draw.pct} n={draw.n} bg={T.blueSoft} color="#4EA3FF" />
      <Box title="Straight" pct={straight.pct} n={straight.n} bg={T.greenSoft} color={T.brand} />
      <Box title="Fade" pct={fade.pct} n={fade.n} bg={T.orangeSoft} color="#F59E0B" />
    </div>
  );
}

/* Range Dispersion SVG (kept identical behavior) */
function RangeDispersion({ theme, shots, clubs }:{ theme: Theme; shots: Shot[]; clubs: string[]; }) {
  const T = theme;
  const lateralDev = (s: Shot): number | undefined => {
    if (s.CarryDeviationDistance_yds !== undefined) return s.CarryDeviationDistance_yds;
    if (s.LaunchDirection_deg !== undefined && s.CarryDistance_yds !== undefined) return s.CarryDistance_yds * Math.sin((s.LaunchDirection_deg * Math.PI) / 180);
    return undefined;
  };
  const pts = shots.map((s) => ({ club: s.Club, x: lateralDev(s), y: s.CarryDistance_yds })).filter((p) => p.x !== undefined && p.y !== undefined) as { club: string; x: number; y: number }[];
  const YMIN = 50;
  const yMaxData = pts.length ? Math.max(...pts.map((p) => p.y)) : 150;
  const nice = (v: number, step: number) => Math.ceil((v + step * 0.1) / step) * step;
  const YMAX = Math.max(100, nice(Math.max(YMIN, yMaxData), 25));
  const xMaxData = pts.length ? Math.max(...pts.map((p) => Math.abs(p.x))) : 25;
  const XMAX = Math.max(25, nice(xMaxData, 5));
  const LEGEND_W = 170;
  const W = 900, H = 420, PAD_T = 46, PAD_R = 40, PAD_B = 40, PAD_L = 40 + LEGEND_W;
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
  const xScale = (x: number) => PAD_L + ((x + XMAX) / (2 * XMAX)) * innerW;
  const yScale = (y: number) => { const clamped = Math.max(YMIN, Math.min(YMAX, y)); return H - PAD_B - ((clamped - YMIN) / (YMAX - YMIN)) * innerH; };
  const byClub = new Map<string, { x: number; y: number }[]>(); pts.forEach((p) => { if (!byClub.has(p.club)) byClub.set(p.club, []); byClub.get(p.club)!.push({ x: p.x, y: p.y }); });
  const distTicks: number[] = []; for (let d = 50; d <= YMAX; d += 50) distTicks.push(d);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ background: T.brandSoft, borderRadius: 12, border: `1px solid ${T.border}` }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <rect key={i} x={PAD_L} y={PAD_T + (innerH / 12) * i} width={innerW} height={innerH / 12} fill={i % 2 === 0 ? T.gridStripeA : T.gridStripeB} opacity={0.9} />
      ))}
      <line x1={xScale(0)} y1={PAD_T - 6} x2={xScale(0)} y2={H - PAD_B + 6} stroke={T.brand} strokeDasharray="6 6" strokeWidth={2} />
      <text x={xScale(0) + 10} y={PAD_T - 12} fontSize={12} fill={T.textDim}>Target line</text>
      {distTicks.map((d, idx) => (
        <g key={d}>
          <line x1={PAD_L} x2={W - PAD_R} y1={yScale(d)} y2={yScale(d)} stroke={T.border} strokeDasharray="4 8" />
          <Flag theme={T} x={xScale(0)} y={yScale(d)} color={alpha("#1F77B4", 0.8)} label={`${d}y`} />
        </g>
      ))}
      {[...byClub.keys()].map((club) => {
        const color = clubPalette[clubs.findIndex(c=>c.toLowerCase()===club.toLowerCase()) % clubPalette.length];
        const ptsC = byClub.get(club)!;
        return <g key={club}>{ptsC.map((p, i) => <circle key={i} cx={xScale(p.x)} cy={yScale(p.y)} r={4} fill={color} stroke={T.white} strokeWidth={1} opacity={0.95} />)}</g>;
      })}
      <g transform={`translate(10, ${PAD_T - 30})`}>
        <rect x={0} y={0} width={150} height={Math.min(innerH, clubs.length * 22) + 16} rx={8} ry={8} fill={T.white} opacity={0.92} stroke={T.border} />
        <text x={10} y={16} fontSize={12} fill={T.textDim}>Clubs</text>
        {clubs.map((c, i) => (
          <g key={c} transform={`translate(10, ${i * 22 + 28})`}>
            <rect width="10" height="10" fill={clubPalette[i % clubPalette.length]} rx="2" ry="2" />
            <text x={14} y={9} fontSize="12" fill={T.textDim}>{c}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
function Flag({ theme, x, y, color, label }:{ theme: Theme; x: number; y: number; color: string; label: string }) {
  const T = theme; const poleH = 22, flagW = 16, flagH = 10;
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - poleH} stroke={T.textDim} strokeWidth={2} />
      <polygon points={`${x},${y - poleH} ${x + flagW},${y - poleH + flagH / 2} ${x},${y - poleH + flagH}`} fill={color} stroke={T.text} strokeWidth={0.5} />
      <text x={x + flagW + 6} y={y - poleH + flagH / 1.2} fontSize={11} fill={T.text}>{label}</text>
    </g>
  );
}

export default function DashboardCards(props: {
  theme: Theme; cardOrder: string[]; setCardOrder: (v: string[]) => void;
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
  hasData: boolean; kpis: any; filteredOutliers: Shot[]; filtered: Shot[]; shots: Shot[];
  tableRows: ClubRow[]; clubs: string[];
}) {
  const { theme: T, cardOrder, onDragStart, onDragOver, onDrop, hasData, kpis, filteredOutliers, filtered, shots, tableRows, clubs } = props;

  const CARDS: Record<string, { title: string; render: () => JSX.Element }> = {
    kpis: { title: "Key Metrics", render: () => (
      <>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KPI theme={T} label="Avg Carry" value={fmtNum(kpis.avgCarry, 1, " yds")} color={T.brand} />
          <KPI theme={T} label="Avg Total" value={fmtNum(kpis.avgTotal, 1, " yds")} color={T.brand} />
          <KPI theme={T} label="Avg Smash" value={fmtNum(kpis.avgSmash, 3, "")} color={T.brand} />
          <KPI theme={T} label="Avg Spin" value={fmtNum(kpis.avgSpin, 0, " rpm")} color={T.brand} />
          <KPI theme={T} label="Avg Club Spd" value={fmtNum(kpis.avgCS, 1, " mph")} color={T.brand} />
          <KPI theme={T} label="Avg Ball Spd" value={fmtNum(kpis.avgBS, 1, " mph")} color={T.brand} />
        </div>
        <div className="text-xs mt-2" style={{ color: T.textDim }}>
          Using <b>{filteredOutliers.length}</b> shots after filters (of {filtered.length} filtered, {shots.length} imported).
        </div>
      </>
    )},
    shape: { title: "Shot Shape Distribution", render: () => (!hasData ? <EmptyChart theme={T} /> : <ShotShape theme={T} draw={kpis.shape.draw} straight={kpis.shape.straight} fade={kpis.shape.fade} />) },
    
    dispersion: { title: "Dispersion — Driving Range View (50y to max)", render: () => (!hasData ? <EmptyChart theme={T} /> : 
<div style={{ width: "100%", height: 360 }}>
  <ResponsiveContainer>
    <ScatterChart margin={{ top: 44, right: 16, bottom: 30, left: 56 }}>
      {/* Legend ABOVE the plot; height reserves space so nothing overlaps */}
      <Legend
        layout="horizontal"
        verticalAlign="top"
        align="center"
        iconType="circle"
        height={36}                     // reserve space for the legend row
        wrapperStyle={{ paddingBottom: 4 }}
      />

      <CartesianGrid strokeDasharray="3 3" />

      <XAxis
        type="number"
        dataKey="CarryDeviationDistance_yds"
        name="Carry Deviation"
        unit=" yds"
        tickMargin={10}
      >
        <Label value="Deviation Left (–) / Right (+) [yds]" position="insideBottom" offset={-10} />
      </XAxis>

      <YAxis
        type="number"
        dataKey="CarryDistance_yds"
        name="Carry Distance"
        unit=" yds"
        tickMargin={10}
      >
        <Label value="Carry (yds)" angle={-90} position="insideLeft" offset={-10} />
      </YAxis>

      {/* Centerline */}
      <ReferenceLine x={0} stroke={theme.muted} />

      {/* Optional: 50-yd “targets” or flags you already render can stay;
          the reserved legend height + top margin keeps them from overlapping */}

      <Tooltip formatter={(v: any, n: any) => [v, n]} />

      {clubs.map((c, i) => (
        <Scatter
          key={c}
          name={c}
          data={filteredOutliers.filter(s => s.Club === c)}
          fill={clubPalette[i % clubPalette.length]}
        />
      ))}
    </ScatterChart>
  </ResponsiveContainer>
</div>
                                                                                       
                                                                                       
                                                                                       ) 
                
                
                
                
                },
    
    
    
    
    gap: { title: "Gap Chart — Carry vs Total by Club", render: () => (!hasData ? <EmptyChart theme={T} /> : (
      <div style={{ width:"100%", height:340 }}>
        <ResponsiveContainer>
          <BarChart data={tableRows}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="club" stroke={T.textDim} />
            <YAxis stroke={T.textDim} />
            <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text }} />
            <Legend wrapperStyle={{ color: T.text }} />
            <Bar dataKey="avgCarry" name="Carry (avg)" fill={CARRY_BAR} />
            <Bar dataKey="avgTotal" name="Total (avg)" fill={TOTAL_BAR} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    ))},

    
    eff: { title: "Efficiency — Club Speed vs Ball Speed", render: () => (!hasData ? <EmptyChart theme={T} /> : (
     <div style={{ width: "100%", height: 360 }}>
  <ResponsiveContainer>
    <ScatterChart margin={{ top: 8, right: 16, bottom: 48, left: 64 }}>
      <CartesianGrid />
      <XAxis
        type="number"
        dataKey="ClubSpeed_mph"
        name="Club Speed"
        unit=" mph"
        domain={[50, 'dataMax + 5']}   // start at 50 mph
        tickMargin={10}
      >
        <Label value="Club Speed (mph)" position="insideBottom" offset={-10} />
      </XAxis>
      <YAxis
        type="number"
        dataKey="BallSpeed_mph"
        name="Ball Speed"
        unit=" mph"
        tickMargin={10}
      >
        <Label value="Ball Speed (mph)" angle={-90} position="insideLeft" offset={-10} />
      </YAxis>

      <Tooltip formatter={(v: any, n: any) => [v, n]} />

      {/* Legend sits above plot with reserved height so it can't overlap */}
      <Legend
        layout="horizontal"
        verticalAlign="top"
        align="center"
        iconType="circle"
        height={40}                     // reserves vertical space
        wrapperStyle={{ paddingBottom: 4 }}
      />

      {clubs.map((c, i) => (
        <Scatter
          key={c}
          name={c}
          data={filteredOutliers.filter(s => s.Club === c)}
          fill={clubPalette[i % clubPalette.length]}
        />
      ))}
    </ScatterChart>
  </ResponsiveContainer>
</div>
    ))},


    
    launchspin: { title: "Launch vs Spin — bubble size is Carry", render: () => (!hasData ? <EmptyChart theme={T} /> : (
      <div style={{ width:"100%", height:340 }}>
        <ResponsiveContainer>
          <ScatterChart>
            <CartesianGrid stroke={T.border} />
            <XAxis type="number" dataKey="LaunchAngle_deg" name="Launch Angle" unit=" °" stroke={T.textDim}><Label value="Launch Angle (°)" position="insideBottom" offset={-5} fill={T.textDim}/></XAxis>
            <YAxis type="number" dataKey="SpinRate_rpm" name="Spin Rate" unit=" rpm" stroke={T.textDim}><Label value="Spin Rate (rpm)" angle={-90} position="insideLeft" fill={T.textDim}/></YAxis>
            <ZAxis type="number" dataKey="CarryDistance_yds" range={[30,400]} />
            <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text }} formatter={(v:any,n:any)=>[v,n]} />
            {clubs.map((c)=>(
              <Scatter key={c} name={c} data={filteredOutliers.filter(s=>s.Club===c)} fill={colorForClub(c, clubs, clubPalette)} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    ))},
    table: { title: "Club Averages", render: () => (!hasData ? <EmptyChart theme={T} /> : (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" style={{ color: T.text }}>
          <thead>
            <tr className="text-left" style={{ color: T.textDim }}>
              <Th theme={T}>Club</Th><Th theme={T}>Shots</Th><Th theme={T}>Avg Carry</Th><Th theme={T}>Avg Total</Th>
              <Th theme={T}>Avg Smash</Th><Th theme={T}>Avg Spin</Th><Th theme={T}>Avg Club Spd</Th><Th theme={T}>Avg Ball Spd</Th>
              <Th theme={T}>Avg Launch</Th><Th theme={T}>Face-to-Path</Th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => (
              <tr key={r.club} className="border-t" style={{ borderColor: T.border }}>
                <Td><span className="inline-flex items-center gap-2"><span className="w-3 h-3 inline-block rounded-full" style={{ background: colorForClub(r.club, clubs, clubPalette) }} />{r.club}</span></Td>
                <Td>{r.count}</Td><Td>{r.avgCarry.toFixed(1)}</Td><Td>{r.avgTotal.toFixed(1)}</Td>
                <Td>{r.avgSmash.toFixed(3)}</Td><Td>{Math.round(r.avgSpin)}</Td><Td>{r.avgCS.toFixed(1)}</Td><Td>{r.avgBS.toFixed(1)}</Td>
                <Td>{r.avgLA.toFixed(1)}</Td><Td>{r.avgF2P.toFixed(2)}°</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ))},
  };

  return (
    <div className="grid grid-cols-1 gap-8">
      {cardOrder.map((key) => {
        const card = CARDS[key]; if (!card) return null;
        return (
          <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)} style={{ cursor: "grab" }}>
            <Card theme={T} title={card.title} dragHandle>{card.render()}</Card>
          </div>
        );
      })}
    </div>
  );
}
