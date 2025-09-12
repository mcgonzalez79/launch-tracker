import React, { useMemo, useState } from "react";
import type { Theme } from "./theme";
import type { ScorecardData, HoleData } from "./utils";
import { Card } from "./components/UI";

type Props = {
  theme: Theme;
  data: ScorecardData;
  onUpdate: (data: ScorecardData) => void;
  savedRoundNames: string[];
  onSave: () => void;
  onLoad: (name: string) => void;
  onNew: () => void;
  onDelete: () => void;
  activeScorecardName: string | null;
  savedScorecards: Record<string, ScorecardData>;
};

const Td = ({ children, className = "", T }: { children: React.ReactNode; className?: string; T: Theme }) => (
  <td className={`p-0 border ${className}`} style={{ borderColor: T.border }}>{children}</td>
);
const Th = ({ children, className = "", T }: { children: React.ReactNode; className?: string; T: Theme }) => (
  <th className={`p-1 text-xs text-center font-normal border ${className}`} style={{ borderColor: T.border }}>{children}</th>
);
const Input = ({ value, onChange, placeholder = "" }: { value?: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; }) => (
  <input type="text" value={value || ""} onChange={onChange} placeholder={placeholder} className="w-full h-full p-1 bg-transparent text-center text-sm outline-none focus:bg-white focus:bg-opacity-10" />
);

const FairwayHitCell = ({ value, onChange, isEnabled }: { value?: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; isEnabled: boolean; }) => (
  <select value={value || ""} onChange={onChange} disabled={!isEnabled} className="w-full h-full p-1 bg-transparent text-center text-sm outline-none focus:bg-white focus:bg-opacity-10 disabled:opacity-50">
    <option value="">—</option>
    <option value="Yes">Yes</option>
    <option value="No">No</option>
  </select>
);

