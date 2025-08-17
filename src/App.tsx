import React, { useEffect, useMemo, useRef, useState } from "react";
import { LIGHT, DARK, Theme } from "./theme";
import FiltersPanel from "./Filters";
import DashboardCards from "./Dashboard";
import InsightsView from "./Insights";
import JournalView from "./Journal";
import { Card, TopTab, IconSun, IconMoon } from "./components/UI";
import {
  Shot, ClubRow, Msg, ViewKey, mean, stddev, n, isoDate, clamp, coalesceSmash, coalesceFaceToPath,
  normalizeHeader, headerMap, findBestHeader, parseWeirdLaunchCSV, weirdRowsToShots, fpOf, exportCSV, XLSX, orderIndex
} from "./utils";

/* ===== App ===== */
// --- Footer (new) ---
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
  function toast(msg: Msg) {
    setMsgs(m => [...m, { ...msg, id: Math.random().toString(36).slice(2) }]);
    setTimeout(() => setMsgs(m => m.slice(1)), 3500);
  }

  // Data
  const [shots, setShots] = useState<Shot[]>(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:shots");
      return raw ? (JSON.parse(raw) as Shot[]) : [];
    } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:shots", JSON.stringify(shots)); } catch {} }, [shots]);

  // Derived session/club lists
  const clubs = useMemo(() => Array.from(new Set(shots.map(s => s.Club))).sort((a, b) => orderIndex(a) - orderIndex(b)), [shots]);
  const sessions = useMemo(() => ["ALL", ...Array.from(new Set(shots.map(s => s.SessionId ?? "Unknown Session"))).sort()], [shots]);

  const carryBounds = useMemo(() => {
    const vals = shots.map(s => s.CarryDistance_yds).filter((v): v is number => v !== undefined);
    if (!vals.length) return { min: 0, max: 0 };
    return { min: Math.floor(Math.min(...vals)), max: Math.ceil(Math.max(...vals)) };
  }, [shots]);

  /* ===== Import processing (XLSX/CSV + dedupe) ===== */
  function applyDerived(s: Shot): Shot {
    const s2 = { ...s };
    const Sm = coalesceSmash(s2);
    const F2P = coalesceFaceToPath(s2);
    if (Sm !== undefined) s2.SmashFactor = clamp(Sm, 0.5, 1.95);
    if (F2P !== undefined) s2.FaceToPath_deg = F2P;
    return s2;
  }

  function processWorkbook(wb: XLSX.WorkBook, textFromCSV: string | null, filename: string) {
    const firstSheet =
      wb.SheetNames.find(n => {
        const ws = wb.Sheets[n];
        const rr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
        return rr && rr.flat().some(v => v !== null && v !== "");
      }) || wb.SheetNames[0];

    const ws = wb.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
    const headers = (rows[0] || []).map((h) => normalizeHeader(String(h ?? "")));

    // Find mapped headers
    const mapped = headerMap(headers);

    // If we detect a “weird” CSV form (no headers, Launch Monitor export etc.), try the heuristic parser
    let newShots: Shot[] = [];
    if (!mapped.anyMapped && textFromCSV) {
      try {
        const weird = parseWeirdLaunchCSV(textFromCSV);
        if (weird.rows.length) {
          newShots = weirdRowsToShots(weird.rows).map(applyDerived);
        }
      } catch (e) {
        console.warn("weird CSV parse failed", e);
      }
    }

    if (!newShots.length) {
      const dataRows = rows.slice(1); // skip header row
      newShots = dataRows.map((r) => {
        const get = (name: string): any => {
          const idx = findBestHeader(headers, name);
          return idx >= 0 ? r[idx] : null;
        };
        const s: Shot = {
          Date: isoDate(get("Date") || get("Timestamp") || get("Time")),
          SessionId: String(get("Session") ?? get("SessionId") ?? get("Set") ?? "Unknown Session"),
          Club: String(get("Club") ?? get("ClubType") ?? get("Club Name") ?? "Unknown Club"),
          CarryDistance_yds: fpOf(get("CarryDistance_yds") ?? get("Carry (yds)")),
          TotalDistance_yds: fpOf(get("TotalDistance_yds") ?? get("Total (yds)")),
          BallSpeed_mph: fpOf(get("BallSpeed_mph") ?? get("Ball Speed")),
          ClubSpeed_mph: fpOf(get("ClubSpeed_mph") ?? get("Club Speed")),
          LaunchAngle_deg: fpOf(get("LaunchAngle_deg") ?? get("Launch Angle")),
          Spin_rpm: fpOf(get("Spin_rpm") ?? get("Spin")),
          PeakHeight_yds: fpOf(get("PeakHeight_yds") ?? get("Apex") ?? get("Peak Height")),
          LandingAngle_deg: fpOf(get("LandingAngle_deg") ?? get("Descent Angle") ?? get("Landing Angle")),
          Offline_yds: fpOf(get("Offline_yds") ?? get("Offline")),
          Side_deg: fpOf(get("Side_deg") ?? get("Face Angle") ?? get("Face")),
          Path_deg: fpOf(get("Path_deg") ?? get("Club Path") ?? get("Path")),
          AttackAngle_deg: fpOf(get("AttackAngle_deg") ?? get("AoA") ?? get("Attack Angle")),
          SmashFactor: fpOf(get("SmashFactor") ?? get("Smash")),
          FaceToPath_deg: fpOf(get("FaceToPath_deg") ?? get("Face to Path") ?? get("F2P")),
          Notes: String(get("Notes") ?? ""),
        };
        return applyDerived(s);
      });
    }

    // Merge & de-dupe by (Date+Club+Carry+Ball+ClubSpeed)
    const keyOf = (s: Shot) => [s.Date, s.Club, s.CarryDistance_yds ?? 0, s.BallSpeed_mph ?? 0, s.ClubSpeed_mph ?? 0].join("|");
    const existing = new Map(shots.map(s => [keyOf(s), s]));
    const merged = [...existing.values()];
    for (const s of newShots) {
      const k = keyOf(s);
      if (!existing.has(k)) merged.push(s);
    }
    setShots(merged);
    toast({ kind: "ok", text: `Imported ${newShots.length} new shots from ${filename}` });
  }

  /* ===== Export ===== */
  function exportShotsCSV() {
    const csv = exportCSV(shots);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `launch-tracker_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ===== Filters state (lifted) ===== */
  const [selectedSession, setSelectedSession] = useState<string>("ALL");
  const [selectedClubs, setSelectedClubs] = useState<string[]>([]);
  const [includeOutliers, setIncludeOutliers] = useState<boolean>(true);
  const [carryRange, setCarryRange] = useState<[number, number]>(() => [0, 450]);
  const [datePreset, setDatePreset] = useState<string>("All Time");

  // Persist/restore filters
  useEffect(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:filters");
      if (!raw) return;
      const f = JSON.parse(raw);
      setSelectedSession(f.selectedSession ?? "ALL");
      setSelectedClubs(f.selectedClubs ?? []);
      setIncludeOutliers(f.includeOutliers ?? true);
      setCarryRange(f.carryRange ?? [0, 450]);
      setDatePreset(f.datePreset ?? "All Time");
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("launch-tracker:filters", JSON.stringify({
        selectedSession, selectedClubs, includeOutliers, carryRange, datePreset
      }));
    } catch {}
  }, [selectedSession, selectedClubs, includeOutliers, carryRange, datePreset]);

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
  }, [filtersRef.current, shots, selectedClubs, selectedSession, includeOutliers, carryRange, datePreset]);

  // Card order (merge-safe)
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    const DEFAULT = ["kpis", "shape", "dispersion", "gap", "eff", "table"];
    try {
      const raw = localStorage.getItem("launch-tracker:card-order");
      const saved = raw ? JSON.parse(raw) : null;
      if (Array.isArray(saved) && saved.length) return Array.from(new Set([...saved, ...DEFAULT])).filter(k => DEFAULT.includes(k));
      return DEFAULT;
    } catch { return ["kpis", "shape", "dispersion", "gap", "eff", "table"]; }
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

  // Journal
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [journalHTML, setJournalHTML] = useState<string>(() => {
    try {
      const k = "launch-tracker:journal:ALL";
      return localStorage.getItem(k) || "";
    } catch { return ""; }
  });
  const journalKey = useMemo(() => `Journal — ${selectedSession === "ALL" ? "All Sessions" : selectedSession}`, [selectedSession]);
  useEffect(() => {
    try {
      const k = `launch-tracker:journal:${selectedSession}`;
      const raw = localStorage.getItem(k);
      setJournalHTML(raw || "");
    } catch { setJournalHTML(""); }
  }, [selectedSession]);
  useEffect(() => {
    try {
      const k = `launch-tracker:journal:${selectedSession}`;
      localStorage.setItem(k, journalHTML);
    } catch {}
  }, [selectedSession, journalHTML]);

  /* ===== Drag & drop reordering (cards + insights) ===== */
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
  const onDrop = (key: string) => (_: React.DragEvent) => { dragKey.current = null; };

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
  const onDrop2 = (key: string) => (_: React.DragEvent) => { dragKey2.current = null; };

  /* ===== File input handling ===== */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  function onClickImport() {
    fileInputRef.current?.click();
  }
  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      let textCSV: string | null = null;
      if (file.name.toLowerCase().endsWith(".csv")) {
        textCSV = new TextDecoder("utf-8").decode(new Uint8Array(buffer));
      }
      const wb = XLSX.read(buffer, { type: "array" });
      processWorkbook(wb, textCSV, file.name);
      e.currentTarget.value = "";
    } catch (err) {
      console.error(err);
      toast({ kind: "error", text: `Import failed: ${(err as Error).message}` });
    }
  }

  /* ===== Filtered data selection ===== */
  const filtered = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    if (datePreset === "Last 7 Days") start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    else if (datePreset === "Last 30 Days") start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    else if (datePreset === "Year to Date") start = new Date(now.getFullYear(), 0, 1);

    return shots.filter(s => {
      if (selectedSession !== "ALL" && (s.SessionId ?? "Unknown Session") !== selectedSession) return false;
      if (selectedClubs.length && !selectedClubs.includes(s.Club)) return false;
      if (!includeOutliers) {
        // naïve outlier filter: drop anything > 3σ for carry within club
        // compute by club
        // we can optimize later if needed
      }
      if (start && s.Date) {
        try {
          const d = new Date(s.Date);
          if (d < start) return false;
        } catch {}
      }
      if (s.CarryDistance_yds != null) {
        if (s.CarryDistance_yds < carryRange[0] || s.CarryDistance_yds > carryRange[1]) return false;
      }
      return true;
    });
  }, [shots, selectedSession, selectedClubs, includeOutliers, carryRange, datePreset]);

  /* ===== KPI samples ===== */
  const kCarry = useMemo(() => {
    const v = filtered.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
    return { mean: mean(v), n: n(v), std: stddev(v) };
  }, [filtered]);

  const kBall = useMemo(() => {
    const v = filtered.map(s => s.BallSpeed_mph).filter((x): x is number => x != null);
    return { mean: mean(v), n: n(v), std: stddev(v) };
  }, [filtered]);

  const kClub = useMemo(() => {
    const v = filtered.map(s => s.ClubSpeed_mph).filter((x): x is number => x != null);
    return { mean: mean(v), n: n(v), std: stddev(v) };
  }, [filtered]);

  const kSmash = useMemo(() => {
    const v = filtered.map(s => s.SmashFactor).filter((x): x is number => x != null);
    return { mean: mean(v), n: n(v), std: stddev(v) };
  }, [filtered]);

  /* ===== Render ===== */
  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.text }}>
      {/* Top bar */}
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">Launch Tracker</div>
          <div className="hidden md:block text-xs" style={{ color: T.textDim }}>Analyze carry, dispersion, efficiency, and progress</div>
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
            onClick={onClickImport}
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
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileSelected} />
        </div>
      </div>

      {/* Content area */}
      <div className="max-w-6xl mx-auto px-4 pb-6">
        <Card title="Filters" theme={T}>
          <div ref={filtersRef}>
            <FiltersPanel
              theme={T}
              sessions={sessions}
              clubs={clubs}
              carryBounds={carryBounds}
              selectedSession={selectedSession}
              onSession={setSelectedSession}
              selectedClubs={selectedClubs}
              onClubs={setSelectedClubs}
              includeOutliers={includeOutliers}
              onOutliers={setIncludeOutliers}
              carryRange={carryRange}
              onCarryRange={setCarryRange}
              datePreset={datePreset}
              onDatePreset={setDatePreset}
              onReset={() => {
                setSelectedSession("ALL");
                setSelectedClubs([]);
                setIncludeOutliers(true);
                setCarryRange([0, 450]);
                setDatePreset("All Time");
              }}
            />
          </div>
        </Card>

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
                shots={filtered}
                clubs={clubs}
                order={cardOrder}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
              />
            )}

            {view === "insights" && (
              <InsightsView
                theme={T}
                shots={filtered}
                clubs={clubs}
                order={insightsOrder}
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
