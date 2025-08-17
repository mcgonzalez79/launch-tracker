import React, { useEffect, useMemo, useRef, useState } from "react";
import { LIGHT, DARK, Theme } from "./theme";
import FiltersPanel from "./Filters";
import DashboardCards from "./Dashboard";
import InsightsView from "./Insights";
import JournalView from "./Journal";
import { Card, TopTab, IconSun, IconMoon } from "./components/UI";
import {
  Shot, Msg, ViewKey, mean, stddev, n, isoDate, clamp,
  coalesceSmash, coalesceFaceToPath, fpOf, XLSX, orderIndex, ClubRow
} from "./utils";

/* =========================
   Small local helpers
========================= */

const norm = (s: any) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+|[\-_()/]/g, "");

// ensure number (Shot numeric fields are `number`, not optional)
const num = (v: any): number => {
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
   Footer (new)
========================= */
function Footer({ T }: { T: Theme }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-6 border-t" style={{ borderColor: T.border, background: T.bg }}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-2">
        <div className="text-xs" style={{ color: T.textDim }}>
          © {year} Launch Tracker
        </div>
        <nav className="flex items-center gap-3 text-xs">
          <a
            href="https://github.com/mcgonzalez79/launch-tracker"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-2 hover:underline"
            style={{ color: T.text }}
          >
            GitHub
          </a>
          <span aria-hidden="true" style={{ color: T.textDim }}>•</span>
          <a href="#" className="underline-offset-2 hover:underline" style={{ color: T.text }}>
            Privacy
          </a>
          <span aria-hidden="true" style={{ color: T.textDim }}>•</span>
          <a href="#" className="underline-offset-2 hover:underline" style={{ color: T.text }}>
            Terms
          </a>
        </nav>
      </div>
    </footer>
  );
}

