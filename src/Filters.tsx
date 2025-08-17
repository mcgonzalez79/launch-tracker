import React, { useMemo } from "react";
import type { Theme } from "./theme";
import type { Shot } from "./utils";
import { Card, Chip, MutedButton, PrimaryButton } from "./components/UI";

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

  dateFrom: string;
  dateTo: string;
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

  const clubChips = useMemo(
    () =>
      clubs.map((c) => {
        const sel = selectedClubs.includes(c);
        return (
          <Chip
            key={c}
            label={c}
            selected={sel}
            onClick={() =>
              setSelectedClubs(sel ? selectedClubs.filter((x) => x !== c) : [...selectedClubs, c])
            }
            theme={T}
          />
        );
      }),
    [clubs, selectedClubs, setSelectedClubs, T]
  );

  return (
    <Card title="Filters" theme={T}>
      <div className="grid gap-3 md:grid-cols-2">
        {/* Session + Date */}
        <div className="grid gap-2">
          <label className="text-xs" style={{ color: T.textDim }}>Session</label>
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="rounded-md px-2 py-1 border text-sm"
            style={{ background: T.panelAlt, color: T.text, borderColor: T.border }}
          >
            {sessions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs" style={{ color: T.textDim }}>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-md px-2 py-1 border text-sm"
                style={{ background: T.panelAlt, color: T.text, borderColor: T.border }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: T.textDim }}>To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-md px-2 py-1 border text-sm"
                style={{ background: T.panelAlt, color: T.text, borderColor: T.border }}
              />
            </div>
          </div>
        </div>

        {/* Carry range + Outliers */}
        <div className="grid gap-2">
          <label className="text-xs" style={{ color: T.textDim }}>Carry (yds)</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              inputMode="numeric"
              placeholder={`${carryBounds.min}`}
              value={carryMin}
              onChange={(e) => setCarryMin(e.target.value)}
              className="w-full rounded-md px-2 py-1 border text-sm"
              style={{ background: T.panelAlt, color: T.text, borderColor: T.border }}
            />
            <input
              type="number"
              inputMode="numeric"
              placeholder={`${carryBounds.max}`}
              value={carryMax}
              onChange={(e) => setCarryMax(e.target.value)}
              className="w-full rounded-md px-2 py-1 border text-sm"
              style={{ background: T.panelAlt, color: T.text, borderColor: T.border }}
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm mt-1">
            <input
              type="checkbox"
              checked={excludeOutliers}
              onChange={(e) => setExcludeOutliers(e.target.checked)}
            />
            <span style={{ color: T.text }}>Exclude outliers</span>
          </label>
        </div>
      </div>

      {/* Clubs */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <div className="text-xs" style={{ color: T.textDim }}>Clubs</div>
          <div className="flex gap-2">
            <MutedButton theme={T} onClick={() => setSelectedClubs([])}>Clear</MutedButton>
            <MutedButton theme={T} onClick={() => setSelectedClubs(clubs)}>Select all</MutedButton>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">{clubChips}</div>
      </div>

      {/* Actions */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <PrimaryButton theme={T} onClick={onLoadSample}>Load sample</PrimaryButton>
        <MutedButton theme={T} onClick={onExportCSV}>Export CSV</MutedButton>
        <MutedButton theme={T} onClick={onPrintClubAverages}>Print club averages</MutedButton>
        <MutedButton theme={T} onClick={onDeleteSession}>Delete session</MutedButton>
        <MutedButton theme={T} onClick={onDeleteAll}>Delete all</MutedButton>

        <label className="px-3 py-1 rounded-md border text-sm cursor-pointer text-center"
          style={{ background: T.panel, color: T.text, borderColor: T.border }}>
          Import file
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
            }}
            className="hidden"
          />
        </label>
      </div>
    </Card>
  );
}
