import React from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Scatter, ScatterChart, ReferenceLine, Label
} from "recharts";
import { Theme } from "./theme";
import { Shot, ClubRow, orderIndex } from "./utils";
import { Card } from "./components/UI";

/* ---------- local helpers (no extra imports) ---------- */

function fmt(v: number | undefined | null, digits = 1): string {
  if (v == null || Number.isNaN(v as number)) return "–";
  return Number(v).toFixed(digits);
}

// Very light hex → rgba for translucent fills
function rgbaFromHex(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  // eslint-disable-next-line no-bitwise
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const CLUB_PALETTE = [
  "#2563EB", "#059669", "#D97706", "#DC2626", "#7C3AED",
  "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#9333EA",
  "#22C55E", "#3B82F6"
];

/* ---------- Shot Shape (adds Hook/Slice) ---------- */

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
  if (!shots.length) return <div className="h-40 grid place-items-center" style={{ color: T.textDim }}>No data</div>;
  const s = classifyShapes(shots);

  const Box = ({ title, bucket, fg, bg }:{
    title: string; bucket: ShapeBucket; fg: string; bg: string;
  }) => (
    <div className="rounded-2xl px-4 py-5" style={{ background: bg, border: `1px solid ${T.border}` }}>
      <div className="text-2xl font-semibold" style={{ color: fg }}>{bucket.pct.toFixed(1)}%</div>
      <div className="mt-1 text-sm" style={{ color: T.text }}>
        {title} <span style={{ color: T.textDim }}>({bucket.n})</span>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Box title="Hook"     bucket={s.hook}     fg="#DC2626" bg={rgbaFromHex("#EF4444", 0.08)} />
      <Box title="Draw"     bucket={s.draw}     fg="#059669" bg={rgbaFromHex("#10B981", 0.10)} />
      <Box title="Straight" bucket={s.straight} fg={theme.brand} bg={rgbaFromHex(theme.brand, 0.10)} />
      <Box title="Fade"     bucket={s.fade}     fg="#D97706" bg={rgbaFromHex("#F59E0B", 0.10)} />
      <Box title="Slice"    bucket={s.slice}    fg="#2563EB" bg={rgbaFromHex("#3B82F6", 0.10)} />
    </div>
  );
}

/* ---------- Dispersion (legend outside) ---------- */

