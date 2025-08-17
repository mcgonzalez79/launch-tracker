
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
  normalizeHeader, headerMap, parseWeirdLaunchCSV, weirdRowsToShots, exportCSV
} from "./utils";

/* =========================
   Local helpers
========================= */
const norm = (s: any) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    // remove bracketed or parenthetical units: [yds], (rpm), etc.
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)/g, "")
    // collapse whitespace and strip common punctuation
    .replace(/\s+/g, " ")
    .replace(/[\-_/(),:]/g, "")
    .trim();

const num = (v: any): number | undefined => {
  const x = fpOf(v);
  return typeof x === "number" ? x : Number.NaN;
};

function idxOf(headers: string[], variants: string[]): number {
  for (const v of variants) {
    const i = headers.findIndex((h) => norm(h) === norm(v));
    if (i >= 0) return i;
  }
  return -1;
}

/* =========================
   Toast system
========================= */
function useToasts() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const push = (m: Omit<Msg, "id"> & Partial<Pick<Msg, "id">>) => {
    const id = m.id ?? Date.now() + Math.random();
    setMsgs((prev) => [...prev, { id, text: m.text, type: m.type }]);
  };
  const remove = (id: number) => setMsgs((prev) => prev.filter((x) => x.id !== id));
  return { msgs, push, remove };
}

