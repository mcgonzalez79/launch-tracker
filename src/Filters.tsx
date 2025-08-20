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
    shots,
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

  const onPickRange = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (days - 1));
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

  const sortedClubs = useMemo(() => [...(clubs ?? [])], [clubs]);

  const toggleClub = (c: string) => {
    const set = new Set(selectedClubs ?? []);
    if (set.has(c)) set.delete(c); else set.add(c);
    setSelectedClubs([...set]);
  };
  const clearClubs = () => setSelectedClubs([]);
  const selectAllClubs = () => setSelectedClubs(sortedClubs);

  return (
    <aside
      className="filters-panel rounded-xl overflow-hidden"
      style={{ background: T.panel, color: T.text, border: `1px solid ${T.border}` }}
    >
      <header
        className="px-4 py-2 rounded-t-xl"
        style={{ background: T.panelAlt, borderBottom: `1px solid ${T.border}`, color: T.text }}
      >
        <div className="text-sm font-medium">Filters</div>
      </header>

      <div className="p-4 sidebar-fix">
        {/* 1) Session (full width) */}
        <label className="text-xs block mb-1" style={{ color: T.textDim }}>Session</label>
        <select
          className="w-full rounded-md px-2 py-1 border mb-3"
          style={{ background: T.bg, color: T.text, borderColor: T.border }}
          value={sessionFilter}
          onChange={(e) => setSessionFilter(e.target.value)}
        >
          {sessions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* 2) Load Sample / Import (full width buttons) */}
        <div className="grid grid-cols-1 gap-2 mb-3">
          <button
            className="w-full rounded-md px-3 py-2 border text-sm"
            style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
            onClick={onLoadSample}
          >
            Load Sample
          </button>
          <button
            className="w-full rounded-md px-3 py-2 border text-sm"
            style={{ background: T.brand, borderColor: T.brand, color: T.white }}
            onClick={onImportClick}
          >
            Import File
          </button>
        </div>

        {/* 3) Date range (same row) + 4) Quick selects */}
        <div className="mb-3">
          <label className="text-xs block mb-1" style={{ color: T.textDim }}>Date range</label>

          {/* single-row, responsive, no overflow */}
          <div
            className="grid items-center gap-2"
            style={{ gridTemplateColumns: "1fr auto 1fr" }}
          >
            <input
              type="date"
              className="rounded-md px-2 py-1 border w-full min-w-0"
              style={{ background: T.bg, color: T.text, borderColor: T.border }}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <span className="text-xs" style={{ color: T.textDim }}>to</span>
            <input
              type="date"
              className="rounded-md px-2 py-1 border w-full min-w-0"
              style={{ background: T.bg, color: T.text, borderColor: T.border }}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <QuickBtn label="7d" onClick={() => onPickRange(7)} T={T} />
            <QuickBtn label="30d" onClick={() => onPickRange(30)} T={T} />
            <QuickBtn label="90d" onClick={() => onPickRange(90)} T={T} />
            <button
              className="ml-auto text-xs underline underline-offset-2"
              style={{ color: T.textDim }}
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              title="Clear date range"
            >
              Clear
            </button>
          </div>
        </div>

        {/* 5) Exclude outliers checkbox row */}
        <div className="mb-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="rounded-sm"
              checked={excludeOutliers}
              onChange={(e) => setExcludeOutliers(e.target.checked)}
            />
            <span>Exclude outliers</span>
          </label>
        </div>

        {/* 6) Clubs */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs" style={{ color: T.textDim }}>Clubs</label>
            {hasClubs && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  className="underline underline-offset-2"
                  style={{ color: T.textDim }}
                  onClick={selectAllClubs}
                  title="Select all"
                >
                  All
                </button>
                <span aria-hidden style={{ color: T.textDim }}>•</span>
                <button
                  className="underline underline-offset-2"
                  style={{ color: T.textDim }}
                  onClick={clearClubs}
                  title="Clear"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {hasClubs ? (
            <div className="grid grid-cols-2 gap-2">
              {sortedClubs.map((c) => {
                const active = selectedClubs?.includes(c);
                return (
                  <button
                    key={c}
                    className="rounded-md px-2 py-1 text-xs border text-left"
                    style={{
                      background: active ? T.brand : T.panelAlt,
                      color: active ? T.white : T.text,
                      borderColor: active ? T.brand : T.border,
                    }}
                    onClick={() => toggleClub(c)}
                    title={active ? "Selected" : "Click to select"}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-xs" style={{ color: T.textDim }}>
              No clubs yet — import some shots to see club filters.
            </div>
          )}
        </div>

        {/* 3b) Carry distance range — below Clubs */}
        <div className="mb-3">
          <label className="text-xs block mb-1" style={{ color: T.textDim }}>
            Carry distance range (yds)
          </label>

          <div
            className="grid items-center gap-2"
            style={{ gridTemplateColumns: "1fr auto 1fr" }}
          >
            <input
              type="number"
              inputMode="decimal"
              className="rounded-md px-2 py-1 border w-full min-w-0"
              style={{ background: T.bg, color: T.text, borderColor: T.border }}
              placeholder={Number.isFinite(carryBounds.min) ? String(carryBounds.min) : "min"}
              value={carryMin}
              onChange={(e) => setCarryMin(e.target.value)}
            />
            <span className="text-xs" style={{ color: T.textDim }}>to</span>
            <input
              type="number"
              inputMode="decimal"
              className="rounded-md px-2 py-1 border w-full min-w-0"
              style={{ background: T.bg, color: T.text, borderColor: T.border }}
              placeholder={Number.isFinite(carryBounds.max) ? String(carryBounds.max) : "max"}
              value={carryMax}
              onChange={(e) => setCarryMax(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs" style={{ color: T.textDim }}>
              Bounds: {Number.isFinite(carryBounds.min) ? carryBounds.min : "—"}–{Number.isFinite(carryBounds.max) ? carryBounds.max : "—"} yds
            </span>
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

        {/* 9) Delete controls (row) */}
        <div className="flex items-center gap-2 mt-2">
          <button
            className="w-1/2 rounded-md px-3 py-2 border text-sm"
            style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
            onClick={onDeleteSession}
            title="Delete selected session"
          >
            Delete Session
          </button>
          <button
            className="w-1/2 rounded-md px-3 py-2 border text-sm"
            style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
            onClick={onDeleteAll}
            title="Delete all shots"
          >
            Delete All
          </button>
        </div>
      </div>
    </aside>
  );
}

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
