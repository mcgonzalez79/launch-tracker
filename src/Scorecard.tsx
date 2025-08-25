import React from "react";
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

const Td = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <td className={`p-0 border ${className}`}>{children}</td>
);
const Th = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <th className={`p-1 text-xs text-center font-normal border ${className}`}>{children}</th>
);
const Input = ({ value, onChange, placeholder = "" }: { value?: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; }) => (
  <input type="text" value={value || ""} onChange={onChange} placeholder={placeholder} className="w-full h-full p-1 bg-transparent text-center text-sm outline-none focus:bg-white focus:bg-opacity-10" />
);
const TotalCell = () => (
  <div className="w-full h-full p-1 text-center text-sm">—</div>
);

export default function ScorecardView({ theme: T, data, onUpdate, savedRoundNames, onSave, onLoad, onNew, onDelete, activeScorecardName }: Props) {
  const handleHeader = (field: keyof ScorecardData['header'], value: string) => {
    onUpdate({ ...data, header: { ...data.header, [field]: value } });
  };
  const handleHole = (hole: number, field: keyof HoleData, value: string) => {
    onUpdate({ ...data, holes: { ...data.holes, [hole]: { ...data.holes[hole], [field]: value } } });
  };
  const handleSummary = (field: keyof ScorecardData['summary'], value: string) => {
    onUpdate({ ...data, summary: { ...data.summary, [field]: value } });
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


  return (
    <section className="rounded-xl border shadow-sm" style={{ background: T.panel, borderColor: T.border }}>
      <header
        className="px-4 py-2 rounded-t-xl"
        style={{ background: T.panelAlt, borderBottom: `1px solid ${T.border}` }}
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
                <Th className="w-20">Holes</Th>
                {[...Array(9)].map((_, i) => <Th key={i}>{i + 1}</Th>)}
                <Th>Total</Th>
              </tr>
            </thead>
            <tbody>
              {holeFields.map(field => (
                <tr key={field.key}>
                  <td className="p-1 border text-center font-medium" style={{ borderColor: T.border }}>{field.label}</td>
                  {[...Array(9)].map((_, i) => (
                    <Td key={i}><Input value={data.holes[i+1]?.[field.key]} onChange={(e) => handleHole(i + 1, field.key, e.target.value)} /></Td>
                  ))}
                  <Td><TotalCell /></Td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="w-full border-collapse text-xs mb-4" style={{ borderColor: T.border }}>
            <thead>
              <tr style={{ background: T.panelAlt }}>
                <Th className="w-20">Holes</Th>
                {[...Array(9)].map((_, i) => <Th key={i}>{i + 10}</Th>)}
                <Th>Total</Th>
              </tr>
            </thead>
            <tbody>
              {holeFields.map(field => (
                <tr key={field.key}>
                  <td className="p-1 border text-center font-medium" style={{ borderColor: T.border }}>{field.label}</td>
                  {[...Array(9)].map((_, i) => (
                    <Td key={i}><Input value={data.holes[i+10]?.[field.key]} onChange={(e) => handleHole(i + 10, field.key, e.target.value)} /></Td>
                  ))}
                  <Td><TotalCell /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <table className="w-full border-collapse text-xs" style={{ borderColor: T.border }}>
          <thead>
            <tr style={{ background: T.panelAlt }}>
              {["Final Score", "Eagles", "Birdies", "Par", "Tees", "Bogeys", "Double", "Putts"].map(h => <Th key={h}>{h}</Th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td><Input value={data.summary.finalScore} onChange={e => handleSummary("finalScore", e.target.value)} /></Td>
              <Td><Input value={data.summary.eagles} onChange={e => handleSummary("eagles", e.target.value)} /></Td>
              <Td><Input value={data.summary.birdies} onChange={e => handleSummary("birdies", e.target.value)} /></Td>
              <Td><Input value={data.summary.par} onChange={e => handleSummary("par", e.target.value)} /></Td>
              <Td><Input value={data.summary.tees} onChange={e => handleSummary("tees", e.target.value)} /></Td>
              <Td><Input value={data.summary.bogeys} onChange={e => handleSummary("bogeys", e.target.value)} /></Td>
              <Td><Input value={data.summary.double} onChange={e => handleSummary("double", e.target.value)} /></Td>
              <Td><Input value={data.summary.putts} onChange={e => handleSummary("putts", e.target.value)} /></Td>
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
