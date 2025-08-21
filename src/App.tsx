import React, { useEffect, useMemo, useRef, useState } from "react";
import { LIGHT, DARK, Theme } from "./theme";
import FiltersPanel from "./Filters";
import DashboardCards from "./Dashboard";
import InsightsView from "./Insights";
import JournalView from "./Journal";
import { TopTab, IconSun, IconMoon } from "./components/UI";
import {
  Shot, Msg, ViewKey, mean, stddev, isoDate, clamp,
  coalesceSmash, coalesceFaceToPath, fpOf, XLSX, orderIndex, ClubRow,
  normalizeHeader, parseWeirdLaunchCSV, weirdRowsToShots, exportCSV
} from "./utils";

/* =========================
   Toasts
========================= */
type ToastType = "info" | "warn" | "success" | "error";
function useToasts() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const remove = (id: number) => setMsgs(prev => prev.filter(x => x.id !== id));
  const push = (m: Omit<Msg, "id"> & Partial<Pick<Msg, "id">>) => {
    const id = m.id ?? Math.floor(Date.now() + Math.random() * 1000);
    setMsgs(prev => [...prev, { id, text: m.text, type: m.type }]);
    setTimeout(() => remove(id), 10000); // auto-clear after 10s
  };
  return { msgs, push, remove };
}

/* =========================
   Helpers
========================= */
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrUndef = (v: any): number | undefined => {
  const x = fpOf(v);
  return typeof x === "number" ? x : undefined;
};
const applyDerived = (s: Shot): Shot => {
  const s2 = { ...s };
  const Sm = coalesceSmash(s2);
  const F2P = coalesceFaceToPath(s2);
  if (Sm !== undefined) s2.SmashFactor = clamp(Sm, 0.5, 1.95);
  if (F2P !== undefined) s2.FaceToPath_deg = F2P;
  return s2;
};