export default function ScorecardView({ theme: T, data, onUpdate, savedRoundNames, onSave, onLoad, onNew, onDelete, activeScorecardName, savedScorecards }: Props) {
  const [isFairwayModalOpen, setFairwayModalOpen] = useState(false);

  const handleHeader = (field: keyof ScorecardData['header'], value: string) => {
    onUpdate({ ...data, header: { ...data.header, [field]: value } });
  };
  const handleHole = (hole: number, field: keyof HoleData, value: string) => {
    onUpdate({ ...data, holes: { ...data.holes, [hole]: { ...data.holes[hole], [field]: value } } });
  };
  const handleNotes = (value: string) => {
    onUpdate({ ...data, notes: value });
  };


  const headerFields1 = [
    { label: "Date", key: "date" }, { label: "Players", key: "players" }, { label: "Location", key: "location" },
    { label: "Round", key: "round" }, { label: "Tees", key: "tees" }, { label: "Slope", key: "slope" },
  ] as const;
  const headerFields2 = [
    { label: "Time", key: "time" }, { label: "weather", key: "weather" }, { label: "Club", key: "club" },
    { label: "Course", key: "course" }, { label: "Yardage", key: "yardage" }, { label: "Rating", key: "rating" },
  ] as const;

  const holeFields = [
    { label: "Par", key: "par" }, { label: "Fairway Hit", key: "fairway" }, { label: "Putts", key: "putts" },
    { label: "Hazard", key: "hazard" }, { label: "Yardage", key: "yardage" }, { label: "Stroke", key: "stroke" },
  ] as const;

  const calculateRowTotal = (field: keyof HoleData, startHole: number, endHole: number) => {
    let total = 0;
    if (field === 'fairway') {
      for (let i = startHole; i <= endHole; i++) {
        if (data.holes[i]?.fairway === 'Yes') {
          total++;
        }
      }
    } else {
      for (let i = startHole; i <= endHole; i++) {
        const value = data.holes[i]?.[field];
        const num = Number(value);
        if (value && !isNaN(num)) {
          total += num;
        }
      }
    }
    return total;
  };

  const summaryValues = useMemo(() => {
    const holes = data.holes;
    let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0, teesPlayed = 0;

    for (let i = 1; i <= 18; i++) {
      const hole = holes[i];
      if (hole && hole.stroke && !isNaN(Number(hole.stroke))) {
        teesPlayed++;
        if (hole.par && !isNaN(Number(hole.par))) {
          const stroke = Number(hole.stroke);
          const par = Number(hole.par);
          const diff = stroke - par;
          if (diff === -2) eagles++;
          else if (diff === -1) birdies++;
          else if (diff === 0) pars++;
          else if (diff === 1) bogeys++;
          else if (diff === 2) doubles++;
        }
      }
    }

    const front9Strokes = calculateRowTotal('stroke', 1, 9);
    const back9Strokes = calculateRowTotal('stroke', 10, 18);
    const finalScore = front9Strokes + back9Strokes;

    const front9Putts = calculateRowTotal('putts', 1, 9);
    const back9Putts = calculateRowTotal('putts', 10, 18);
    const totalPutts = front9Putts + back9Putts;

    const str = (n: number) => n > 0 ? String(n) : "";

    return {
      finalScore: str(finalScore), eagles: str(eagles), birdies: str(birdies),
      par: str(pars), tees: str(teesPlayed), bogeys: str(bogeys),
      double: str(doubles), putts: str(totalPutts),
    };
  }, [data.holes]);
  
  const roundsReport = useMemo(() => {
    const sortedRounds = Object.values(savedScorecards)
      .filter(r => r.header.date)
      .sort((a, b) => new Date(b.header.date!).getTime() - new Date(a.header.date!).getTime())
      .slice(0, 5);

    if (sortedRounds.length === 0) return null;

    let totalStrokes = 0, totalPutts = 0, totalHazards = 0, totalFairwayAttempts = 0, totalFairwaysHit = 0;
    
    for (const round of sortedRounds) {
      let roundStrokes = 0;
      let roundPutts = 0;
      let roundHazards = 0;
      for (let i = 1; i <= 18; i++) {
        const hole = round.holes[i];
        if (hole) {
          const par = Number(hole.par);
          if (!isNaN(par)) {
            if (par === 4 || par === 5) {
              totalFairwayAttempts++;
              if (hole.fairway === 'Yes') totalFairwaysHit++;
            }
          }
          const strokes = Number(hole.stroke);
          if (!isNaN(strokes)) roundStrokes += strokes;

          const putts = Number(hole.putts);
          if (!isNaN(putts)) roundPutts += putts;
          
          const hazards = Number(hole.hazard);
          if (!isNaN(hazards)) roundHazards += hazards;
        }
      }
      totalStrokes += roundStrokes;
      totalPutts += roundPutts;
      totalHazards += roundHazards;
    }
    
    const avgScore = totalStrokes / sortedRounds.length;
    const avgPutts = totalPutts / sortedRounds.length;
    const avgHazards = totalHazards / sortedRounds.length;
    const fairwayPct = totalFairwayAttempts > 0 ? (totalFairwaysHit / totalFairwayAttempts) * 100 : 0;
    
    return {
      avgScore: avgScore.toFixed(1),
      fairwayPct: fairwayPct.toFixed(1) + '%',
      avgPutts: avgPutts.toFixed(1),
      avgHazards: avgHazards.toFixed(1)
    };
  }, [savedScorecards]);

  return (
    
      {roundsReport && (
        <div className="mb-4">
          <Card title="Rounds Report (Last 5)" theme={T}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCell theme={T} label="Avg Score" value={roundsReport.avgScore} />
              <KpiCell theme={T} label="Fairway Hit %" value={roundsReport.fairwayPct} sub={<button onClick={() => setFairwayModalOpen(true)} className="underline">View benchmarks</button>} />
              <KpiCell theme={T} label="Avg Putts" value={roundsReport.avgPutts} />
              <KpiCell theme={T} label="Avg Hazard Strokes" value={roundsReport.avgHazards} />
            </div>
          </Card>
        </div>
      )}
      <section className="rounded-xl border shadow-sm" style={{ background: T.panel, borderColor: T.border }}>
        <header
          className="px-4 py-2 rounded-t-xl"
          style={{ background: T.mode === 'light' ? '#dbe8e1' : T.panelAlt, borderBottom: `1px solid ${T.border}` }}
        >
          <div className="text-sm font-medium">Golf Log / Scorecard</div>
        </header>
        <div className="p-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button onClick={onNew} className="rounded-md px-3 py-1.5 border text-sm" style={{ background: T.panelAlt, borderColor: T.border }}>New Round</button>
            <button onClick={onSave} className="rounded-md px-3 py-1.5 border text-sm" style={{ background: T.brand, borderColor: T.brand, color: T.white }}>Save Round</button>
            <button
              onClick={onDelete}
              disabled={!activeScorecardName}
              className="rounded-md px-3 py-1.5 border text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: T.mode === 'light' ? '#dbe8e1' : "rgba(200,0,0,0.08)",
                borderColor: T.mode === 'light' ? '#dbe8e1' : "rgba(200,0,0,0.35)",
                color: T.text,
              }}
            >
              Delete Round
            </button>
            <select
              value=""
              onChange={(e) => { if (e.target.value) onLoad(e.target.value) }}
              className="ml-auto rounded-md px-2 py-1.5 border"
              style={{ background: T.bg, color: T.text, borderColor: T.border }}
            >
              <option value="">— Load a saved round —</option>
              {savedRoundNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          {/* Header Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 mb-4 text-sm">
            <div className="md:col-span-2 grid grid-cols-[80px_1fr] items-center gap-2">
              {headerFields1.map(f => (
                <React.Fragment key={f.key}>
                  <label className="text-right" style={{ color: T.textDim }}>{f.label}</label>
                  <input type="text" value={data.header[f.key] || ""} onChange={(e) => handleHeader(f.key, e.target.value)} className="w-full rounded px-2 py-1 border" style={{ background: T.bg, color: T.text, borderColor: T.border }} />
                </React.Fragment>
              ))}
            </div>
            <div className="md:col-span-2 grid grid-cols-[80px_1fr] items-center gap-2">
              {headerFields2.map(f => (
                <React.Fragment key={f.key}>
                  <label className="text-right" style={{ color: T.textDim }}>{f.label}</label>
                  <input type="text" value={data.header[f.key] || ""} onChange={(e) => handleHeader(f.key, e.target.value)} className="w-full rounded px-2 py-1 border" style={{ background: T.bg, color: T.text, borderColor: T.border }} />
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Holes Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs mb-4" style={{ borderColor: T.border }}>
              <thead>
                <tr style={{ background: T.panelAlt }}>
                  <Th T={T} className="w-20">Holes</Th>
                  {[...Array(9)].map((_, i) => <Th T={T} key={i}>{i + 1}</Th>)}
                  <Th T={T}>Total</Th>
                </tr>
              </thead>
              <tbody>
                {holeFields.map(field => (
                  <tr key={field.key}>
                    <td className="p-1 border text-center font-medium" style={{ borderColor: T.border }}>{field.label}</td>
                    {[...Array(9)].map((_, i) => (
                      <Td T={T} key={i}>
                        {field.key === 'fairway' ? (
                          <FairwayHitCell
                            value={data.holes[i+1]?.fairway}
                            onChange={(e) => handleHole(i + 1, 'fairway', e.target.value)}
                            isEnabled={Number(data.holes[i+1]?.par) === 4 || Number(data.holes[i+1]?.par) === 5}
                          />
                        ) : (
                          <Input value={data.holes[i+1]?.[field.key]} onChange={(e) => handleHole(i + 1, field.key, e.target.value)} />
                        )}
                      </Td>
                    ))}
                    <Td T={T}><div className="w-full h-full p-1 text-center text-sm">{calculateRowTotal(field.key, 1, 9) || '—'}</div></Td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="w-full border-collapse text-xs mb-4" style={{ borderColor: T.border }}>
              <thead>
                <tr style={{ background: T.panelAlt }}>
                  <Th T={T} className="w-20">Holes</Th>
                  {[...Array(9)].map((_, i) => <Th T={T} key={i}>{i + 10}</Th>)}
                  <Th T={T}>Total</Th>
                </tr>
              </thead>
              <tbody>
                {holeFields.map(field => (
                  <tr key={field.key}>
                    <td className="p-1 border text-center font-medium" style={{ borderColor: T.border }}>{field.label}</td>
                    {[...Array(9)].map((_, i) => (
                      <Td T={T} key={i}>
                        {field.key === 'fairway' ? (
                          <FairwayHitCell
                            value={data.holes[i+10]?.fairway}
                            onChange={(e) => handleHole(i + 10, 'fairway', e.target.value)}
                            isEnabled={Number(data.holes[i+10]?.par) === 4 || Number(data.holes[i+10]?.par) === 5}
                          />
                        ) : (
                          <Input value={data.holes[i+10]?.[field.key]} onChange={(e) => handleHole(i + 10, field.key, e.target.value)} />
                        )}
                      </Td>
                    ))}
                    <Td T={T}><div className="w-full h-full p-1 text-center text-sm">{calculateRowTotal(field.key, 10, 18) || '—'}</div></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <table className="w-full border-collapse text-xs" style={{ borderColor: T.border }}>
            <thead>
              <tr style={{ background: T.panelAlt }}>
                {["Final Score", "Eagles", "Birdies", "Par", "Tees", "Bogeys", "Double", "Putts"].map(h => <Th T={T} key={h}>{h}</Th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td T={T}><div className="w-full h-full p-1 text-center text-sm">{summaryValues.finalScore || '—'}</div></Td>
                <Td T={T}><div className="w-full h-full p-1 text-center text-sm">{summaryValues.eagles || '—'}</div></Td>
                <Td T={T}><div className="w-full h-full p-1 text-center text-sm">{summaryValues.birdies || '—'}</div></Td>
                <Td T={T}><div className="w-full h-full p-1 text-center text-sm">{summaryValues.par || '—'}</div></Td>
                <Td T={T}><div className="w-full h-full p-1 text-center text-sm">{summaryValues.tees || '—'}</div></Td>
                <Td T={T}><div className="w-full h-full p-1 text-center text-sm">{summaryValues.bogeys || '—'}</div></Td>
                <Td T={T}><div className="w-full h-full p-1 text-center text-sm">{summaryValues.double || '—'}</div></Td>
                <Td T={T}><div className="w-full h-full p-1 text-center text-sm">{summaryValues.putts || '—'}</div></Td>
              </tr>
            </tbody>
          </table>

          {/* Notes */}
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1" style={{ color: T.textDim }}>Round Notes</label>
            <textarea
              value={data.notes || ""}
              onChange={(e) => handleNotes(e.target.value)}
              rows={4}
              className="w-full rounded p-2 border text-sm"
              style={{ background: T.bg, color: T.text, borderColor: T.border }}
            />
          </div>
        </div>
      </section>
      {isFairwayModalOpen && <FairwayBenchmarkModal theme={T} onClose={() => setFairwayModalOpen(false)} />}
    </>
  );
}