/* =========================
   App
========================= */
export default function App() {
  /* Theme */
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem("launch-tracker:theme") || "dark") === "light" ? LIGHT : DARK; } catch { return DARK; }
  });
  useEffect(() => {
    try { localStorage.setItem("launch-tracker:theme", theme === LIGHT ? "light" : "dark"); } catch {}
    document.documentElement.style.setProperty("color-scheme", theme === LIGHT ? "light" : "dark");
  }, [theme]);

  /* Tabs */
  const [tab, setTab] = useState<ViewKey>(() => {
    try { return (localStorage.getItem("launch-tracker:tab") as ViewKey) || "dashboard"; } catch { return "dashboard"; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:tab", tab); } catch {} }, [tab]);

  /* Data */
  const [shots, setShots] = useState<Shot[]>(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:shots");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:shots", JSON.stringify(shots)); } catch {} }, [shots]);

  // Derived lists
  const clubs = useMemo(
    () => Array.from(new Set(shots.map(s => s.Club))).sort((a, b) => orderIndex(a) - orderIndex(b)),
    [shots]
  );
  const sessions = useMemo(
    () => ["ALL", ...Array.from(new Set(shots.map(s => s.SessionId ?? "Unknown Session"))).sort()],
    [shots]
  );

  const carryBounds = useMemo(() => {
    const vals = shots.map(s => s.CarryDistance_yds).filter((v): v is number => v !== undefined);
    if (!vals.length) return { min: 0, max: 0 };
    return { min: Math.floor(Math.min(...vals)), max: Math.ceil(Math.max(...vals)) };
  }, [shots]);

  /* =========================
     Import processing
  ========================= */
  function applyDerived(s: Shot): Shot {
    const s2 = { ...s };
    const Sm = coalesceSmash(s2);
    const F2P = coalesceFaceToPath(s2);
    if (Sm !== undefined) s2.SmashFactor = clamp(Sm, 0.5, 1.95);
    if (F2P !== undefined) s2.FaceToPath_deg = F2P;
    return s2;
  }

  function mergeImportedShots(newShots: Shot[], filename: string) {
    const keyOf = (s: Shot) =>
      [s.Timestamp ?? "", s.Club, s.CarryDistance_yds ?? 0, s.BallSpeed_mph ?? 0, s.ClubSpeed_mph ?? 0].join("|");
    const existing = new Map(shots.map(s => [keyOf(s), s]));
    let added = 0;
    for (const s of newShots) {
      const k = keyOf(s);
      if (!existing.has(k)) {
        existing.set(k, s);
        added++;
      }
    }
    setShots(Array.from(existing.values()));
    toast({ type: added > 0 ? "success" : "info", text: added > 0 ? `Imported ${added} new shots from ${filename}` : `No new shots found in ${filename}` });
  }

  // Generic header-driven extraction using utils.headerMap/normalizeHeader
  function rowsToShots(headerRow: any[], dataRows: any[][], filename: string): Shot[] {
    const header = headerRow.map(h => String(h ?? ""));
    const hNorm = header.map(h => normalizeHeader(h));
    const get = (r: any[], key: keyof typeof headerMap) => {
      // find the first header alias that maps to this Shot field
      const target = key; // headerMap maps normalized strings to Shot keys; we want index of that normalized header
      // build reverse index: ShotKey -> positions in header
      const idx = hNorm.findIndex(h => (headerMap as any)[h] === target);
      return idx >= 0 ? r[idx] : null;
    };

    const shotsLocal: Shot[] = dataRows.map((row) => {
      // Try to read flexible fields via headerMap; also support some common fallbacks
      const dateRaw = String(row[hNorm.findIndex(h => /^(date|timestamp|datetime)$/.test(h))] ?? "").trim();
      const sessionByDay = (dateRaw.split(" ")[0] || "Unknown Session");

      // We also allow either "club name" or "club type" to fill Club
      const clubIdx = (() => {
        const cand = ["club name", "club", "club type"];
        for (const c of cand) {
          const i = hNorm.findIndex(h => h === c);
          if (i >= 0) return i;
        }
        return -1;
      })();
      const clubVal = clubIdx >= 0 ? String(row[clubIdx] ?? "").trim() : "";

      const s: Shot = {
        SessionId: sessionByDay,
        Club: clubVal || "Unknown Club",
        Timestamp: isoDate(dateRaw),

        ClubSpeed_mph:      num(row[hNorm.findIndex(h => h === "club speed")]),
        AttackAngle_deg:    num(row[hNorm.findIndex(h => h === "attack angle")]),
        ClubPath_deg:       num(row[hNorm.findIndex(h => h === "club path")]),
        ClubFace_deg:       num(row[hNorm.findIndex(h => h === "club face")]),
        FaceToPath_deg:     num(row[hNorm.findIndex(h => h === "face to path")]),
        BallSpeed_mph:      num(row[hNorm.findIndex(h => h === "ball speed")]),
        SmashFactor:        num(row[hNorm.findIndex(h => h === "smash factor")]),
        LaunchAngle_deg:    num(row[hNorm.findIndex(h => h === "launch angle")]),
        LaunchDirection_deg:num(row[hNorm.findIndex(h => h === "launch direction")]),
        ApexHeight_yds:     num(row[hNorm.findIndex(h => h === "apex height")]),
        CarryDistance_yds:  num(row[hNorm.findIndex(h => h === "carry distance")]),
        CarryDeviationDistance_yds: num(row[hNorm.findIndex(h => h === "carry deviation distance")]),
        TotalDeviationDistance_yds: num(row[hNorm.findIndex(h => h === "total deviation distance")]),
        TotalDistance_yds:  num(row[hNorm.findIndex(h => h === "total distance")]),
        Backspin_rpm:       num(row[hNorm.findIndex(h => h === "backspin")]),
        Sidespin_rpm:       num(row[hNorm.findIndex(h => h === "sidespin")]),
        SpinRate_rpm:       num(row[hNorm.findIndex(h => h === "spin rate")]),
        SpinRateType:       ((): string | undefined => {
          const i = hNorm.findIndex(h => h === "spin rate type");
          const v = i >= 0 ? row[i] : undefined;
          return v == null ? undefined : String(v);
        })(),
        SpinAxis_deg:       num(row[hNorm.findIndex(h => h === "spin axis")]),
      };

      return applyDerived(s);
    });

    return shotsLocal;
  }

  function processWorkbook(wb: XLSX.WorkBook, _textFromCSV: string | null, filename: string) {
    const firstSheet =
      wb.SheetNames.find(n => {
        const ws = wb.Sheets[n];
        const rr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
        return rr && rr.flat().some(v => v !== null && v !== "");
      }) || wb.SheetNames[0];

    const ws = wb.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
    if (!rows.length) {
      toast({ type: "warn", text: `No rows detected in ${filename}` });
      return;
    }

    // If the file is actually a CSV with a units line, allow for 2-line header by detecting a units row
    const header = rows[0].map((h) => String(h ?? ""));
    const second = rows[1]?.map((h) => String(h ?? "")) ?? [];
    const hasUnitsRow = second.length && second.some(s => /\b(mph|rpm|yds|deg)\b/i.test(s));
    const dataRows = hasUnitsRow ? rows.slice(2) : rows.slice(1);

    const newShots = rowsToShots(header, dataRows, filename);
    mergeImportedShots(newShots, filename);
  }

  /* =========================
     Export (CSV aligned to Shot)
  ========================= */
  function exportShotsCSV() {
    exportCSV(shots);
  }

  /* =========================
     Filters state
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
  function onImportFile(file: File) {
    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        // First attempt: parse as workbook (handles XLSX, XLS, CSV too)
        const wb = XLSX.read(buffer, { type: "array" });
        processWorkbook(wb, null, file.name);
      } catch (wbErr) {
        try {
          // Fallback: read CSV as text and run through CSV helpers
          const text = await file.text();
          const parsed = parseWeirdLaunchCSV(text);
          if (parsed) {
            const shotsFromCsv = weirdRowsToShots(parsed.header, parsed.dataRows, file.name.replace(/\.\w+$/, ""));
            mergeImportedShots(shotsFromCsv, file.name);
          } else {
            throw wbErr;
          }
        } catch (csvErr) {
          console.error(csvErr);
          toast({ type: "error", text: `Import failed: ${(csvErr as Error).message}` });
        }
      }
    })();
  }

  function onLoadSample() {
    // Simple synthetic dataset across two sessions/clubs
    const sample: Shot[] = [
      { SessionId: "2025-08-10", Timestamp: "2025-08-10T14:05:00Z", Club: "Driver",
        ClubSpeed_mph: 102, BallSpeed_mph: 150, LaunchAngle_deg: 13, Backspin_rpm: 2500,
        CarryDistance_yds: 255, TotalDistance_yds: 280, LaunchDirection_deg: -2, ClubPath_deg: 3.0, ClubFace_deg: 2.0 },
      { SessionId: "2025-08-10", Timestamp: "2025-08-10T14:07:00Z", Club: "Driver",
        ClubSpeed_mph: 104, BallSpeed_mph: 153, LaunchAngle_deg: 12.5, Backspin_rpm: 2400,
        CarryDistance_yds: 258, TotalDistance_yds: 284, LaunchDirection_deg: 1, ClubPath_deg: 2.5, ClubFace_deg: 1.0 },
      { SessionId: "2025-08-10", Timestamp: "2025-08-10T14:12:00Z", Club: "7 Iron",
        ClubSpeed_mph: 84, BallSpeed_mph: 114, LaunchAngle_deg: 18, Backspin_rpm: 6200,
        CarryDistance_yds: 158, TotalDistance_yds: 168, LaunchDirection_deg: 0, ClubPath_deg: 1.0, ClubFace_deg: 0.5 },
      { SessionId: "2025-08-15", Timestamp: "2025-08-15T15:31:00Z", Club: "Pitching Wedge",
        ClubSpeed_mph: 70, BallSpeed_mph: 92, LaunchAngle_deg: 29, Backspin_rpm: 8500,
        CarryDistance_yds: 118, TotalDistance_yds: 124, LaunchDirection_deg: -1, ClubPath_deg: -0.5, ClubFace_deg: -1.0 },
      { SessionId: "2025-08-15", Timestamp: "2025-08-15T15:34:00Z", Club: "Pitching Wedge",
        ClubSpeed_mph: 71, BallSpeed_mph: 93, LaunchAngle_deg: 30, Backspin_rpm: 8700,
        CarryDistance_yds: 120, TotalDistance_yds: 126, LaunchDirection_deg: 0.5, ClubPath_deg: 0.0, ClubFace_deg: 0.2 },
    ].map(applyDerived);
    mergeImportedShots(sample, "Sample Data");
  }

  function onPrintClubAverages() { window.print(); }

  // Delete helpers
  function onDeleteSession() {
    const sel = sessionFilter;
    if (!shots.length || sel === "ALL") return;
    const keep = shots.filter(s => (s.SessionId ?? "Unknown Session") !== sel);
    setShots(keep);
  }
  function onDeleteAll() {
    if (!shots.length) return;
    setShots([]);
  }

  /* =========================
     Filtering
  ========================= */
  const filteredBase = useMemo(() => {
    const inClubs = (s: Shot) => {
      if (!selectedClubs.length) return true;
      return selectedClubs.includes(s.Club);
    };
    const inSession = (s: Shot) => {
      if (sessionFilter === "ALL") return true;
      return (s.SessionId ?? "Unknown Session") === sessionFilter;
    };

    const carryMinNum = carryMin ? Number(carryMin) : undefined;
    const carryMaxNum = carryMax ? Number(carryMax) : undefined;

    return shots.filter(s => {
      if (!inClubs(s) || !inSession(s)) return false;

      if (dateFrom) {
        const from = new Date(dateFrom);
        try { if (new Date(s.Timestamp || "") < from) return false; } catch {}
      }
      if (dateTo) {
        const to = new Date(dateTo);
        try { if (new Date(s.Timestamp || "") > to) return false; } catch {}
      }

      if (Number.isFinite(s.CarryDistance_yds)) {
        if (carryMinNum != null && (s.CarryDistance_yds ?? 0) < carryMinNum) return false;
        if (carryMaxNum != null && (s.CarryDistance_yds ?? 0) > carryMaxNum) return false;
      }
      return true;
    });
  }, [shots, sessionFilter, selectedClubs, dateFrom, dateTo, carryMin, carryMax]);

  const filteredOutliers = useMemo(() => {
    if (!excludeOutliers) return filteredBase;
    // Placeholder for future robust trimming (IQR, per-club)
    return filteredBase;
  }, [filteredBase, excludeOutliers]);

  /* =========================
     Derived for child views
  ========================= */
  const hasData = filteredBase.length > 0;

  const kpis = useMemo(() => {
    const vals = (key: keyof Shot) => filteredOutliers.map(s => s[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const kpi = (arr: number[]) => ({ mean: arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0, n: arr.length, std: arr.length ? Math.sqrt(arr.reduce((a,b)=>a+(b-(arr.reduce((a,c)=>a+c,0)/arr.length))**2,0)/arr.length) : 0 });
    return {
      carry: kpi(vals("CarryDistance_yds")),
      ball:  kpi(vals("BallSpeed_mph")),
      club:  kpi(vals("ClubSpeed_mph")),
      smash: kpi(vals("SmashFactor")),
    };
  }, [filteredOutliers]);

  const filteredNoClubRaw = filteredBase;
  const filteredNoClubOutliers = filteredOutliers;

  const tableRows: ClubRow[] = useMemo(() => {
    const byClub = new Map<string, Shot[]>();
    for (const s of filteredOutliers) {
      const k = s.Club || "Unknown";
      if (!byClub.has(k)) byClub.set(k, []);
      byClub.get(k)!.push(s);
    }
    const rows: ClubRow[] = [];
    Array.from(byClub.keys()).sort((a,b)=>orderIndex(a)-orderIndex(b)).forEach(club => {
      const arr = byClub.get(club)!;
      const avg = (key: keyof Shot) => {
        const xs = arr.map(r => r[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
      };
      rows.push({
        club, count: arr.length,
        avgCarry: avg("CarryDistance_yds"),
        avgTotal: avg("TotalDistance_yds"),
        avgSmash: avg("SmashFactor"),
        avgSpin: avg("Backspin_rpm") || avg("SpinRate_rpm"),
        avgCS: avg("ClubSpeed_mph"),
        avgBS: avg("BallSpeed_mph"),
        avgLA: avg("LaunchAngle_deg"),
        avgF2P: avg("FaceToPath_deg"),
      } as any);
    });
    return rows;
  }, [filteredOutliers]);

  // Drag handlers (no-op placeholders to satisfy props; your Dashboard/Insights read them for ordering if needed)
  const onDragStart = (key: string) => (e: React.DragEvent) => { e.dataTransfer.setData("text/plain", key); };
  const onDragOver = (_key: string) => (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (targetKey: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const sourceKey = e.dataTransfer.getData("text/plain");
    if (!sourceKey || sourceKey === targetKey) return;
    setCardOrder(prev => {
      const cur = [...prev];
      const si = cur.indexOf(sourceKey);
      const ti = cur.indexOf(targetKey);
      if (si < 0 || ti < 0) return cur;
      cur.splice(si, 1);
      cur.splice(ti, 0, sourceKey);
      return cur;
    });
  };


  /* =========================
     Layout helpers
  ========================= */
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const [filtersHeight, setFiltersHeight] = useState<number>(340);
  useEffect(() => {
    const el = filtersRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setFiltersHeight(el.getBoundingClientRect().height);
    });
    ro.observe(el);
    setFiltersHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [filtersRef.current, shots, selectedClubs, sessionFilter, excludeOutliers, carryMin, carryMax, dateFrom, dateTo]);

  // Card order
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    const DEFAULT = ["kpis", "shape", "dispersion", "gap", "eff", "table"];
    try {
      const raw = localStorage.getItem("launch-tracker:card-order");
      const saved = raw ? JSON.parse(raw) : null;
      if (Array.isArray(saved) && saved.length) return Array.from(new Set([...saved, ...DEFAULT])).filter(k => DEFAULT.includes(k));
      return DEFAULT;
    } catch { return DEFAULT; }
  });
  useEffect(() => { if (!cardOrder.length) { setCardOrder(["kpis", "shape", "dispersion", "gap", "eff", "table"]); } }, []);
  useEffect(() => { try { localStorage.setItem("launch-tracker:card-order", JSON.stringify(cardOrder)); } catch {} }, [cardOrder]);

  // Insights order
  const INSIGHTS_DEFAULT = ["dist", "high", "records", "gaps", "progress"];
  const [insightsOrder, setInsightsOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:insights-order");
      const saved = raw ? JSON.parse(raw) : null;
      if (Array.isArray(saved) && saved.length) return Array.from(new Set([...saved, ...INSIGHTS_DEFAULT]));
      return INSIGHTS_DEFAULT;
    } catch { return INSIGHTS_DEFAULT; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:insights-order", JSON.stringify(insightsOrder)); } catch {} }, [insightsOrder]);

  
  /* =========================
     Journal state
  ========================= */
  const journalRef = useRef<HTMLDivElement>(null);
  const [journalHTML, setJournalHTML] = useState<string>(() => {
    try { return localStorage.getItem("launch-tracker:journal") || ""; } catch { return ""; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:journal", journalHTML); } catch {} }, [journalHTML]);

  const sessionLabel = `Journal — ${sessionFilter === "ALL" ? "All Sessions" : sessionFilter}`;

/* =========================
     Handlers wired to Filters
  ========================= */
  const onExportCSV = () => exportShotsCSV();

  /* =========================
     Toasts
  ========================= */
  const { msgs, push: toast, remove: removeToast } = useToasts();
  useEffect(() => {
    if (!msgs.length) return;
    const last = msgs[msgs.length - 1];
    const id = last.id || Date.now();
    last.id = id;
    const t = setTimeout(() => removeToast(id), 3500);
    return () => clearTimeout(t);
  }, [msgs]);

  /* =========================
     Render
  ========================= */
  const T = theme;

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: "100vh" }}>
      <header className="border-b" style={{ borderColor: T.border, background: T.panel }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-lg font-semibold">Launch Tracker</div>
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

      {/* Tabs removed from body; now in header */}
<div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-4">
          {/* Left rail */}
          <div ref={filtersRef}>
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
              onExportCSV={onExportCSV}
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
                setCardOrder={(v)=>setCardOrder(v)}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                hasData={hasData}
                kpis={kpis as any}
                filteredOutliers={filteredOutliers}
                filtered={filteredBase}
                shots={shots}
                tableRows={tableRows as any}
                clubs={clubs}
              />
            )}
            {tab === "insights" && (
              <InsightsView
                theme={T}
                tableRows={tableRows as any}
                filteredOutliers={filteredOutliers}
                filteredNoClubOutliers={filteredOutliers}
                filteredNoClubRaw={filteredBase}
                allClubs={clubs}
                insightsOrder={insightsOrder}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
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
          <div
            key={m.id}
            className="px-3 py-2 rounded-md border text-sm shadow-sm"
            style={{ background: T.panel, borderColor: T.border, color: T.text }}
          >
            {m.text}
          </div>
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
