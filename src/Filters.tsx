import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { Shot } from "./utils";

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

  dateFrom: string; // ISO yyyy-mm-dd
  dateTo: string;   // ISO yyyy-mm-dd
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;

  carryMin: string;
  carryMax: string;
  setCarryMin: (v: string) => void;
  setCarryMax: (v: string) => void;
  carryBounds: { min: number; max: number };

  onImportFile: (file: File) => void;
  onLoadSample: () => void;
  onExportCSV: () => void;
  onPrintClubAverages: () => void;
  onDeleteSession: () => void;
  onDeleteAll: () => void;
};

export default function FiltersPanel(props: Props) {
  const {
    theme: T,
    sessions,
    clubs,
    selectedClubs,
    setSelectedClubs,
    sessionFilter,
    setSessionFilter,
    excludeOutliers,
    setExcludeOutliers,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    carryMin,
    carryMax,
    setCarryMin,
    setCarryMax,
    carryBounds,
    onImportFile,
    onLoadSample,
    onExportCSV,
    onPrintClubAverages,
    onDeleteSession,
    onDeleteAll,
  } = props;

  const hasClubs = clubs && clubs.length > 0;
  const hasSessions = sessions && sessions.length > 0;

  const allSelected = useMemo(
    () => selectedClubs.length > 0 && selectedClubs.length === clubs.length,
    [selectedClubs, clubs]
  );

  const toggleClub = (c: string) => {
    if (selectedClubs.includes(c)) {
      setSelectedClubs(selectedClubs.filter(x => x !== c));
    } else {
      setSelectedClubs([...selectedClubs, c]);
    }
  };

  const selectAllClubs = () => setSelectedClubs(clubs.slice());
  const clearClubs = () => setSelectedClubs([]);

  const quickRange = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    setDateFrom(iso(from));
    setDateTo(iso(to));
  };

  const onImportClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.csv";
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (file) onImportFile(file);
    };
    input.click();
  };

  return (
    <section className="rounded-xl border" style={{ background: T.panel, borderColor: T.border, color: T.text }}>
      <div className="p-3">
        {/* 1) Session filter (full width) */}
        <div className="mb-3">
          <label className="text-xs block mb-1" style={{ color: T.textDim }}>Session</label>
          <select
            className="w-full rounded-md px-2 py-2 border text-sm"
            style={{ background: T.bg, color: T.text, borderColor: T.border }}
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
          >
            <option value="ALL">All Sessions</option>
            {hasSessions && sessions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* 2) Actions: Load sample + Import (full width) */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            className="rounded-md px-3 py-2 border text-sm"
            style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
            onClick={onLoadSample}
          >
            Load Sample
          </button>
          <button
            className="rounded-md px-3 py-2 border text-sm"
            style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
            onClick={onImportClick}
          >
            Import File
          </button>
        </div>

        {/* 3) Date range row + quick picks */}
        <div className="mb-3">
          <label className="text-xs block mb-1" style={{ color: T.textDim }}>Date Range</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="rounded-md px-2 py-1 border flex-1"
              style={{ background: T.bg, color: T.text, borderColor: T.border }}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <span className="text-xs" style={{ color: T.textDim }}>to</span>
            <input
              type="date"
              className="rounded-md px-2 py-1 border flex-1"
              style={{ background: T.bg, color: T.text, borderColor: T.border }}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <QuickBtn label="7d" onClick={() => quickRange(7)} T={T} />
            <QuickBtn label="30d" onClick={() => quickRange(30)} T={T} />
            <QuickBtn label="90d" onClick={() => quickRange(90)} T={T} />
          </div>
        </div>

        {/* 4) Exclude outliers */}
        <div className="mb-3 flex items-center gap-2">
          <input id="excludeOutliers" type="checkbox" className="h-4 w-4" checked={excludeOutliers} onChange={(e) => setExcludeOutliers(e.target.checked)} />
          <label htmlFor="excludeOutliers" className="text-sm" style={{ color: T.text }}>Exclude outliers</label>
        </div>

        {/* 5) Clubs multi-select */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <label className="text-xs" style={{ color: T.textDim }}>Clubs</label>
            <button className="ml-auto text-xs underline" style={{ color: T.textDim }} onClick={selectAllClubs}>Select all</button>
            <button className="text-xs underline" style={{ color: T.textDim }} onClick={clearClubs}>Clear</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {hasClubs && clubs.map(c => (
              <label key={c} className="flex items-center gap-2 rounded-md px-2 py-2 border"
                     style={{ background: selectedClubs.includes(c) ? T.panelAlt : T.panel, borderColor: T.border }}>
                <input type="checkbox" checked={selectedClubs.includes(c)} onChange={() => toggleClub(c)} />
                <span className="text-sm">{c}</span>
              </label>
            ))}
          </div>
          {allSelected && (
            <div className="mt-1 text-xs" style={{ color: T.textDim }}>All clubs selected</div>
          )}
        </div>

        {/* 6) Carry distance range */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <label className="text-xs" style={{ color: T.textDim }}>Carry Distance (yds)</label>
            <span className="ml-auto text-xs" style={{ color: T.textDim }}>Bounds: {Number.isFinite(carryBounds.min) ? carryBounds.min : "—"}–{Number.isFinite(carryBounds.max) ? carryBounds.max : "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              className="rounded-md px-2 py-1 border"
              style={{ background: T.bg, color: T.text, borderColor: T.border, width: "50%" }}
              placeholder={Number.isFinite(carryBounds.min) ? String(carryBounds.min) : "min"}
              value={carryMin}
              onChange={(e) => setCarryMin(e.target.value)}
            />
            <span className="text-xs" style={{ color: T.textDim }}>to</span>
            <input
              type="number"
              inputMode="decimal"
              className="rounded-md px-2 py-1 border"
              style={{ background: T.bg, color: T.text, borderColor: T.border, width: "50%" }}
              placeholder={Number.isFinite(carryBounds.max) ? String(carryBounds.max) : "max"}
              value={carryMax}
              onChange={(e) => setCarryMax(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              className="ml-auto text-xs underline underline-offset-2"
              style={{ color: T.textDim }}
              onClick={() => { setCarryMin(""); setCarryMax(""); }}
              title="Clear carry range"
            >
              Clear
            </button>
          </div>
        </div>

        {/* 7) Print club averages (full width) */}
        <button
          className="w-full rounded-md px-3 py-2 border text-sm mb-2"
          style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
          onClick={onPrintClubAverages}
        >
          Print Club Averages
        </button>

        {/* 8) Export CSV (full width) */}
        <button
          className="w-full rounded-md px-3 py-2 border text-sm mb-2"
          style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
          onClick={onExportCSV}
        >
          Export CSV
        </button>

        {/* 9) Delete row: Session + All */}
        <div className="grid grid-cols-2 gap-2">
          <button
            className="rounded-md px-3 py-2 border text-sm"
            style={{ background: "#c5c8df", borderColor: T.border, color: T.text }}
            onClick={onDeleteSession}
            title="Delete current session"
          >
            Delete Session
          </button>
          <button
            className="rounded-md px-3 py-2 border text-sm"
            style={{ background: "#c5c8df", borderColor: T.border, color: T.text }}
            onClick={onDeleteAll}
            title="Delete all shots"
          >
            Delete All
          </button>
        </div>
      </div>
    </section>
  );
}

/* ----- little quick-range pill ----- */
function QuickBtn({ label, onClick, T }: { label: string; onClick: () => void; T: Theme }) {
  return (
    <button
      className="rounded-md px-2 py-1 text-xs border"
      style={{ background: T.panelAlt, color: T.text, borderColor: T.border }}
      onClick={onClick}
      title={`Last ${label}`}
      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = T.panel)}
      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = T.panelAlt)}
    >
      {label}
    </button>
  );
}
