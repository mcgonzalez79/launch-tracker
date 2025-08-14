import React, { useMemo, useRef } from "react";
import { Theme } from "./theme";

type SessionLite = { id: string; name: string };

type Props = {
  theme: Theme;

  // Data/session context
  sessions: SessionLite[];                   // array with { id, name }
  selectedSessionId: string | "ALL";
  setSelectedSessionId: (v: string | "ALL") => void;

  // Clubs
  clubs: string[];
  selectedClubs: string[];
  setSelectedClubs: (v: string[]) => void;

  // Filters
  excludeOutliers: boolean;
  setExcludeOutliers: (v: boolean) => void;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  carryMin: string;                          // App passes strings (converted internally)
  carryMax: string;
  setCarryMin: (v: string) => void;
  setCarryMax: (v: string) => void;

  // Actions
  onImportFiles: (files: FileList | null) => void;
  onDeleteSession: (id: string) => void;
  onDeleteAll: () => void;
  onExportCsv: () => void;
  onLoadSample: () => void;

  // Helpers
  onSelectAllClubs: () => void;
};

const FiltersPanel = React.forwardRef<HTMLDivElement, Props>(function FiltersPanel(
  {
    theme,
    sessions,
    selectedSessionId,
    setSelectedSessionId,
    clubs,
    selectedClubs,
    setSelectedClubs,
    excludeOutliers,
    setExcludeOutliers,
    dateFrom, dateTo, setDateFrom, setDateTo,
    carryMin, carryMax, setCarryMin, setCarryMax,
    onImportFiles, onDeleteSession, onDeleteAll, onExportCsv, onLoadSample,
    onSelectAllClubs,
  },
  ref
) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sorted unique clubs are already provided from App; make quick helpers:
  const toggleClub = (club: string) => {
    const active = selectedClubs.includes(club);
    setSelectedClubs(active ? selectedClubs.filter(c => c !== club) : [...selectedClubs, club]);
  };

  const sessionOptions = useMemo(
    () => [{ id: "ALL", name: "All Sessions" }, ...sessions],
    [sessions]
  );

  return (
    <div ref={ref} className="rounded-2xl p-4 shadow" style={{ background: theme.cardBg, color: theme.text }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-wide">Filters</h2>
        <div className="h-1 rounded-full w-20" style={{ background: theme.brand }} />
      </div>

      {/* Import */}
      <div className="mb-4">
        <label className="text-sm font-medium block mb-2">Import</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          className="hidden"
          onChange={(e) => {
            onImportFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full px-3 py-2 rounded-lg font-medium"
          style={{ background: "#10b981", color: "#ffffff", border: `1px solid ${theme.border}` }}
          title="Import CSV/XLSX"
        >
          Import file(s)
        </button>
      </div>

      {/* Session picker */}
      <div className="mb-4">
        <label className="text-sm font-medium block mb-1">Session</label>
        <select
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{ borderColor: theme.border, background: "#fff", color: "#111827" }}
          value={selectedSessionId}
          onChange={(e) => setSelectedSessionId(e.target.value as any)}
        >
          {sessionOptions.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {selectedSessionId !== "ALL" && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => typeof selectedSessionId === "string" && onDeleteSession(selectedSessionId)}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: "#fee2e2", color: "#991b1b", border: `1px solid ${theme.border}` }}
            >
              Delete this session
            </button>
          </div>
        )}
      </div>

      {/* Clubs (vertical list) */}
      <div className="mb-4">
        <label className="text-sm font-medium block mb-2">Clubs</label>
        <div className="flex flex-col gap-2 max-h-64 overflow-auto pr-1">
          {clubs.map((club) => {
            const active = selectedClubs.includes(club);
            return (
              <label key={club} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleClub(club)}
                />
                <span>{club}</span>
              </label>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={onSelectAllClubs}
            className="px-2 py-1 rounded-md text-xs border"
            style={{ borderColor: theme.border, background: "#fff", color: "#111827" }}
          >
            Select all
          </button>
          <button
            onClick={() => setSelectedClubs([])}
            className="px-2 py-1 rounded-md text-xs border"
            style={{ borderColor: theme.border, background: "#fff", color: "#111827" }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Outliers */}
      <div className="mb-4 flex items-center justify-between">
        <label className="text-sm font-medium">Exclude outliers (2.5σ)</label>
        <input
          type="checkbox"
          checked={excludeOutliers}
          onChange={(e) => setExcludeOutliers(e.target.checked)}
        />
      </div>

      {/* Date range */}
      <div className="mb-4">
        <label className="text-sm font-medium block">Date range</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-2 rounded-lg border border-slate-300 text-sm"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-2 rounded-lg border border-slate-300 text-sm"
          />
        </div>
        <div className="mt-2">
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="px-2 py-1 text-sm rounded-md"
            style={{ background: "#e5e7eb", color: "#111827" }}
          >
            Reset dates
          </button>
        </div>
      </div>

      {/* Carry range */}
      <div className="mb-4">
        <label className="text-sm font-medium block">Carry distance range (yds)</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            value={carryMin}
            onChange={(e) => setCarryMin(e.target.value)}
            className="px-2 py-2 rounded-lg border border-slate-300 text-sm"
          />
          <input
            type="number"
            placeholder="Max"
            value={carryMax}
            onChange={(e) => setCarryMax(e.target.value)}
            className="px-2 py-2 rounded-lg border border-slate-300 text-sm"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col gap-2">
        <button
          onClick={onLoadSample}
          className="px-3 py-2 rounded-lg font-medium"
          style={{ background: "#fff7ed", color: "#7c2d12", border: `1px solid ${theme.border}` }}
          title="Load sample data"
        >
          Load sample data
        </button>
        <button
          onClick={onExportCsv}
          className="px-3 py-2 rounded-lg font-medium"
          style={{ background: "#eff6ff", color: "#1e40af", border: `1px solid ${theme.border}` }}
        >
          Export CSV
        </button>
        <button
          onClick={onDeleteAll}
          className="px-3 py-2 rounded-lg font-medium"
          style={{ background: "#fee2e2", color: "#991b1b", border: `1px solid ${theme.border}` }}
        >
          Delete all data
        </button>
      </div>
    </div>
  );
});

export default FiltersPanel;