function FairwayBenchmarkModal({ theme, onClose }: { theme: Theme, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background: "rgba(0,0,0,0.5)"}} onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border shadow-lg overflow-hidden" style={{background: theme.panel, borderColor: theme.border}} onClick={e => e.stopPropagation()}>
        <header className="p-3 flex items-center justify-between" style={{borderBottom: `1px solid ${theme.border}`, background: theme.panelAlt}}>
          <h3 className="font-semibold">Fairway Hit % Benchmarks</h3>
          <button className="text-xs underline" style={{color: theme.brand}} onClick={onClose}>Close</button>
        </header>
        <div className="p-4 text-sm space-y-2">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>PGA Tour:</strong> 70% or more</li>
            <li><strong>Advanced:</strong> 60-70%</li>
            <li><strong>Average:</strong> 50-60%</li>
            <li><strong>Beginner:</strong> ~50% or less</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function KpiCell({
  label, value, sub, theme: T
}: { label: string; value: string; sub?: React.ReactNode; theme: Theme; }) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{ background: T.panelAlt, borderColor: T.border }}
      onMouseOver={(e) => { if (T.mode === 'light') e.currentTarget.style.backgroundColor = '#dbe8e1'; }}
      onMouseOut={(e) => { e.currentTarget.style.backgroundColor = T.panelAlt; }}
    >
      <div className="text-xs mb-1" style={{ color: T.textDim }}>{label}</div>
      <div className="text-2xl font-semibold" style={{ color: T.text }}>{value}</div>
      {sub ? <div className="text-xs mt-1" style={{ color: T.textDim }}>{sub}</div> : null}
    </div>
  );
}
