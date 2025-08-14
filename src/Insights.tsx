import React, { useMemo, useState } from "react";
import {
  CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart, Bar, ReferenceLine, Cell, LineChart, Line
} from "recharts";
import { Theme, clubPalette, colorForClub, alpha } from "./theme";
import { Shot, ClubRow, mean, stddev, quantile } from "./utils";
import { Card, KPI } from "./components/UI";

/* Distance Distribution (per-club colored) */
function DistanceBoxChart({ theme, shots, clubs, metric = "total" }:{ theme: Theme; shots: Shot[]; clubs: string[]; metric?: "total" | "carry"; }) {
  const T = theme; const getCarry = (s: Shot) => s.CarryDistance_yds; const getTotal = (s: Shot) => s.TotalDistance_yds;
  const get = (s: Shot) => (metric === "total" ? getTotal(s) : getCarry(s));
  const rows = clubs.map((club) => {
    const pool = shots.filter(s => s.Club === club);
    const vals = pool.map(get).filter((v): v is number => v != null);
    if (!vals.length) return null;
    const min = Math.min(...vals), max = Math.max(...vals), q1 = quantile(vals, 0.25), q3 = quantile(vals, 0.75), med = quantile(vals, 0.5), avg = mean(vals);
    return { club, min, max, q1, q3, median: med, mean: avg, rangeStart: min, rangeWidth: Math.max(0, max - min), iqrStart: q1, iqrWidth: Math.max(0, q3 - q1) };
  }).filter(Boolean) as any[];
  if (!rows.length) return <div style={{ padding: 16, color: T.textDim }}>No shots for this selection.</div>;
  const xMin = Math.min(...rows.map(r => r.min)), xMax = Math.max(...rows.map(r => r.max));
  const pad = Math.max(5, Math.round((xMax - xMin) * 0.05));
  const domain: [number, number] = [Math.max(0, xMin - pad), xMax + pad];
  const getColor = (club: string) => colorForClub(club, clubs, clubPalette);
  const Tip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const r = payload[0].payload;
    return <div style={{ background: T.panel, border:`1px solid ${T.border}`, color: T.text, padding: 10, borderRadius: 8 }}>
      <div><b>{r.club}</b></div>
      <div>Median: {r.median.toFixed(1)} — Mean: {r.mean.toFixed(1)} — Min/Max: {r.min.toFixed(1)}/{r.max.toFixed(1)}</div>
      <div>IQR: {r.q1.toFixed(1)}–{r.q3.toFixed(1)} (range {r.iqrWidth.toFixed(1)})</div>
    </div>;
  };
  const tickHalfW = 7;
  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart data={rows} layout="vertical" margin={{ top: 10, right: 16, bottom: 10, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
        <XAxis type="number" domain={domain} stroke={T.textDim} />
        <YAxis type="category" dataKey="club" interval={0} width={120} stroke={T.textDim} />
        <Tooltip content={<Tip />} />
        <Bar dataKey="rangeStart" stackId="range" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="rangeWidth" stackId="range" barSize={6} radius={[4,4,4,4]}>
          {rows.map((r: any) => <Cell key={`w-${r.club}`} fill={alpha(getColor(r.club), 0.25)} />)}
        </Bar>
        <Bar dataKey="iqrStart" stackId="iqr" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="iqrWidth" stackId="iqr" barSize={14} radius={[6,6,6,6]} opacity={0.95}>
          {rows.map((r: any) => <Cell key={`b-${r.club}`} fill={getColor(r.club)} />)}
        </Bar>
        {rows.map((r:any) => (
          <ReferenceLine key={`med-${r.club}`} segment={[{ x: r.median - tickHalfW, y: r.club }, { x: r.median + tickHalfW, y: r.club }]} stroke={T.brandTint} strokeWidth={3} ifOverflow="extendDomain" />
        ))}
        {rows.map((r:any) => (
          <ReferenceLine key={`mean-${r.club}`} segment={[{ x: r.mean - tickHalfW, y: r.club }, { x: r.mean + tickHalfW, y: r.club }]} stroke={T.white} strokeWidth={3} ifOverflow="extendDomain" />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* Shorter-needle Direction Gauge */
function DirectionGauge({ theme, degrees }:{ theme: Theme; degrees: number }) {
  const T = theme;
  const min = -10, max = 10, val = Math.max(min, Math.min(max, degrees)), pct = (val - min) / (max - min);
  const W = 360, H = 160, cx = W / 2, cy = H - 10, r = 140, needleR = r * 0.75;
  const angle = Math.PI * (1 - pct); const x = cx + needleR * Math.cos(angle); const y = cy - needleR * Math.sin(angle);
  const arc = (start: number, end: number) => {
    const sx = cx + r * Math.cos(start), sy = cy - r * Math.sin(start);
    const ex = cx + r * Math.cos(end), ey = cy - r * Math.sin(end);
    const large = end - start <= Math.PI ? 0 : 1; return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 0 ${ex} ${ey}`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="160" style={{ background: theme.brandSoft, borderRadius: 12, border: `1px solid ${theme.border}` }}>
      <path d={arc(Math.PI, 0)} fill="none" stroke={theme.border} strokeWidth={12} />
      <line x1={cx} y1={cy} x2={x} y2={y} stroke={theme.brand} strokeWidth={6} />
      <text x={20} y={cy - 8} fontSize={12} fill={theme.textDim}>Left -10°</text>
      <text x={W - 70} y={cy - 8} fontSize={12} fill={theme.textDim}>Right +10°</text>
      <text x={cx - 40} y={20} fontSize={13} fill={theme.textDim}>Avg Dir {degrees.toFixed(1)}°</text>
    </svg>
  );
}

export default function InsightsView({
  theme, tableRows, filteredOutliers, filteredNoClubOutliers, allClubs,
  insightsOrder, onDragStart, onDragOver, onDrop
}: {
  theme: Theme; tableRows: ClubRow[];
  filteredOutliers: Shot[]; filteredNoClubOutliers: Shot[];
  allClubs: string[]; insightsOrder: string[];
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
}) {
  const T = theme;

  // Global (ignores individual club filter)
  const longest = filteredNoClubOutliers.reduce<{ club: string; carry: number } | null>((acc, s) => {
    const c = s.CarryDistance_yds ?? -Infinity; if (c<=0) return acc; if (!acc || c>acc.carry) return { club: s.Club, carry: c }; return acc;
  }, null);

  const perClubGlobal = useMemo(() => {
    const by = new Map<string, Shot[]>(); filteredNoClubOutliers.forEach(s => { if(!by.has(s.Club)) by.set(s.Club, []); by.get(s.Club)!.push(s); });
    return [...by.entries()].map(([club, arr]) => {
      const carry = arr.map(s => s.CarryDistance_yds!).filter((x): x is number => x != null);
      const smash = arr.map(s => (s.SmashFactor ?? (s.BallSpeed_mph && s.ClubSpeed_mph ? s.BallSpeed_mph/s.ClubSpeed_mph : undefined))).filter((x): x is number => x != null);
      const lateral = arr.map(s => (s.CarryDeviationDistance_yds ?? (s.LaunchDirection_deg!=null && s.CarryDistance_yds!=null ? s.CarryDistance_yds * Math.sin((s.LaunchDirection_deg * Math.PI) / 180) : undefined))).filter((x): x is number => x != null);
      return { club, n: arr.length, sdCarry: carry.length ? stddev(carry) : Infinity, meanSmash: smash.length ? mean(smash) : 0, sdLateral: lateral.length ? stddev(lateral) : 0, meanLateral: lateral.length ? mean(lateral) : 0 };
    });
  }, [filteredNoClubOutliers]);

  const consistent = useMemo(() => {
    const eligible = perClubGlobal.filter(r => r.n >= 5 && isFinite(r.sdCarry));
    if (!eligible.length) return null;
    return eligible.reduce((a, b) => (a.sdCarry <= b.sdCarry ? a : b));
  }, [perClubGlobal]);

  const efficiencyScore = useMemo(() => {
    const perShot = filteredNoClubOutliers.map((s) => {
      const sf = s.SmashFactor ?? (s.ClubSpeed_mph && s.BallSpeed_mph ? s.BallSpeed_mph / s.ClubSpeed_mph : undefined);
      if (!sf) return undefined; return Math.max(0, Math.min(1, sf / 1.5)) * 100;
    }).filter((x): x is number => x != null);
    return perShot.length ? Math.round(mean(perShot)) : 0;
  }, [filteredNoClubOutliers]);

  const gappingWarnings = useMemo(() => {
    const rows = tableRows.map(r => ({ club: r.club, avgCarry: r.avgCarry })).sort((a,b)=>a.avgCarry-b.avgCarry);
    const bad: { a: string; b: string; gap: number }[] = [];
    for (let i=1;i<rows.length;i++){ const gap=Math.abs(rows[i].avgCarry-rows[i-1].avgCarry); if(gap<12) bad.push({a:rows[i-1].club,b:rows[i].club,gap}); }
    return bad;
  }, [tableRows]);

  // Personal Records (current selection)
  const personal = useMemo(() => {
    const pool = filteredOutliers; if (!pool.length) return null;
    const pbCarry = pool.reduce((acc, s) => (s.CarryDistance_yds!=null && (!acc || s.CarryDistance_yds>acc.val)) ? { val:s.CarryDistance_yds, club:s.Club } : acc, null as null|{val:number;club:string});
    const pbTotal = pool.reduce((acc, s) => (s.TotalDistance_yds!=null && (!acc || s.TotalDistance_yds>acc.val)) ? { val:s.TotalDistance_yds, club:s.Club } : acc, null as null|{val:number;club:string});
    const dirs = pool.map((s)=> (s.LaunchDirection_deg!=null? s.LaunchDirection_deg :
                      (s.CarryDeviationDistance_yds!=null && s.CarryDistance_yds? (Math.asin(Math.max(-1,Math.min(1, s.CarryDeviationDistance_yds/s.CarryDistance_yds)))*180)/Math.PI : undefined)))
                      .filter((x):x is number=>x!=null);
    const avgDir = dirs.length ? mean(dirs) : 0;
    return { pbCarry, pbTotal, avgDir };
  }, [filteredOutliers]);

  const [metric, setMetric] = useState<"total"|"carry">("total");

  // Proficiency tiers (from your image)
  const DIST_TIERS: Record<string, { beginner: number; average: number; good: number; advanced: number; tour: number }> = {
    "Driver": { beginner:180, average:220, good:250, advanced:280, tour:296 },
    "3 Wood": { beginner:170, average:210, good:225, advanced:235, tour:262 },
    "5 Wood": { beginner:150, average:195, good:205, advanced:220, tour:248 },
    "Hybrid": { beginner:145, average:180, good:190, advanced:210, tour:242 },
    "2 Iron": { beginner:100, average:180, good:190, advanced:215, tour:236 },
    "3 Iron": { beginner:100, average:170, good:180, advanced:205, tour:228 },
    "4 Iron": { beginner:100, average:160, good:170, advanced:195, tour:219 },
    "5 Iron": { beginner:125, average:155, good:165, advanced:185, tour:209 },
    "6 Iron": { beginner:120, average:145, good:160, advanced:175, tour:197 },
    "7 Iron": { beginner:110, average:140, good:150, advanced:165, tour:185 },
    "8 Iron": { beginner:100, average:130, good:140, advanced:155, tour:172 },
    "9 Iron": { beginner:90, average:115, good:125, advanced:145, tour:159 },
    "Pitching Wedge": { beginner:80, average:100, good:110, advanced:135, tour:146 },
    "Gap Wedge": { beginner:60, average:90, good:100, advanced:125, tour:135 },
    "Sand Wedge": { beginner:55, average:80, good:95, advanced:115, tour:124 },
    "Lob Wedge": { beginner:40, average:60, good:80, advanced:105, tour:113 },
    "60 (LW)": { beginner:40, average:60, good:80, advanced:105, tour:113 },
  };
  const proficiencyForClub = (club: string, avgTotal: number) => {
    const key = Object.keys(DIST_TIERS).find(k => k.toLowerCase() === club.toLowerCase());
    if (!key) return "—";
    const t = DIST_TIERS[key];
    if (avgTotal >= t.tour) return "PGA Tour";
    if (avgTotal >= t.advanced) return "Advanced";
    if (avgTotal >= t.good) return "Good";
    if (avgTotal >= t.average) return "Average";
    return "Beginner";
  };

  // Exactly one club for progress
  const oneClub = useMemo(() => {
    const setSel = new Set(filteredOutliers.map(s => s.Club));
    return setSel.size === 1 ? [...setSel][0] : null;
  }, [filteredOutliers]);
  const progressData = useMemo(() => {
    if (!oneClub) return [];
    const arr = filteredOutliers.filter(s => s.Club === oneClub && s.Timestamp && (metric === "total" ? s.TotalDistance_yds != null : s.CarryDistance_yds != null))
      .map(s => ({ date: new Date(s.Timestamp!), value: metric === "total" ? s.TotalDistance_yds! : s.CarryDistance_yds! }))
      .sort((a, b) => +a.date - +b.date);
    return arr.map(d => ({ date: d.date.toISOString().slice(0,10), value: d.value }));
  }, [filteredOutliers, oneClub, metric]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Distance Distribution (full) */}
      <div className="md:col-span-2" draggable onDragStart={onDragStart("distanceBox")} onDragOver={onDragOver("distanceBox")} onDrop={onDrop("distanceBox")} style={{ cursor: "grab" }}>
        <Card theme={T} title={`Distance Distribution by Club — ${metric === "total" ? "Total" : "Carry"} (yds)`} dragHandle>
          <div className="mb-3">
            <button onClick={() => setMetric(metric === "total" ? "carry" : "total")} className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: T.border, color: T.brand, background: T.panel }}>
              Switch to {metric === "total" ? "Carry" : "Total"}
            </button>
          </div>
          <div style={{ background: T.brandSoft, borderRadius: 12, padding: 8 }}>
            <DistanceBoxChart theme={T} shots={filteredOutliers} clubs={allClubs} metric={metric} />
          </div>
        </Card>
      </div>

      {/* Highlights (global) */}
      <div className="md:col-span-2" draggable onDragStart={onDragStart("highlights")} onDragOver={onDragOver("highlights")} onDrop={onDrop("highlights")} style={{ cursor: "grab" }}>
        <Card theme={T} title="Highlights (All Clubs)" dragHandle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KPI theme={T} label="Longest Carry (shot)" value={longest ? `${longest.carry.toFixed(1)} yds (${longest.club})` : "-"} color={T.brand} />
            <KPI theme={T} label="Most Consistent (club)" value={consistent ? `${consistent.club} (${consistent.sdCarry.toFixed(1)} sd)` : "-"} color={T.brandTint} />
            <KPI theme={T} label="Efficiency Score" value={`${efficiencyScore}/100`} color={T.text}
                 tooltip="Efficiency Score is based on Smash Factor (Ball Speed / Club Speed), normalized to an ideal of ~1.50. Each shot scores 0–100; the card shows the average across filtered data (ignoring club selection)." />
          </div>
        </Card>
      </div>

      {/* Personal Records (current selection) */}
      <div className="md:col-span-2" draggable onDragStart={onDragStart("personalRecords")} onDragOver={onDragOver("personalRecords")} onDrop={onDrop("personalRecords")} style={{ cursor: "grab" }}>
        <Card theme={T} title="Personal Records (PR) — current selection" dragHandle>
          {!personal ? <div style={{ color: T.textDim }}>No shots in selection.</div> : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <KPI theme={T} label="PR Carry" value={personal.pbCarry ? `${personal.pbCarry.val.toFixed(1)} yds (${personal.pbCarry.club})` : "-"} color="#4EA3FF" />
                <KPI theme={T} label="PR Total" value={personal.pbTotal ? `${personal.pbTotal.val.toFixed(1)} yds (${personal.pbTotal.club})` : "-"} color={T.brand} />
                <KPI theme={T}
                     label="Proficiency Level"
                     value={(() => {
                       const setSel = new Set(filteredOutliers.map(s => s.Club));
                       if (setSel.size !== 1) return "— (select one club)";
                       const club = [...setSel][0];
                       const totals = filteredOutliers.filter(s => s.Club === club).map(s => s.TotalDistance_yds).filter((v): v is number => v != null);
                       if (!totals.length) return "—";
                       return proficiencyForClub(club, mean(totals));
                     })()}
                     color="#F59E0B"
                     tooltip="Level is determined by your average TOTAL distance for the selected club vs. published tiers (Beginner, Average, Good, Advanced, PGA Tour)." />
              </div>
              <DirectionGauge theme={T} degrees={personal.avgDir} />
            </>
          )}
        </Card>
      </div>

      {/* Progress */}
      <div className="md:col-span-2" draggable onDragStart={onDragStart("progress")} onDragOver={onDragOver("progress")} onDrop={onDrop("progress")} style={{ cursor: "grab" }}>
        <Card theme={T} title={`Club Progress — ${oneClub ?? "select one club"} (${metric === "total" ? "Total" : "Carry"})`} dragHandle>
          {!oneClub ? <div style={{ color: T.textDim }}>Select exactly one club in Filters to view progress.</div> : (
            <div style={{ width:"100%", height:300 }}>
              <ResponsiveContainer>
                <LineChart data={progressData}>
                  <CartesianGrid stroke={T.border} />
                  <XAxis dataKey="date" stroke={T.textDim} />
                  <YAxis stroke={T.textDim} />
                  <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text }} />
                  <Line type="monotone" dataKey="value" stroke={T.brand} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Gapping warnings */}
      <div draggable onDragStart={onDragStart("warnings")} onDragOver={onDragOver("warnings")} onDrop={onDrop("warnings")} style={{ cursor: "grab" }}>
        <Card theme={T} title={`Gapping Warnings (Carry Δ < 12 yds) — ${gappingWarnings.length}`} dragHandle>
          {gappingWarnings.length === 0 ? <div style={{ color: T.textDim }}>No issues detected.</div> : (
            <ul className="list-disc pl-6" style={{ color: T.text }}>
              {gappingWarnings.map((g, i) => <li key={i}><b>{g.a}</b> ↔ <b>{g.b}</b> : {g.gap.toFixed(1)} yds</li>)}
            </ul>
          )}
        </Card>
      </div>

      {/* Biggest Weaknesses */}
      <div draggable onDragStart={onDragStart("weaknesses")} onDragOver={onDragOver("weaknesses")} onDrop={onDrop("weaknesses")} style={{ cursor: "grab" }}>
        <Card theme={T} title="Biggest Weaknesses (All Clubs)" dragHandle>
          {(() => {
            const eligible = perClubGlobal.filter(r => r.n >= 5);
            if (!eligible.length) return <div style={{ color: T.textDim }}>Need at least 5 shots per club.</div>;
            const right = eligible.reduce((a,b)=> (a.meanLateral>=b.meanLateral?a:b));
            const left  = eligible.reduce((a,b)=> (a.meanLateral<=b.meanLateral?a:b));
            const leastCons = eligible.reduce((a,b)=> (a.sdCarry>=b.sdCarry?a:b));
            const worstEff  = eligible.reduce((a,b)=> (a.meanSmash<=b.meanSmash?a:b));
            return (
              <ul className="list-disc pl-6" style={{ color: T.text }}>
                <li><b>Most right-biased:</b> {right.club} (avg lateral +{right.meanLateral.toFixed(1)} yds)</li>
                <li><b>Most left-biased:</b> {left.club} (avg lateral {left.meanLateral.toFixed(1)} yds)</li>
                <li><b>Least consistent carry:</b> {leastCons.club} (SD {leastCons.sdCarry.toFixed(1)} yds)</li>
                <li><b>Lowest efficiency:</b> {worstEff.club} (avg smash {worstEff.meanSmash.toFixed(3)})</li>
              </ul>
            );
          })()}
        </Card>
      </div>
    </div>
  );
}