/* =========================
   App
========================= */
export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem("launch-tracker:theme") === "dark") ? DARK : LIGHT; } catch { return LIGHT; }
  });
  const T = theme;

  const { msgs, push: toast, remove: removeToast } = useToasts();

  /* =========================
     Data (shots)
  ========================= */
  const [shots, setShots] = useState<Shot[]>(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:shots");
      if (!raw) return [];
      const arr = JSON.parse(raw) as Shot[];
      return arr.map(applyDerived);
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("launch-tracker:shots", JSON.stringify(shots)); } catch {}
  }, [shots]);

  /* =========================
     Journal
  ========================= */
  const [journalHTML, setJournalHTML] = useState<string>(() => {
    try { return localStorage.getItem("launch-tracker:journal") ?? ""; } catch { return ""; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:journal", journalHTML); } catch {} }, [journalHTML]);

  /* =========================
     Layout / tabs
  ========================= */
  const [tab, setTab] = useState<ViewKey>("dashboard");

  /* =========================
     Filters UI (mobile open/close)
  ========================= */
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const [filtersHeight, setFiltersHeight] = useState<number>(420);
  useEffect(() => {
    const el = filtersRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setFiltersHeight(el.getBoundingClientRect().height));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /* =========================
     Derived session list / club list / carry bounds
  ========================= */
  const sessions = useMemo(() => {
    const s = new Set<string>();
    shots.forEach(x => s.add((x.SessionId ?? "Unknown Session")));
    return ["ALL", ...Array.from(s).sort()];
  }, [shots]);
  const clubs = useMemo(
    () => Array.from(new Set(shots.map(s => s.Club))).sort((a, b) => orderIndex(a) - orderIndex(b)),
    [shots]
  );
  const carryBounds = useMemo(() => {
    const xs = shots.map(s => s.CarryDistance_yds).filter(isNum);
    return xs.length ? { min: Math.floor(Math.min(...xs)), max: Math.ceil(Math.max(...xs)) } : { min: 0, max: 0 };
  }, [shots]);

  /* =========================
     Import / Export
  ========================= */
  function mergeImportedShots(newShots: Shot[], filename: string) {
    const keyOf = (s: Shot) =>
      [s.Timestamp ?? "", s.Club, s.CarryDistance_yds ?? 0, s.BallSpeed_mph ?? 0, s.ClubSpeed_mph ?? 0].join("|");
    const existing = new Map(shots.map(s => [keyOf(s), s]));
    let added = 0;
    for (const s of newShots) {
      const k = keyOf(s);
      if (!existing.has(k)) { existing.set(k, s); added++; }
    }
    const merged = Array.from(existing.values());
    setShots(merged);
    // Ensure session filter reflects everything after import
    setSessionFilter("ALL");
    toast({ type: added > 0 ? "success" : "info", text: added > 0 ? `Imported ${added} new shots from ${filename}` : `No new shots found in ${filename}` });
  }

  function rowsToShots(headerRow: any[], dataRows: any[][], filename: string): Shot[] {
    try {
      const norm = headerRow.map(h => normalizeHeader(String(h ?? "")));
      const idx = (name: string) => norm.indexOf(name);
      const shots: Shot[] = [];

      for (const r of dataRows) {
        if (!r || !r.length) continue;
        const shot: Shot = {
          Timestamp: String(r[idx("timestamp")] ?? ""),
          SessionId: String(r[idx("sessionid")] ?? "") || undefined,
          Club: String(r[idx("club")] ?? ""),
          CarryDistance_yds: numOrUndef(r[idx("carrydistance_yds")]),
          TotalDistance_yds: numOrUndef(r[idx("totaldistance_yds")]),
          BallSpeed_mph: numOrUndef(r[idx("ballspeed_mph")]),
          ClubSpeed_mph: numOrUndef(r[idx("clubspeed_mph")]),
          SpinRate_rpm: numOrUndef(r[idx("spinrate_rpm")]),
          LaunchAngle_deg: numOrUndef(r[idx("launchangle_deg")]),
          ClubPath_deg: numOrUndef(r[idx("clubpath_deg")]),
          ClubFace_deg: numOrUndef(r[idx("clubface_deg")]),
          FaceToPath_deg: numOrUndef(r[idx("facetopath_deg")]),
          SmashFactor: numOrUndef(r[idx("smashfactor")]),
        };
        shots.push(applyDerived(shot));
      }
      return shots;
    } catch (e) {
      toast({ type: "error", text: `Could not parse ${filename}: ${(e as Error).message}` });
      return [];
    }
  }

  function processWorkbook(wb: XLSX.WorkBook, filename: string) {
    const valid = wb.SheetNames.find(n => {
      const ws = wb.Sheets[n];
      const rr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
      return rr && rr.flat().some(v => v !== null && v !== "");
    }) || wb.SheetNames[0];

    const ws = wb.Sheets[valid];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
    if (!rows.length) { toast({ type: "warn", text: `No rows detected in ${filename}` }); return; }

    const header = rows[0].map((h) => String(h ?? ""));
    const second = rows[1]?.map((h) => String(h ?? "")) ?? [];
    const hasUnitsRow = second.length && second.some(s => /\b(mph|rpm|yds|deg)\b/i.test(s));
    const dataRows = hasUnitsRow ? rows.slice(2) : rows.slice(1);

    const newShots = rowsToShots(header, dataRows, filename);
    mergeImportedShots(newShots, filename);
  }

  function onImportFile(file: File) {
    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        processWorkbook(wb, file.name);
      } catch (wbErr) {
        try {
          const text = await file.text();
          const { header, rows } = parseWeirdLaunchCSV(text);
          const newShots = weirdRowsToShots(header, rows);
          mergeImportedShots(newShots, file.name);
        } catch (e) {
          toast({ type: "error", text: `Failed to read file: ${(e as Error).message}` });
        }
      }
    })();
  }

  function onLoadSample() {
    try {
      const sample = (window as any).__LAUNCH_TRACKER_SAMPLE__ as Shot[] | undefined;
      if (!sample || !Array.isArray(sample)) { toast({ type: "warn", text: "No sample data embedded." }); return; }
      mergeImportedShots(sample, "Sample");
    } catch {
      toast({ type: "error", text: "Could not load sample data." });
    }
  }

  function exportShotsCSV() {
    try { exportCSV(shots, "launch-tracker-export.csv"); }
    catch (e) { toast({ type: "error", text: `CSV export failed: ${(e as Error).message}` }); }
  }

  /* =========================
     Filters (state)
  ========================= */
  const [selectedClubs, setSelectedClubs] = useState<string[]>([]);
  const [sessionFilter, setSessionFilter] = useState<string>("ALL");
  const [excludeOutliers, setExcludeOutliers] = useState<boolean>(false);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [carryMin, setCarryMin] = useState<string>("");
  const [carryMax, setCarryMax] = useState<string>("");

  /* =========================
     Actions
  ========================= */
  function onPrintClubAverages() { window.print(); }
  function onDeleteSession() {
    if (!shots.length || sessionFilter === "ALL") return;
    if (!window.confirm(`Delete all shots in session "${sessionFilter}"? This cannot be undone.`)) return;
    const keep = shots.filter(s => (s.SessionId ?? "Unknown Session") !== sessionFilter);
    setShots(keep);
  }
  function onDeleteAll() {
    if (!shots.length) return;
    if (!window.confirm("Delete ALL shots? This cannot be undone.")) return;
    setShots([]);
  }

  /* =========================
     Filtering
  ========================= */
  const filteredBase = useMemo(() => {
    const inClubs = (s: Shot) => !selectedClubs.length || selectedClubs.includes(s.Club);
    const inSession = (s: Shot) => sessionFilter === "ALL" || (s.SessionId ?? "Unknown Session") === sessionFilter;

    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    const min = carryMin ? Number(carryMin) : null;
    const max = carryMax ? Number(carryMax) : null;

    return shots.filter(s => {
      if (!inClubs(s) || !inSession(s)) return false;
      if (from) { try { if (new Date(s.Timestamp || "") < from) return false; } catch {} }
      if (to)   { try { if (new Date(s.Timestamp || "") > to)   return false; } catch {} }
      if (isNum(s.CarryDistance_yds)) {
        if (min != null && (s.CarryDistance_yds ?? 0) < min) return false;
        if (max != null && (s.CarryDistance_yds ?? 0) > max) return false;
      }
      return true;
    });
  }, [shots, sessionFilter, selectedClubs, dateFrom, dateTo, carryMin, carryMax]);

  const filteredOutliers = useMemo(() => {
    if (!excludeOutliers) return filteredBase;

    // group visible shots by club
    const byClub = new Map<string, Shot[]>();
    for (const s of filteredBase) {
      const k = s.Club || "Unknown";
      if (!byClub.has(k)) byClub.set(k, []);
      byClub.get(k)!.push(s);
    }

    // simple quantile helper
    const quantile = (sorted: number[], q: number) => {
      if (!sorted.length) return NaN;
      const pos = (sorted.length - 1) * q;
      const base = Math.floor(pos);
      const rest = pos - base;
      const a = sorted[base];
      const b = sorted[base + 1] ?? a;
      return a + rest * (b - a);
    };

    const keep: Shot[] = [];
    for (const arr of byClub.values()) {
      const carries = arr.map(s => s.CarryDistance_yds).filter(isNum) as number[];

      // Not enough data for robust IQR: keep all for this club
      if (carries.length < 8) { keep.push(...arr); continue; }

      const sorted = [...carries].sort((a, b) => a - b);
      const q1 = quantile(sorted, 0.25);
      const q3 = quantile(sorted, 0.75);
      const iqr = q3 - q1;
      const lo = q1 - 1.5 * iqr;
      const hi = q3 + 1.5 * iqr;

      for (const s of arr) {
        const c = s.CarryDistance_yds;
        if (!isNum(c) || (c >= lo && c <= hi)) keep.push(s);
      }
    }
    return keep;
  }, [filteredBase, excludeOutliers]);

  /* =========================
     Derived for child views
  ========================= */
  const hasData = filteredBase.length > 0;
  const kpis = useMemo(() => {
    const vCarry = filteredOutliers.map(s => s.CarryDistance_yds).filter(isNum);
    const vBall  = filteredOutliers.map(s => s.BallSpeed_mph).filter(isNum);
    const vClub  = filteredOutliers.map(s => s.ClubSpeed_mph).filter(isNum);
    const vSmash = filteredOutliers.map(s => s.SmashFactor).filter(isNum);
    return {
      carry: { mean: mean(vCarry), n: vCarry.length, std: stddev(vCarry) },
      ball:  { mean: mean(vBall),  n: vBall.length,  std: stddev(vBall)  },
      club:  { mean: mean(vClub),  n: vClub.length,  std: stddev(vClub)  },
      smash: { mean: mean(vSmash), n: vSmash.length, std: stddev(vSmash) },
    } as any;
  }, [filteredOutliers]);

  const tableRows: ClubRow[] = useMemo(() => {
    const byClub = new Map<string, Shot[]>();
    for (const s of filteredOutliers) {
      if (!byClub.has(s.Club)) byClub.set(s.Club, []);
      byClub.get(s.Club)!.push(s);
    }
    const rows: ClubRow[] = [];
    Array.from(byClub.keys()).sort((a,b)=>orderIndex(a)-orderIndex(b)).forEach(club => {
      const arr = byClub.get(club)!;
      const avg = (key: keyof Shot) => {
        const xs = arr.map(r => r[key]).filter(isNum) as number[];
        return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
      };
      rows.push({ club, count: arr.length, avgCarry: avg("CarryDistance_yds"), avgTotal: avg("TotalDistance_yds"),
        avgSmash: avg("SmashFactor"), avgSpin: avg("SpinRate_rpm"), avgCS: avg("ClubSpeed_mph"),
        avgBS: avg("BallSpeed_mph"), avgLA: avg("LaunchAngle_deg"), avgF2P: avg("FaceToPath_deg") } as any);
    });
    return rows;
  }, [filteredOutliers]);

  // Card ordering
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    const DEFAULT = ["kpis", "shape", "dispersion", "gap", "eff", "table"];
    try {
      const raw = localStorage.getItem("launch-tracker:card-order");
      const saved = raw ? JSON.parse(raw) : null;
      if (Array.isArray(saved) && saved.length) return Array.from(new Set([...saved, ...DEFAULT])).filter(k => DEFAULT.includes(k));
      return DEFAULT;
    } catch { return DEFAULT; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:card-order", JSON.stringify(cardOrder)); } catch {} }, [cardOrder]);

  // Insights ordering
  const INSIGHTS_DEFAULT = ["dist", "high", "bench", "swings", "records", "gaps", "progress"];
  const [insightsOrder, setInsightsOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:insights-order");
      const saved = raw ? JSON.parse(raw) : null;
      if (Array.isArray(saved) && saved.length) return Array.from(new Set([...saved, ...INSIGHTS_DEFAULT]));
      return INSIGHTS_DEFAULT;
    } catch { return INSIGHTS_DEFAULT; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:insights-order", JSON.stringify(insightsOrder)); } catch {} }, [insightsOrder]);

  const [selectedTab, setSelectedTab] = useState<ViewKey>("dashboard");

  const sessionLabel = useMemo(() => {
    if (sessionFilter === "ALL") return "All Data";
    return `Session: ${sessionFilter}`;
  }, [sessionFilter]);

  /* =========================
     Layout
  ========================= */
  const journalRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.text }}>
      <header className="sticky top-0 z-40 border-b" style={{ borderColor: T.border, background: T.bg }}>
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded-md border text-xs md:hidden"
              style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
              onClick={() => setFiltersOpen(true)}
              title="Filters"
            >Filters</button>
            <div className="text-lg font-semibold">Launch Tracker</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <TopTab label="Dashboard" active={tab === "dashboard"} onClick={() => setTab("dashboard")} theme={T} />
              <TopTab label="Insights"  active={tab === "insights"}  onClick={() => setTab("insights")}  theme={T} />
              <TopTab label="Journal"   active={tab === "journal"}   onClick={() => setTab("journal")}   theme={T} />
            </div>
            <button
              className="px-2 py-1 rounded-md border text-xs"
              style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
              onClick={() => setTheme(theme === LIGHT ? DARK : LIGHT)}
              title="Toggle theme"
            >
              {theme === LIGHT ? <IconMoon/> : <IconSun/>}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile tabs row */}
      <div className="md:hidden border-b" style={{ borderColor: T.border, background: T.panel }}>
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2">
          <TopTab label="Dashboard" active={tab === "dashboard"} onClick={() => setTab("dashboard")} theme={T} />
          <TopTab label="Insights"  active={tab === "insights"}  onClick={() => setTab("insights")}  theme={T} />
          <TopTab label="Journal"   active={tab === "journal"}   onClick={() => setTab("journal")}   theme={T} />
        </div>
      </div>

      {/* Drawer for filters on mobile */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setFiltersOpen(false)} />
          <div className="absolute top-0 right-0 bottom-0 w-[360px] max-w-[90%] bg-white shadow-xl sidebar-fix">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="font-medium">Filters</div>
              <button className="px-2 py-1 rounded-md border text-xs" onClick={() => setFiltersOpen(false)}>Close</button>
            </div>
            <div className="p-3">
              <FiltersPanel
                theme={T}
                shots={shots}
                sessions={sessions}
                clubs={clubs}
                selectedClubs={selectedClubs}
                setSelectedClubs={setSelectedClubs}
                sessionFilter={sessionFilter}
                setSessionFilter={setSessionFilter}
                excludeOutliers={excludeOutliers}
                setExcludeOutliers={setExcludeOutliers}
                dateFrom={dateFrom}
                dateTo={dateTo}
                setDateFrom={setDateFrom}
                setDateTo={setDateTo}
                carryMin={carryMin}
                carryMax={carryMax}
                setCarryMin={setCarryMin}
                setCarryMax={setCarryMax}
                carryBounds={carryBounds}
                onImportFile={onImportFile}
                onLoadSample={onLoadSample}
                onExportCSV={exportShotsCSV}
                onPrintClubAverages={onPrintClubAverages}
                onDeleteSession={onDeleteSession}
                onDeleteAll={onDeleteAll}
              />
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-4">
          {/* Left rail (desktop) */}
          <div ref={filtersRef} className="hidden md:block filters-panel">
            <FiltersPanel
              theme={T}
              shots={shots}
              sessions={sessions}
              clubs={clubs}
              selectedClubs={selectedClubs}
              setSelectedClubs={setSelectedClubs}
              sessionFilter={sessionFilter}
              setSessionFilter={setSessionFilter}
              excludeOutliers={excludeOutliers}
              setExcludeOutliers={setExcludeOutliers}
              dateFrom={dateFrom}
              dateTo={dateTo}
              setDateFrom={setDateFrom}
              setDateTo={setDateTo}
              carryMin={carryMin}
              carryMax={carryMax}
              setCarryMin={setCarryMin}
              setCarryMax={setCarryMax}
              carryBounds={carryBounds}
              onImportFile={onImportFile}
              onLoadSample={onLoadSample}
              onExportCSV={exportShotsCSV}
              onPrintClubAverages={onPrintClubAverages}
              onDeleteSession={onDeleteSession}
              onDeleteAll={onDeleteAll}
            />
          </div>

          {/* Right content */}
          <div>
            {tab === "dashboard" && (
              <DashboardCards
                theme={T}
                cardOrder={cardOrder}
                setCardOrder={setCardOrder}
                onDragStart={(key) => (e) => { e.dataTransfer.setData("text/x", key); }}
                onDragOver={() => (e) => { e.preventDefault(); }}
                onDrop={(key) => (e) => {
                  try {
                    const from = e.dataTransfer.getData("text/x");
                    if (!from || from === key) return;
                    setCardOrder((cur) => {
                      const a = cur.indexOf(from);
                      const b = cur.indexOf(key);
                      if (a < 0 || b < 0) return cur;
                      const copy = [...cur];
                      const [moved] = copy.splice(a, 1);
                      copy.splice(b, 0, moved);
                      return copy;
                    });
                  } catch {}
                }}
                hasData={hasData}
                kpis={kpis}
                filteredOutliers={filteredOutliers}
                filtered={filteredOutliers}
                shots={shots}
                tableRows={tableRows}
                clubs={clubs}
              />
            )}
            {tab === "insights" && (
              <InsightsView
                theme={T}
                order={insightsOrder}
                setOrder={setInsightsOrder}
                filteredOutliers={filteredOutliers}
                filteredNoClubOutliers={filteredOutliers}
                clubs={clubs}
              />
            )}
            {tab === "journal" && (
              <JournalView
                theme={T}
                editorRef={journalRef}
                value={journalHTML}
                onInputHTML={setJournalHTML}
                sessionLabel={sessionLabel}
                defaultHeightPx={Math.max(320, Math.floor(filtersHeight))}
              />
            )}
          </div>
        </div>
      </div>

      <Footer T={T} />

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {msgs.map((m) => (
          <button
            key={m.id}
            className="px-3 py-2 rounded-md border text-sm shadow-sm text-left"
            style={{ background: T.panel, borderColor: T.border, color: T.text }}
            onClick={() => removeToast(m.id)}
          >
            <div className="font-medium">{m.type.toUpperCase()}</div>
            <div className="opacity-90">{m.text}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* =========================
   Footer
========================= */
function Footer({ T }: { T: Theme }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-6 border-t" style={{ borderColor: T.border, background: T.bg }}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-2">
        <div className="text-xs" style={{ color: T.textDim }}>
          © {year} Launch Tracker
        </div>
        <nav className="flex items-center gap-3 text-xs" style={{ color: T.textDim }}>
          <a href="https://github.com/mcgonzalez79/launch-tracker" target="_blank" rel="noreferrer" className="underline">Repo</a>
          <span>·</span>
          <span>v1.0.0+</span>
        </nav>
      </div>
    </footer>
  );
}
