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

  return (
    <section
      className="rounded-xl border shadow-sm"
      style={{ background: T.panel, color: T.text, borderColor: T.border }}
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

        {/* 3) Date range (one row) + 4) Quick selects */}
        <div className="mb-3">
          <label className="text-xs block mb-1" style={{ color: T.textDim }}>Date range</label>
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

        {/* 5) Exclude outliers */}
        <div
          className="mb-3 rounded-md px-2 py-2 border"
          style={{ background: T.panelAlt, borderColor: T.border }}
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
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
              {clubs.map((c) => {
                const selected = selectedClubs.includes(c);
                return (
                  <button
                    key={c}
                    className="rounded-md px-2 py-1 border text-xs text-left"
                    style={{
                      background: selected ? T.brandMuted : T.panelAlt,
                      color: T.text,
                      borderColor: selected ? T.brand : T.border,
                    }}
                    onClick={() => toggleClub(c)}
                    title={c}
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
            style={{
              background: "rgba(200,0,0,0.08)",
              borderColor: "rgba(200,0,0,0.35)",
              color: T.text,
            }}
            onClick={onDeleteSession}
            title="Delete current session"
          >
            Delete Session
          </button>
          <button
            className="rounded-md px-3 py-2 border text-sm"
            style={{
              background: "rgba(200,0,0,0.12)",
              borderColor: "rgba(200,0,0,0.45)",
              color: T.text,
            }}
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