function RangeDispersion({ theme, shots, clubs }:{
  theme: Theme; shots: Shot[]; clubs: string[];
}) {
  const T = theme;
  if (!shots.length) return <div className="h-40 grid place-items-center" style={{ color: T.textDim }}>No data</div>;

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
  }).filter(Boolean) as { x: number; y: number; club: string }[];

  if (!pts.length) return <div className="h-40 grid place-items-center" style={{ color: T.textDim }}>No data</div>;

  const xMin = Math.floor(Math.min(...pts.map(p => p.x))) - 5;
  const xMax = Math.ceil(Math.max(...pts.map(p => p.x))) + 5;
  const yMin = Math.floor(Math.min(...pts.map(p => p.y))) - 5;
  const yMax = Math.ceil(Math.max(...pts.map(p => p.y))) + 5;

  // build series by club (only for clubs present in filtered shots)
  const byClub = new Map<string, { x: number; y: number }[]>();
  pts.forEach(p => {
    if (!byClub.has(p.club)) byClub.set(p.club, []);
    byClub.get(p.club)!.push({ x: p.x, y: p.y });
  });

  const presentClubs = clubs.filter(c => byClub.has(c));
  const colorFor = (club: string) => {
    const idx = Math.abs(orderIndex(club)) % CLUB_PALETTE.length;
    return CLUB_PALETTE[idx];
  };

  return (
    <div>
      <div className="w-full" style={{ height: 320 }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <CartesianGrid stroke={rgbaFromHex(T.textDim, 0.2)} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[xMin, xMax]}
              tick={{ fill: T.text }}
              label={{ value: "Carry (yds)", position: "insideBottom", dy: 10, fill: T.text }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[yMin, yMax]}
              tick={{ fill: T.text }}
              label={{ value: "Lateral deviation (yds)", angle: -90, position: "insideLeft", fill: T.text }}
            />
            {presentClubs.map((club) => (
              <Scatter
                key={club}
                data={byClub.get(club)!}
                name={club}
                fill={rgbaFromHex(colorFor(club), 0.9)}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {/* Legend outside chart */}
      <div className="flex flex-wrap gap-3 mt-3">
        {presentClubs.map((club) => (
          <div key={club} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: colorFor(club) }} />
            <span style={{ color: T.text }}>{club}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Gapping (LW → … → Driver) ---------- */

function GapChart({ theme, shots }:{ theme: Theme; shots: Shot[] }) {
  const T = theme;
  if (!shots.length) return <div className="h-40 grid place-items-center" style={{ color: T.textDim }}>No data</div>;

  const byClub = new Map<string, number[]>();
  shots.forEach(s => {
    if (s.Club && s.CarryDistance_yds != null) {
      if (!byClub.has(s.Club)) byClub.set(s.Club, []);
      byClub.get(s.Club)!.push(s.CarryDistance_yds as number);
    }
  });
  let rows = Array.from(byClub.entries()).map(([club, arr]) => ({
    club,
    avg: arr.reduce((a, b) => a + b, 0) / arr.length
  }));

  // LW -> ... -> Driver (orderIndex: higher = longer, so sort descending)
  rows.sort((a, b) => orderIndex(b.club) - orderIndex(a.club));

  return (
    <div style={{ height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 10, right: 10, bottom: 30, left: 10 }}>
          <CartesianGrid stroke={rgbaFromHex(T.textDim, 0.2)} />
          <XAxis dataKey="club" tick={{ fill: T.text }} angle={-30} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: T.text }} label={{ value: "Avg Carry (yds)", angle: -90, position: "insideLeft", fill: T.text }} />
          <Tooltip />
          <Bar dataKey="avg" fill={rgbaFromHex(T.brand, 0.9)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Efficiency + Smash trendline ---------- */

function EfficiencyChart({ theme, shots }:{ theme: Theme; shots: Shot[] }) {
  const T = theme;
  if (!shots.length) return <div className="h-40 grid place-items-center" style={{ color: T.textDim }}>No data</div>;

  const points = shots.map(s => {
    if (s.ClubSpeed_mph != null && s.BallSpeed_mph != null) {
      return { x: s.ClubSpeed_mph as number, y: s.BallSpeed_mph as number };
    }
    return null;
  }).filter(Boolean) as { x: number; y: number }[];

  if (!points.length) return <div className="h-40 grid place-items-center" style={{ color: T.textDim }}>No data</div>;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const xmin = Math.floor(Math.min(...xs)) - 2;
  const xmax = Math.ceil(Math.max(...xs)) + 2;

  // average smash ≈ avg( ballSpeed ) / avg( clubSpeed )
  const smashAvg = (ys.reduce((a, b) => a + b, 0) / ys.length) / (xs.reduce((a, b) => a + b, 0) / xs.length);
  const seg = [{ x: xmin, y: smashAvg * xmin }, { x: xmax, y: smashAvg * xmax }];

  return (
    <div style={{ height: 320 }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
          <CartesianGrid stroke={rgbaFromHex(T.textDim, 0.2)} />
          <XAxis type="number" dataKey="x" tick={{ fill: T.text }} label={{ value: "Club Speed (mph)", position: "insideBottom", dy: 10, fill: T.text }} />
          <YAxis type="number" dataKey="y" tick={{ fill: T.text }} label={{ value: "Ball Speed (mph)", angle: -90, position: "insideLeft", fill: T.text }} />
          <Tooltip />
          <Scatter data={points} fill={rgbaFromHex(T.brand, 0.9)} />
          <ReferenceLine segment={seg} ifOverflow="extendDomain" stroke={T.brand} strokeDasharray="6 4">
            <Label position="right" value={`Smash ~ ${smashAvg.toFixed(3)}`} fill={T.text} />
          </ReferenceLine>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Averages table ---------- */

function AveragesTable({ theme, rows }:{ theme: Theme; rows: ClubRow[] }) {
  const T = theme;
  if (!rows.length) return <div className="h-40 grid place-items-center" style={{ color: T.textDim }}>No data</div>;
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead style={{ background: rgbaFromHex(T.brand, 0.06) }}>
          <tr style={{ color: T.text }}>
            <th className="px-3 py-2 text-left">Club</th>
            <th className="px-3 py-2 text-right">Shots</th>
            <th className="px-3 py-2 text-right">Avg Carry</th>
            <th className="px-3 py-2 text-right">Avg Total</th>
            <th className="px-3 py-2 text-right">Smash</th>
            <th className="px-3 py-2 text-right">Spin</th>
            <th className="px-3 py-2 text-right">Club Spd</th>
            <th className="px-3 py-2 text-right">Ball Spd</th>
            <th className="px-3 py-2 text-right">Launch</th>
            <th className="px-3 py-2 text-right">F2P</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.club} style={{ color: T.text }}>
              <td className="px-3 py-2">{r.club}</td>
              <td className="px-3 py-2 text-right">{r.count}</td>
              <td className="px-3 py-2 text-right">{fmt(r.avgCarry, 1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.avgTotal, 1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.avgSmash, 3)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.avgSpin, 0)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.avgCS, 1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.avgBS, 1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.avgLA, 1)}</td>
              <td className="px-3 py-2 text-right">{fmt(r.avgF2P, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- KPI computation & tiles (one row inside a single card) ---------- */

function computeKpis(pool: Shot[]) {
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const grab = (sel: (s: Shot) => number | undefined) => pool.map(sel).filter((x): x is number => x != null);
  return {
    carry: avg(grab(s => s.CarryDistance_yds)),
    total: avg(grab(s => s.TotalDistance_yds)),
    smash: avg(grab(s => s.SmashFactor)),
    spin:  avg(grab(s => s.SpinRate_rpm)),
    cs:    avg(grab(s => s.ClubSpeed_mph)),
    bs:    avg(grab(s => s.BallSpeed_mph)),
  };
}

function KPIItem({ theme, label, value, unit, digits=1 }:{
  theme: Theme; label: string; value: number; unit?: string; digits?: number;
}) {
  const T = theme;
  return (
    <div className="rounded-2xl px-4 py-5" style={{ background: rgbaFromHex(T.brand, 0.06), border: `1px solid ${T.border}` }}>
      <div className="text-xs mb-1" style={{ color: T.textDim }}>{label}</div>
      <div className="text-2xl font-semibold" style={{ color: T.brand }}>
        {fmt(value, digits)}{unit ? ` ${unit}` : ""}
      </div>
    </div>
  );
}

/* ---------- DashboardCards (launchspin removed) ---------- */

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

  const kp = computeKpis(filteredOutliers);

  // Cards map — "kpis" is now a single card containing a one-row grid of KPI tiles.
  const CARDS: Record<string, { title: string; render: () => React.ReactNode }> = {
    kpis: {
      title: "Key Performance Indicators",
      render: () => {
        if (!filteredOutliers.length) {
          return <div className="h-20 grid place-items-center" style={{ color: T.textDim }}>No data</div>;
        }
        return (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <KPIItem theme={T} label="Avg Carry" value={kp.carry} unit="yds" digits={1} />
            <KPIItem theme={T} label="Avg Total" value={kp.total} unit="yds" digits={1} />
            <KPIItem theme={T} label="Avg Smash" value={kp.smash} digits={3} />
            <KPIItem theme={T} label="Avg Spin" value={kp.spin} unit="rpm" digits={0} />
            <KPIItem theme={T} label="Avg Club Spd" value={kp.cs} unit="mph" digits={1} />
            <KPIItem theme={T} label="Avg Ball Spd" value={kp.bs} unit="mph" digits={1} />
          </div>
        );
      }
    },
    shape: {
      title: "Shot Shape Distribution",
      render: () => <ShotShapeCard theme={T} shots={filteredOutliers} />
    },
    dispersion: {
      title: "Range Dispersion (Carry vs Lateral)",
      render: () => <RangeDispersion theme={T} shots={filteredOutliers} clubs={clubs} />
    },
    gap: {
      title: "Gapping (Avg Carry by Club)",
      render: () => <GapChart theme={T} shots={filteredOutliers} />
    },
    eff: {
      title: "Efficiency (Ball vs Club Speed) + Smash Trend",
      render: () => <EfficiencyChart theme={T} shots={filteredOutliers} />
    },
    table: {
      title: "Club Averages",
      render: () => <AveragesTable theme={T} rows={tableRows} />
    },
  };

  const keys = cardOrder.filter(k => CARDS[k]);

  return (
    <div className="grid grid-cols-1 gap-8">
      {keys.map((key) => {
        const card = CARDS[key];
        return (
          <div
            key={key}
            draggable
            onDragStart={onDragStart(key)}
            onDragOver={onDragOver(key)}
            onDrop={onDrop(key)}
            style={{ cursor: "grab" }}
          >
            <Card theme={T} title={card.title} dragHandle>{card.render()}</Card>
          </div>
        );
      })}
    </div>
  );
}
