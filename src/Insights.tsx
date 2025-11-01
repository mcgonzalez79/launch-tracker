import React, { useEffect, useMemo, useState } from "react";
import type { Theme } from "./theme";
import type { Shot, ClubRow } from "./utils";
import { Card } from "./components/UI";
import { isNum, mean, stddev, groupBy, calculateConsistencyIndex, calculateVirtualHandicap } from "./utils";

type Props = {
  theme: Theme;
  tableRows: ClubRow[];
  filteredOutliers: Shot[];
  filteredNoClubOutliers: Shot[];
  filteredNoClubRaw: Shot[];
  allClubs: string[];
  allShots: Shot[];
  insightsOrder: string[];
  onDragStart: (key: string) => (e: React.DragEvent) => void;
  onDragOver: (key: string) => (e: React.DragEvent) => void;
  onDrop: (key: string) => (e: React.DragEvent) => void;
};

/* =========================
   Component
========================= */
export default function InsightsView({
  theme: T,
  tableRows,
  filteredOutliers,
  filteredNoClubOutliers,
  filteredNoClubRaw,
  allClubs,
  allShots,
  insightsOrder,
  onDragStart,
  onDragOver,
  onDrop
}: Props) {
  const [matrixData, setMatrixData] = useState<Record<string, Record<string, string>>>({});
  const [isCarryIndexModalOpen, setCarryIndexModalOpen] = useState(false);
  const [isConsistencyModalOpen, setConsistencyModalOpen] = useState(false);
  const [isHandicapModalOpen, setHandicapModalOpen] = useState(false);

  useEffect(() => {
    fetch('swing_matrix.json')
      .then(res => res.json())
      .then(data => setMatrixData(data))
      .catch(err => console.error("Failed to load swing matrix:", err));
  }, []);

  const hasData = tableRows.length > 0;
  const driverShots = filteredNoClubOutliers.filter(s => s.Club?.toLowerCase().includes("driver"));
  const ironShots = filteredNoClubOutliers.filter(s => s.Club?.toLowerCase().includes("iron"));
  const wedgeShots = filteredNoClubOutliers.filter(s => s.Club?.toLowerCase().includes("wedge") || s.Club?.toLowerCase().includes("wdg"));
  const woodShots = filteredNoClubOutliers.filter(s => s.Club?.toLowerCase().includes("wood") || s.Club?.toLowerCase().includes("hy"));

  const avgMetric = (shots: Shot[], metric: keyof Shot) => {
    const xs = shots.map(s => s[metric]).filter(isNum) as number[];
    return xs.length ? mean(xs) : null;
  };
  const maxMetric = (shots: Shot[], metric: keyof Shot) => {
    const xs = shots.map(s => s[metric]).filter(isNum) as number[];
    return xs.length ? Math.max(...xs) : null;
  };
  
  const distanceByClub = useMemo(() => {
    return [
      { name: "Driver", avg: avgMetric(driverShots, 'CarryDistance_yds'), max: maxMetric(driverShots, 'CarryDistance_yds'), n: driverShots.length },
      { name: "Woods/Hybrids", avg: avgMetric(woodShots, 'CarryDistance_yds'), max: maxMetric(woodShots, 'CarryDistance_yds'), n: woodShots.length },
      { name: "Irons", avg: avgMetric(ironShots, 'CarryDistance_yds'), max: maxMetric(ironShots, 'CarryDistance_yds'), n: ironShots.length },
      { name: "Wedges", avg: avgMetric(wedgeShots, 'CarryDistance_yds'), max: maxMetric(wedgeShots, 'CarryDistance_yds'), n: wedgeShots.length },
    ].filter(r => r.n > 0);
  }, [driverShots, woodShots, ironShots, wedgeShots]);

  const longestShots = useMemo(() => {
    return allShots
      .filter(s => isNum(s.TotalDistance_yds))
      .sort((a, b) => (b.TotalDistance_yds as number) - (a.TotalDistance_yds as number))
      .slice(0, 5)
      .map((s, i) => ({
        rank: i + 1,
        club: s.Club,
        dist: (s.TotalDistance_yds as number).toFixed(1),
        date: s.Timestamp ? new Date(s.Timestamp).toLocaleDateString() : 'N/A'
      }));
  }, [allShots]);

  const pgaBenchmarks = [
    { metric: 'Club Speed (Driver)', pga: '113 mph', your: avgMetric(driverShots, 'ClubSpeed_mph')?.toFixed(1) + ' mph' },
    { metric: 'Ball Speed (Driver)', pga: '167 mph', your: avgMetric(driverShots, 'BallSpeed_mph')?.toFixed(1) + ' mph' },
    { metric: 'Smash Factor (Driver)', pga: '1.48', your: avgMetric(driverShots, 'SmashFactor')?.toFixed(3) },
    { metric: 'Launch Angle (Driver)', pga: '10.9°', your: avgMetric(driverShots, 'LaunchAngle_deg')?.toFixed(1) + '°' },
    { metric: 'Backspin (Driver)', pga: '2686 rpm', your: avgMetric(driverShots, 'Backspin_rpm')?.toFixed(0) + ' rpm' },
    { metric: 'Apex Height (Driver)', pga: '32 yds', your: avgMetric(driverShots, 'ApexHeight_yds')?.toFixed(1) + ' yds' },
    { metric: 'Club Speed (7 Iron)', pga: '90 mph', your: avgMetric(ironShots.filter(s => s.Club === '7 Iron'), 'ClubSpeed_mph')?.toFixed(1) + ' mph' },
    { metric: 'Backspin (7 Iron)', pga: '7000 rpm', your: avgMetric(ironShots.filter(s => s.Club === '7 Iron'), 'Backspin_rpm')?.toFixed(0) + ' rpm' },
  ];
  
  const gapWarnings = useMemo(() => {
    const sortedClubs = tableRows.filter(r => r.avgCarry > 0).sort((a, b) => b.avgCarry - a.avgCarry);
    let count = 0;
    const clubs = new Set<string>();
    for (let i = 0; i < sortedClubs.length - 1; i++) {
      const gap = sortedClubs[i].avgCarry - sortedClubs[i+1].avgCarry;
      if (gap > 20) { // Over 20 yards
        count++;
        clubs.add(`${sortedClubs[i].club} / ${sortedClubs[i+1].club}`);
      }
      if (gap < 8) { // Under 8 yards
        count++;
        clubs.add(`${sortedClubs[i].club} / ${sortedClubs[i+1].club}`);
      }
    }
    return { count, clubs };
  }, [tableRows]);

  const consistencyIndex = useMemo(() => calculateConsistencyIndex(filteredNoClubOutliers), [filteredNoClubOutliers]);
  const virtualHandicap = useMemo(() => calculateVirtualHandicap(filteredNoClubRaw), [filteredNoClubRaw]);
  
  const consistencyIndexPct = useMemo(() => {
    const relevantShots = filteredNoClubRaw.filter(s => isNum(s.CarryDeviationDistance_yds));
    if (relevantShots.length === 0) return null;
    
    // "Good" shot is within 20 yards of the target line
    const goodShots = relevantShots.filter(s => Math.abs(s.CarryDeviationDistance_yds!) <= 20).length;
    const totalShots = relevantShots.length;
    
    return (goodShots / totalShots);
  }, [filteredNoClubRaw]);

  const mainSwingFault = useMemo(() => {
    const pathShots = filteredNoClubOutliers.filter(s => isNum(s.ClubPath_deg));
    const faceShots = filteredNoClubOutliers.filter(s => isNum(s.ClubFace_deg));
    if (pathShots.length < 10 || faceShots.length < 10) return { title: 'N/A', advice: 'Not enough path/face data.' };
    
    const avgPath = mean(pathShots.map(s => s.ClubPath_deg as number));
    const avgFace = mean(faceShots.map(s => s.ClubFace_deg as number));
    
    const pathKey = avgPath < -2 ? 'in-out' : avgPath > 2 ? 'out-in' : 'neutral';
    const faceKey = avgFace < -2 ? 'closed' : avgFace > 2 ? 'open' : 'neutral';
    
    return matrixData[pathKey]?.[faceKey] || { title: 'Good!', advice: 'Your path and face look neutral.'};
  }, [filteredNoClubOutliers, matrixData]);

  const progressOverTime = useMemo(() => {
    const shotsWithDate = filteredNoClubOutliers
      .filter(s => s.Timestamp && isNum(s.CarryDistance_yds))
      .sort((a, b) => new Date(a.Timestamp!).getTime() - new Date(b.Timestamp!).getTime());
      
    if (shotsWithDate.length < 10) return [];
    
    const grouped = groupBy(shotsWithDate, (s) => new Date(s.Timestamp!).toLocaleDateString());
    const data: { date: string, avgCarry: number }[] = [];
    grouped.forEach((group, date) => {
      data.push({ date, avgCarry: mean(group.map(s => s.CarryDistance_yds as number)) });
    });
    return data.slice(-30); // Last 30 sessions
  }, [filteredNoClubOutliers]);

  
  const KpiCell = ({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) => (
    <div
      className="rounded-xl p-4 border"
      style={{ background: T.panelAlt, borderColor: T.border }}
    >
      <div className="text-xs mb-1" style={{ color: T.textDim }}>{label}</div>
      <div className="text-2xl font-semibold" style={{ color: T.text }}>{value}</div>
      {sub ? <div className="text-xs mt-1" style={{ color: T.textDim }}>{sub}</div> : null}
    </div>
  );

  const cardMap: Record<string, JSX.Element> = {
    dist: (
      <Card title="Distances by Club Type" theme={T}>
        {hasData ? (
          <table className="w-full text-sm">
            <thead><tr style={{color: T.textDim}}>
              <th className="text-left font-normal pb-1">Club</th>
              <th className="text-right font-normal pb-1">Avg Carry</th>
              <th className="text-right font-normal pb-1">Max Carry</th>
              <th className="text-right font-normal pb-1">Shots</th>
            </tr></thead>
            <tbody>
              {distanceByClub.map(r => (
                <tr key={r.name} style={{borderTop: `1px solid ${T.border}`}}>
                  <td className="py-2">{r.name}</td>
                  <td className="text-right py-2">{r.avg?.toFixed(1)} yds</td>
                  <td className="text-right py-2">{r.max?.toFixed(1)} yds</td>
                  <td className="text-right py-2">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <NoData T={T} />}
      </Card>
    ),
    high: (
      <Card title="Highest Total Distances (All Time)" theme={T}>
        {longestShots.length ? (
          <table className="w-full text-sm">
            <thead><tr style={{color: T.textDim}}>
              <th className="text-left font-normal pb-1">Club</th>
              <th className="text-right font-normal pb-1">Distance</th>
              <th className="text-right font-normal pb-1">Date</th>
            </tr></thead>
            <tbody>
              {longestShots.map(r => (
                <tr key={r.rank} style={{borderTop: `1px solid ${T.border}`}}>
                  <td className="py-2">{r.club}</td>
                  <td className="text-right py-2">{r.dist} yds</td>
                  <td className="text-right py-2">{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <NoData T={T} />}
      </Card>
    ),
    bench: (
      <Card title="PGA Tour Benchmarks" theme={T} right="vs. Your Filtered Average">
        {hasData ? (
          <table className="w-full text-sm">
            <thead><tr style={{color: T.textDim}}>
              <th className="text-left font-normal pb-1">Metric</th>
              <th className="text-right font-normal pb-1">PGA</th>
              <th className="text-right font-normal pb-1">Your</th>
            </tr></thead>
            <tbody>
              {pgaBenchmarks.map(r => (
                <tr key={r.metric} style={{borderTop: `1px solid ${T.border}`}}>
                  <td className="py-2">{r.metric}</td>
                  <td className="text-right py-2">{r.pga}</td>
                  <td className="text-right py-2">{r.your || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <NoData T={T} />}
      </Card>
    ),
    assessment: (
      <Card title="Assessment" theme={T}>
        {hasData ? (
          <div className="grid grid-cols-2 gap-3">
            <KpiCell 
              label="Virtual Handicap" 
              value={virtualHandicap ? virtualHandicap.toFixed(1) : 'N/A'} 
              sub={<button onClick={() => setHandicapModalOpen(true)} className="underline">What does this mean?</button>} 
            />
            <KpiCell 
              label="Gap Warnings" 
              value={gapWarnings.count.toString()} 
              sub={gapWarnings.clubs.size > 0 ? Array.from(gapWarnings.clubs).join(', ') : undefined} 
            />
            <KpiCell 
              label="Carry Index" 
              value={consistencyIndex ? (consistencyIndex * 100).toFixed(1) + '%' : 'N/A'} 
              sub={<button onClick={() => setCarryIndexModalOpen(true)} className="underline">What does this mean?</button>} 
            />
            <KpiCell 
              label="Consistency Index" 
              value={consistencyIndexPct ? (consistencyIndexPct * 100).toFixed(1) + '%' : 'N/A'}
              sub={<button onClick={() => setConsistencyModalOpen(true)} className="underline">What does this mean?</button>} 
            />
          </div>
        ) : <NoData T={T} />}
      </Card>
    ),
    swings: (
      <Card title="Main Swing Tendency" theme={T}>
        {mainSwingFault.title !== 'N/A' ? (
          <div>
            <div className="text-lg font-semibold">{mainSwingFault.title}</div>
            <div className="text-sm mt-1" style={{color: T.textDim}}>{mainSwingFault.advice}</div>
          </div>
        ) : <div className="text-sm" style={{color: T.textDim}}>Not enough shot data with Club Path and Club Face to determine a tendency.</div>}
      </Card>
    ),
    records: <div />, // placeholder for potential future use
    progress: <div />, // placeholder for potential future use
  };
  
  const orderedCards = insightsOrder.map(key => (
    <div key={key} draggable onDragStart={onDragStart(key)} onDragOver={onDragOver(key)} onDrop={onDrop(key)}>
      {cardMap[key]}
    </div>
  ));

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {orderedCards}
      </div>
      {isCarryIndexModalOpen && <CarryIndexInfoModal theme={T} onClose={() => setCarryIndexModalOpen(false)} />}
      {isConsistencyModalOpen && <ConsistencyInfoModal theme={T} onClose={() => setConsistencyModalOpen(false)} />}
      {isHandicapModalOpen && <HandicapInfoModal theme={T} onClose={() => setHandicapModalOpen(false)} />}
    </>
  );
}

const NoData = ({T}: {T: Theme}) => <div className="text-sm" style={{ color: T.textDim }}>Not enough data for this insight. Try different filters.</div>;

function CarryIndexInfoModal({ theme, onClose }: { theme: Theme, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background: "rgba(0,0,0,0.5)"}} onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border shadow-lg overflow-hidden" style={{background: theme.panel, borderColor: theme.border}} onClick={e => e.stopPropagation()}>
        <header className="p-3 flex items-center justify-between" style={{borderBottom: `1px solid ${theme.border}`, background: theme.panelAlt}}>
          <h3 className="font-semibold">Carry Index</h3>
          <button className="text-xs underline" style={{color: theme.brand}} onClick={onClose}>Close</button>
        </header>
        <div className="p-4 text-sm space-y-2">
          <p>This metric measures your carry distance consistency for each club.</p>
          <p>It is calculated by finding the standard deviation of your carry distance for a club, and dividing it by the average carry distance (Coefficient of Variation). The final score is <strong>(1 - CV)</strong>, expressed as a percentage.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>100%</strong> is perfect consistency (0 deviation).</li>
            <li><strong>95%+</strong> is Tour-level.</li>
            <li><strong>90%+</strong> is excellent.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ConsistencyInfoModal({ theme, onClose }: { theme: Theme, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background: "rgba(0,0,0,0.5)"}} onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border shadow-lg overflow-hidden" style={{background: theme.panel, borderColor: theme.border}} onClick={e => e.stopPropagation()}>
        <header className="p-3 flex items-center justify-between" style={{borderBottom: `1px solid ${theme.border}`, background: theme.panelAlt}}>
          <h3 className="font-semibold">Consistency Index</h3>
          <button className="text-xs underline" style={{color: theme.brand}} onClick={onClose}>Close</button>
        </header>
        <div className="p-4 text-sm space-y-2">
          <p>This metric measures the percentage of your shots that are considered "on target" or "playable."</p>
          <p>It is calculated by finding the percentage of shots that land within <strong>+/- 20 yards</strong> of the target line (i.e., have a Carry Deviation of 20 yards or less).</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Higher %:</strong> More consistent.</li>
            <li><strong>Lower %:</strong> Less consistent, more mishits.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function HandicapInfoModal({ theme, onClose }: { theme: Theme, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background: "rgba(0,0,0,0.5)"}} onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border shadow-lg overflow-hidden" style={{background: theme.panel, borderColor: theme.border}} onClick={e => e.stopPropagation()}>
        <header className="p-3 flex items-center justify-between" style={{borderBottom: `1px solid ${theme.border}`, background: theme.panelAlt}}>
          <h3 className="font-semibold">Virtual Handicap</h3>
          <button className="text-xs underline" style={{color: theme.brand}} onClick={onClose}>Close</button>
        </header>
        <div className="p-4 text-sm space-y-2">
          <p>This is an estimate of your handicap based on shot data consistency, not on score.</p>
          <p>It blends two factors:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Lateral Consistency (70%):</strong> The standard deviation of your lateral (left/right) dispersion.</li>
            <li><strong>Depth Consistency (30%):</strong> Your "Carry Index," which measures how consistently you hit your distances.</li>
          </ul>
          <p>A lower number indicates more consistent (i.e., "better") shot-making.</p>
        </div>
      </div>
    </div>
  );
}