/* =========================
   App
========================= */
export default function App() {
  // Theme
  const [dark, setDark] = useState<boolean>(() => {
    try { return localStorage.getItem("launch-tracker:theme") === "dark"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:theme", dark ? "dark" : "light"); } catch {} }, [dark]);
  const T: Theme = dark ? DARK : LIGHT;

  // View
  const [view, setView] = useState<ViewKey>(() => {
    try { return (localStorage.getItem("launch-tracker:view") as ViewKey) || "dashboard"; } catch { return "dashboard"; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:view", view); } catch {} }, [view]);

  // Messages (toasts)
  const [msgs, setMsgs] = useState<Msg[]>([]);
  function toast(msg: Omit<Msg, "id">) {
    const withId: Msg = { ...msg, id: Date.now() };
    setMsgs((m) => [...m, withId]);
    setTimeout(() => setMsgs((m) => m.slice(1)), 3500);
  }

  // Data
  const [shots, setShots] = useState<Shot[]>(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:shots");
      return raw ? (JSON.parse(raw) as Shot[]) : [];
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

  function processWorkbook(wb: XLSX.WorkBook, _textFromCSV: string | null, filename: string) {
    // Choose first non-empty sheet
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

    const header = (rows[0] || []).map((h) => String(h ?? ""));
    const dataRows = rows.slice(1);

    const get = (r: any[], variants: string[]): any => {
      const i = idxOf(header, variants);
      return i >= 0 ? r[i] : null;
    };

    const newShots: Shot[] = dataRows.map((r) => {
  // helpers
  const dateRaw = String(get(r, ["date"]) ?? "").trim();
  const sessionByDay = dateRaw.split(" ")[0] || "Unknown Session";
  const clubName = String(get(r, ["club name"]) ?? "").trim();
  const clubType = String(get(r, ["club type"]) ?? "").trim();

  const s: Shot = {
    // strings
    SessionId: sessionByDay,
    Club: clubName || clubType || "Unknown Club",
    Timestamp: isoDate(dateRaw),

    // numbers (ensure number type with `num`)
    ClubSpeed_mph:      num(get(r, ["club speed"])),
    AttackAngle_deg:    num(get(r, ["attack angle"])),
    ClubPath_deg:       num(get(r, ["club path"])),
    ClubFace_deg:       num(get(r, ["club face"])),
    FaceToPath_deg:     num(get(r, ["face to path"])),
    BallSpeed_mph:      num(get(r, ["ball speed"])),
    SmashFactor:        num(get(r, ["smash factor"])),
    LaunchAngle_deg:    num(get(r, ["launch angle"])),
    // CSV has "Launch Direction" and "Spin Axis" if you add them to Shot later.
    ApexHeight_yds:     num(get(r, ["apex height"])),
    CarryDistance_yds:  num(get(r, ["carry distance"])),
    // Treat lateral miss at carry as offline
    CarryDeviationDistance_yds: num(get(r, ["carry deviation distance"])),
    TotalDeviationDistance_yds: num(get(r, ["total deviation distance"])),
    TotalDistance_yds:  num(get(r, ["total distance"])),
    LaunchDirection_deg: num(get(r, ["launch direction"])),

  };

  return applyDerived(s);
});



    // Merge & de-dupe by (Timestamp+Club+Carry+Ball+ClubSpeed)
    const keyOf = (s: Shot) =>
      [s.Timestamp ?? "", s.Club, s.CarryDistance_yds ?? 0, s.BallSpeed_mph ?? 0, s.ClubSpeed_mph ?? 0].join("|");

    const existing = new Map(shots.map(s => [keyOf(s), s]));
    const merged = [...existing.values()];
    let added = 0;
    for (const s of newShots) {
      const k = keyOf(s);
      if (!existing.has(k)) {
        existing.set(k, s);
        merged.push(s);
        added++;
      }
    }
    setShots(merged);
    toast({ type: "success", text: `Imported ${added} new shots from ${filename}` });
  }

 /* =========================
   Export (CSV aligned to Shot)
========================= */
function exportShotsCSV() {
  // Keep this list in sync with your Shot interface & the fields you actually populate in processWorkbook
  const headers = [
    "Timestamp", "SessionId", "Club",
    "CarryDistance_yds", "TotalDistance_yds",
    "BallSpeed_mph", "ClubSpeed_mph",
    "LaunchAngle_deg", "LaunchDirection_deg",
    "ApexHeight_yds",
    "CarryDeviationDistance_yds", "TotalDeviationDistance_yds",
    "ClubFace_deg", "ClubPath_deg", "AttackAngle_deg",
    "SmashFactor", "FaceToPath_deg"
  ];

  const esc = (v: any) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };

  const lines = [
    headers.join(","),
    ...shots.map(s => headers.map(h => esc((s as any)[h])).join(",")),
  ];

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.download = `launch-tracker_${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}


  /* =========================
     Filters state (names match Filters.tsx)
  ========================= */
  const [selectedClubs, setSelectedClubs] = useState<string[]>([]);
  const [sessionFilter, setSessionFilter] = useState<string>("ALL");
  const [excludeOutliers, setExcludeOutliers] = useState<boolean>(false);

  const [dateFrom, setDateFrom] = useState<string>(""); // ISO yyyy-mm-dd or ""
  const [dateTo, setDateTo] = useState<string>("");     // ISO yyyy-mm-dd or ""

  const [carryMin, setCarryMin] = useState<string>("");
  const [carryMax, setCarryMax] = useState<string>("");

  const carryMinNum = useMemo(() => (carryMin ? parseFloat(carryMin) : undefined), [carryMin]);
  const carryMaxNum = useMemo(() => (carryMax ? parseFloat(carryMax) : undefined), [carryMax]);

  // Filters panel size → for Journal default height
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

  // Card order (merge-safe)
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    const DEFAULT = ["kpis", "shape", "dispersion", "gap", "eff", "table"]; // "launchspin" removed
    try {
      const raw = localStorage.getItem("launch-tracker:card-order");
      const saved = raw ? JSON.parse(raw) : null;
      if (Array.isArray(saved) && saved.length) return Array.from(new Set([...saved, ...DEFAULT])).filter(k => DEFAULT.includes(k));
      return DEFAULT;
    } catch { return DEFAULT; }
  });
  useEffect(() => { if (!cardOrder.length) { setCardOrder(["kpis", "shape", "dispersion", "gap", "eff", "table"]); } }, []);
  useEffect(() => { try { localStorage.setItem("launch-tracker:card-order", JSON.stringify(cardOrder)); } catch {} }, [cardOrder]);

  // Insights order (merge-safe)
  const INSIGHTS_DEFAULT = ["distanceBox", "highlights", "swingMetrics", "warnings", "personalRecords", "progress", "weaknesses"];
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
     File input helpers for Filters onImportFile
  ========================= */
  function onImportFile(file: File) {
    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        processWorkbook(wb, null, file.name);
      } catch (err) {
        console.error(err);
        toast({ type: "error", text: `Import failed: ${(err as Error).message}` });
      }
    })();
  }

  function onLoadSample() {
    toast({ type: "info", text: "Sample loader not implemented." });
  }

  function onPrintClubAverages() {
    window.print();
  }

  function onDeleteSession() {
    if (sessionFilter === "ALL") return;
    const remaining = shots.filter(s => (s.SessionId ?? "Unknown Session") !== sessionFilter);
    setShots(remaining);
    toast({ type: "warn", text: `Deleted session "${sessionFilter}"` });
  }

  function onDeleteAll() {
    if (!shots.length) return;
    setShots([]);
    toast({ type: "warn", text: "Deleted all shots" });
  }

  /* =========================
     Filtering (aligned to Filters props)
  ========================= */
  const filteredBase = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;

    return shots.filter(s => {
      if (sessionFilter !== "ALL" && (s.SessionId ?? "Unknown Session") !== sessionFilter) return false;
      if (selectedClubs.length && !selectedClubs.includes(s.Club)) return false;

      if (from && s.Timestamp) {
        try { if (new Date(s.Timestamp) < from) return false; } catch {}
      }
      if (to && s.Timestamp) {
        try { if (new Date(s.Timestamp) > to) return false; } catch {}
      }

      if (s.CarryDistance_yds != null) {
        if (carryMinNum != null && s.CarryDistance_yds < carryMinNum) return false;
        if (carryMaxNum != null && s.CarryDistance_yds > carryMaxNum) return false;
      }
      return true;
    });
  }, [shots, sessionFilter, selectedClubs, dateFrom, dateTo, carryMinNum, carryMaxNum]);

  const filteredOutliers = useMemo(() => {
    if (!excludeOutliers) return filteredBase;
    // TODO: implement per-club outlier filter if desired
    return filteredBase;
  }, [filteredBase, excludeOutliers]);

  const filtered = filteredBase;

  const tableRows = useMemo(() => {
    const rows: ClubRow[] = [];
    return rows;
  }, [filteredOutliers]);

  /* =========================
     KPIs
  ========================= */
  const kCarry = useMemo(() => {
    const v = filteredOutliers.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
    return { mean: mean(v), n: n(v), std: stddev(v) };
  }, [filteredOutliers]);

  const kBall = useMemo(() => {
    const v = filteredOutliers.map(s => s.BallSpeed_mph).filter((x): x is number => x != null);
    return { mean: mean(v), n: n(v), std: stddev(v) };
  }, [filteredOutliers]);

  const kClub = useMemo(() => {
    const v = filteredOutliers.map(s => s.ClubSpeed_mph).filter((x): x is number => x != null);
    return { mean: mean(v), n: n(v), std: stddev(v) };
  }, [filteredOutliers]);

  const kSmash = useMemo(() => {
    const v = filteredOutliers.map(s => s.SmashFactor).filter((x): x is number => x != null);
    return { mean: mean(v), n: n(v), std: stddev(v) };
  }, [filteredOutliers]);

  const hasData = filteredOutliers.length > 0;
  const kpis = { carry: kCarry, ball: kBall, club: kClub, smash: kSmash };

  /* =========================
     Journal state
  ========================= */
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [journalHTML, setJournalHTML] = useState<string>(() => {
    try {
      const k = "launch-tracker:journal:ALL";
      return localStorage.getItem(k) || "";
    } catch { return ""; }
  });
  const journalKey = useMemo(
    () => `Journal — ${sessionFilter === "ALL" ? "All Sessions" : sessionFilter}`,
    [sessionFilter]
  );
  useEffect(() => {
    try {
      const k = `launch-tracker:journal:${sessionFilter}`;
      const raw = localStorage.getItem(k);
      setJournalHTML(raw || "");
    } catch { setJournalHTML(""); }
  }, [sessionFilter]);
  useEffect(() => {
    try {
      const k = `launch-tracker:journal:${sessionFilter}`;
      localStorage.setItem(k, journalHTML);
    } catch {}
  }, [sessionFilter, journalHTML]);

  /* =========================
     Drag & drop handlers
  ========================= */
  const dragKey = useRef<string | null>(null);
  const onDragStart = (key: string) => (e: React.DragEvent) => {
    dragKey.current = key;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (key: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragKey.current === key) return;
    setCardOrder(o => {
      const from = o.indexOf(dragKey.current!);
      const to = o.indexOf(key);
      if (from < 0 || to < 0) return o;
      const copy = o.slice();
      const [k] = copy.splice(from, 1);
      copy.splice(to, 0, k);
      return copy;
    });
  };
  const onDrop = (_key: string) => (_: React.DragEvent) => { dragKey.current = null; };

  const dragKey2 = useRef<string | null>(null);
  const onDragStart2 = (key: string) => (e: React.DragEvent) => {
    dragKey2.current = key;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver2 = (key: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragKey2.current === key) return;
    setInsightsOrder(o => {
      const from = o.indexOf(dragKey2.current!);
      const to = o.indexOf(key);
      if (from < 0 || to < 0) return o;
      const copy = o.slice();
      const [k] = copy.splice(from, 1);
      copy.splice(to, 0, k);
      return copy;
    });
  };
  const onDrop2 = (_key: string) => (_: React.DragEvent) => { dragKey2.current = null; };

  /* =========================
     Render
  ========================= */
  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.text }}>
      {/* Top bar */}
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">Launch Tracker</div>
          <div className="hidden md:block text-xs" style={{ color: T.textDim }}>
            Analyze carry, dispersion, efficiency, and progress
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md px-2 py-1 border"
            style={{ background: T.panel, borderColor: T.border, color: T.text }}
            onClick={() => setDark(d => !d)}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <IconSun /> : <IconMoon />}
          </button>
          <button
            className="rounded-md px-3 py-1 border"
            style={{ background: T.brand, borderColor: T.brand, color: T.white }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".xlsx,.xls,.csv";
              input.onchange = (e: any) => {
                const file = e.target?.files?.[0];
                if (file) onImportFile(file);
              };
              input.click();
            }}
          >
            Import
          </button>
          <button
            className="rounded-md px-3 py-1 border"
            style={{ background: T.panel, borderColor: T.border, color: T.text }}
            onClick={exportShotsCSV}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="max-w-6xl mx-auto px-4 pb-6">
        {/* Filters panel (props match Filters.tsx) */}
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
            onExportCSV={exportShotsCSV}
            onPrintClubAverages={onPrintClubAverages}
            onDeleteSession={onDeleteSession}
            onDeleteAll={onDeleteAll}
          />
        </div>

        {/* Tabs */}
        <div className="mt-4">
          <div className="flex gap-2 items-center">
            <TopTab label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} theme={T} />
            <TopTab label="Insights" active={view === "insights"} onClick={() => setView("insights")} theme={T} />
            <TopTab label="Journal" active={view === "journal"} onClick={() => setView("journal")} theme={T} />
          </div>

          <div className="mt-4">
            {view === "dashboard" && (
              <DashboardCards
                theme={T}
                cardOrder={cardOrder}
                setCardOrder={setCardOrder}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                hasData={hasData}
                kpis={kpis}
                filteredOutliers={filteredOutliers}
                filtered={filtered}
                shots={shots}
                tableRows={tableRows}
                clubs={clubs}
              />
            )}

            {view === "insights" && (
              <InsightsView
                theme={T}
                tableRows={tableRows}
                filteredOutliers={filteredOutliers}
                filteredNoClubOutliers={filteredOutliers}
                filteredNoClubRaw={filtered}
                allClubs={clubs}
                insightsOrder={insightsOrder}
                onDragStart={onDragStart2}
                onDragOver={onDragOver2}
                onDrop={onDrop2}
              />
            )}

            {view === "journal" && (
              <JournalView
                theme={T}
                editorRef={editorRef}
                value={journalHTML}
                onInputHTML={setJournalHTML}
                sessionLabel={journalKey}
                defaultHeightPx={filtersHeight}
              />
            )}

            <Footer T={T} />
          </div>
        </div>
      </div>
    </div>
  );
}
