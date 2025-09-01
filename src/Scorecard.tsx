import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { ScorecardData, HoleData } from "./utils";

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

export default function ScorecardView({ theme: T, data, onUpdate, savedRoundNames, onSave, onLoad, onNew, onDelete, activeScorecardName }: Props) {
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
    { label: "Par", key: "par" }, { label: "Fairway", key: "fairway" }, { label: "Putts", key: "putts" },
    { label: "Hazard", key: "hazard" }, { label: "Yardage", key: "yardage" }, { label: "Stroke", key: "stroke" },
  ] as const;

  const calculateRowTotal = (field: keyof HoleData, startHole: number, endHole: number) => {
    let total = 0;
    for (let i = startHole; i <= endHole; i++) {
      const value = data.holes[i]?.[field];
      const num = Number(value);
      if (value && !isNaN(num)) {
        total += num;
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


  return (
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
                    <Td T={T} key={i}><Input value={data.holes[i+1]?.[field.key]} onChange={(e) => handleHole(i + 1, field.key, e.target.value)} /></Td>
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
                    <Td T={T} key={i}><Input value={data.holes[i+10]?.[field.key]} onChange={(e) => handleHole(i + 10, field.key, e.target.value)} /></Td>
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
  );
}
