import React, { forwardRef, useRef } from "react";
import { Theme, clubPalette, colorForClub } from "./theme";
import { Shot } from "./utils";
import { Card } from "./components/UI";

type Props = {
  theme: Theme;
  shots: Shot[];
  sessions: string[];
  clubs: string[];
  selectedClubs: string[];
  setSelectedClubs: (v: string[]) => void;

  sessionFilter: string;
  setSessionFilter: (v: string) => void;

  excludeOutliers: boolean;
  setExcludeOutliers: (v: boolean) => void;

  dateFrom: string; dateTo: string;
  setDateFrom: (v: string) => void; setDateTo: (v: string) => void;

  carryMin: string; carryMax: string;
  setCarryMin: (v: string) => void; setCarryMax: (v: string) => void;
  carryBounds: { min: number; max: number };

  onImportFile: (file: File) => void;
  onLoadSample: () => void;
  onExportCSV: () => void;
  onPrintClubAverages: () => void;

  onDeleteSession: () => void;
  onDeleteAll: () => void;
};

const FiltersPanel = forwardRef<HTMLDivElement, Props>(function FiltersPanel(props, ref) {
  const {
    theme: T, sessions, clubs, selectedClubs, setSelectedClubs,
    sessionFilter, setSessionFilter,
    excludeOutliers, setExcludeOutliers,
    dateFrom, dateTo, setDateFrom, setDateTo,
    carryMin, carryMax, setCarryMin, setCarryMax, carryBounds,
    onImportFile, onLoadSample, onExportCSV, onPrintClubAverages,
    onDeleteSession, onDeleteAll
  } = props;

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div ref={ref}>
      <Card theme={T} title="Filters">
        {/* Import */}
        <div className="mb-4">
          <label className="text-sm font-medium block mb-2" style={{ color: T.text }}>Import</label>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
                 onChange={(e) => { const f=e.target.files?.[0]; if(f) onImportFile(f); e.currentTarget.value=""; }}
                 className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: T.brand, color: "#fff", border: `1px solid ${T.brand}` }}>
            Import file
          </button>
        </div>

        {/* Session */}
        <div className="mb-3">
          <label className="text-sm font-medium block mb-2" style={{ color: T.text }}>Session</label>
          <div className="flex gap-2">
            <select value={sessionFilter} onChange={(e)=>setSessionFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, background: T.panel, color: T.text }}>
              {sessions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: T.border, color: "#B91C1C", background: T.panel }}
                    onClick={onDeleteSession} disabled={sessionFilter==="ALL"} title="Delete selected session">
              Delete
            </button>
          </div>
        </div>

        {/* Clubs vertical */}
        <div className="mb-5">
          <label className="text-sm font-medium block mb-2" style={{ color: T.text }}>Clubs</label>
          <div className="flex flex-col gap-2">
            {clubs.map((opt) => {
              const active = selectedClubs.includes(opt);
              const color = colorForClub(opt, clubs, clubPalette);
              return (
                <label
                  key={opt}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer"
                  role="button"
                  aria-pressed={active}
                  style={{ borderColor: active ? color : T.border, background: T.panel, color: T.text, outline: active ? `2px solid ${color}` : undefined }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 inline-block rounded-full" style={{ background: color }} />
                    <span className="text-sm">{opt}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => setSelectedClubs(active ? selectedClubs.filter(s => s !== opt) : [...selectedClubs, opt])}
                  />
                </label>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: T.border, color: T.brand, background: T.panel }}
                    onClick={() => setSelectedClubs(clubs)} disabled={!clubs.length}>Select all</button>
            <button className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: T.border, color: T.text, background: T.panel }}
                    onClick={() => setSelectedClubs([])} disabled={!selectedClubs.length}>Clear</button>
          </div>
        </div>

        {/* Carry range */}
        <div className="mb-5">
          <label className="text-sm font-medium block mb-2" style={{ color: T.text }}>Carry Distance Range (yds)</label>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" placeholder={carryBounds.min?String(carryBounds.min):"min"} value={carryMin}
                   onChange={(e)=>setCarryMin(e.target.value)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, background: T.panel, color: T.text }} />
            <input type="number" placeholder={carryBounds.max?String(carryBounds.max):"max"} value={carryMax}
                   onChange={(e)=>setCarryMax(e.target.value)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, background: T.panel, color: T.text }} />
          </div>
          <div className="mt-2">
            <button onClick={()=>{setCarryMin(""); setCarryMax("");}} className="px-2 py-1 text-xs rounded-md border"
                    style={{ borderColor: T.border, color: T.text, background: T.panel }}>
              Reset range
            </button>
          </div>
        </div>

        {/* Outliers + Dates */}
        <div className="mb-4 flex items-center justify-between">
          <label className="text-sm font-medium" style={{ color: T.text }}>Exclude outliers (IQR per club)</label>
          <input type="checkbox" checked={excludeOutliers} onChange={(e)=>setExcludeOutliers(e.target.checked)} />
        </div>
        <div className="mb-6">
          <label className="text-sm font-medium block" style={{ color: T.text }}>Date range</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)}
                   className="px-2 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, background: T.panel, color: T.text }} />
            <input type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)}
                   className="px-2 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, background: T.panel, color: T.text }} />
          </div>
          <div className="mt-2 flex gap-2">
            {[
              { label: "Last 7d", days: 7 },
              { label: "Last 30d", days: 30 },
              { label: "YTD", days: 366 },
            ].map(({label, days}) => (
              <button key={label} onClick={() => {
                const end = new Date(); const start = new Date(); start.setDate(end.getDate() - days);
                const fmt = (d: Date) => d.toISOString().slice(0,10);
                setDateFrom(fmt(start)); setDateTo(fmt(end));
              }} className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: T.border, color: T.text, background: T.panel }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="mb-6 grid grid-cols-2 gap-2">
          <button className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: T.border, color: T.text, background: T.panel }} onClick={onLoadSample}>Load sample</button>
          <button className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: T.border, color: T.text, background: T.panel }} onClick={onExportCSV}>Export CSV</button>
          <button className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: T.border, color: T.text, background: T.panel }} onClick={onPrintClubAverages}>Print Averages</button>
          <button className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: T.border, color: "#B91C1C", background: T.panel }} onClick={onDeleteAll}>Delete All</button>
        </div>
      </Card>
    </div>
  );
});

export default FiltersPanel;
