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
type ToastType = "info" | "success" | "warn" | "error";
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

function safeNum(n: unknown): number | undefined {
  if (typeof n === "string" && n.trim() === "") return undefined;
  const x = Number(n);
  return Number.isFinite(x) ? x : undefined;
}

function clampNum(n: number | undefined, lo: number, hi: number): number | undefined {
  return n === undefined ? undefined : Math.max(lo, Math.min(hi, n));
}

function tryParseDate(s: string): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  if (isNaN(+d)) return undefined;
  return d.toISOString();
}

/* =====================================================
   UI: Simple pill for toast
===================================================== */
function ToastRow({ msg, onClose, theme: T }: { msg: Msg; onClose: () => void; theme: Theme }) {
  const C =
    msg.type === "success" ? T.success :
    msg.type === "warn"    ? T.warn :
    msg.type === "error"   ? T.error :
                             T.info;
  return (
    <div className="rounded px-3 py-2 text-sm shadow" style={{ background: C.bg, color: C.fg, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-3">
        <div>{msg.text}</div>
        <button className="ml-auto underline" onClick={onClose} style={{ color: C.fg }}>dismiss</button>
      </div>
    </div>
  );
}

/* =========================
   App
========================= */
export default function App() {
  // Theme
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem("launch-tracker:theme") || "dark") === "light" ? LIGHT : DARK; } catch { return DARK; }
  });
  useEffect(() => {
    try { localStorage.setItem("launch-tracker:theme", theme === LIGHT ? "light" : "dark"); } catch {}
    document.documentElement.style.setProperty("color-scheme", theme === LIGHT ? "light" : "dark");
  }, [theme]);

  // View
  const [tab, setTab] = useState<ViewKey>(() => {
    try { return (localStorage.getItem("launch-tracker:tab") as ViewKey) || "dashboard"; } catch { return "dashboard"; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:tab", tab); } catch {} }, [tab]);

  // Toasts
  const { msgs, push: toast, remove: removeToast } = useToasts();

  // Data
  const [shots, setShots] = useState<Shot[]>(() => {
    try { const raw = localStorage.getItem("launch-tracker:shots"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:shots", JSON.stringify(shots)); } catch {} }, [shots]);

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Orders
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    try { const raw = localStorage.getItem("launch-tracker:card-order"); return raw ? JSON.parse(raw) : ["kpis", "gapping", "efficiency", "shape", "dispersion", "table"]; } catch { return ["kpis", "gapping", "efficiency", "shape", "dispersion", "table"]; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:card-order", JSON.stringify(cardOrder)); } catch {} }, [cardOrder]);

  const [insightsOrder, setInsightsOrder] = useState<string[]>(() => {
    try { const raw = localStorage.getItem("launch-tracker:insights-order"); return raw ? JSON.parse(raw) : ["distance", "highlights", "records", "swing", "progress", "benchmarks"]; } catch { return ["distance", "highlights", "records", "swing", "progress", "benchmarks"]; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:insights-order", JSON.stringify(insightsOrder)); } catch {} }, [insightsOrder]);

  // Journal content
  const [journalHTML, setJournalHTML] = useState<string>(() => {
    try { return localStorage.getItem("launch-tracker:journal") || ""; } catch { return ""; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:journal", journalHTML); } catch {} }, [journalHTML]);

  // Theme alias
  const T = theme;

  // Derived data & filters
  const [session, setSession] = useState<string>("All Sessions");
  const [clubsSel, setClubsSel] = useState<string[]>([]);
  const [dateStart, setDateStart] = useState<string | undefined>();
  const [dateEnd, setDateEnd] = useState<string | undefined>();
  const [carryMin, setCarryMin] = useState<number | undefined>();
  const [carryMax, setCarryMax] = useState<number | undefined>();
  const [carryAuto, setCarryAuto] = useState<boolean>(false);
  const [excludeOutliers, setExcludeOutliers] = useState<boolean>(false);

  const sessions = useMemo(() => {
    const set = new Set<string>();
    shots.forEach(s => set.add(s.Session || "Unknown Session"));
    return ["All Sessions", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [shots]);

  const clubs = useMemo(() => {
    const set = new Set<string>();
    shots.forEach(s => set.add(s.Club));
    return Array.from(set).sort((a, b) => orderIndex(a) - orderIndex(b));
  }, [shots]);

  // Filtered shots
  const filtered = useMemo(() => {
    let arr = shots.slice();
    if (session !== "All Sessions") arr = arr.filter(s => (s.Session || "Unknown Session") === session);
    if (clubsSel.length > 0) arr = arr.filter(s => clubsSel.includes(s.Club));

    // Date filter
    if (dateStart) {
      const s = new Date(dateStart).getTime();
      arr = arr.filter(x => {
        const t = new Date(x.Date).getTime();
        return !isNaN(t) && t >= s;
      });
    }
    if (dateEnd) {
      const e = new Date(dateEnd).getTime();
      arr = arr.filter(x => {
        const t = new Date(x.Date).getTime();
        return !isNaN(t) && t <= e;
      });
    }

    // Carry range
    if (carryMin !== undefined) arr = arr.filter(s => isNum(s.Carry) && s.Carry! >= carryMin);
    if (carryMax !== undefined) arr = arr.filter(s => isNum(s.Carry) && s.Carry! <= carryMax);

    // Outlier exclusion (Tukey IQR on Carry)
    if (excludeOutliers) {
      const carries = arr.map(s => s.Carry).filter(isNum) as number[];
      if (carries.length >= 4) {
        const sorted = carries.slice().sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lo = q1 - 1.5 * iqr;
        const hi = q3 + 1.5 * iqr;
        arr = arr.filter(s => !isNum(s.Carry) || (s.Carry! >= lo && s.Carry! <= hi));
      }
    }

    return arr;
  }, [shots, session, clubsSel, dateStart, dateEnd, carryMin, carryMax, excludeOutliers]);

  // Table rows by club
  const tableRows: ClubRow[] = useMemo(() => {
    const byClub = new Map<string, Shot[]>();
    filtered.forEach(s => {
      if (!byClub.has(s.Club)) byClub.set(s.Club, []);
      byClub.get(s.Club)!.push(s);
    });
    const rows: ClubRow[] = Array.from(byClub.entries()).map(([club, arr]) => {
      const n = arr.length;
      const avgCarry = mean(arr.map(x => x.Carry));
      const avgTotal = mean(arr.map(x => x.Total));
      const avgCS = mean(arr.map(x => x.ClubSpeed));
      const avgBS = mean(arr.map(x => x.BallSpeed));
      const avgLA = mean(arr.map(x => x.LaunchAngle));
      const avgF2P = mean(arr.map(x => x.FaceToPath_deg));
      return { club, count: n, avgCarry, avgTotal, avgCS, avgBS, avgLA, avgF2P };
    }).sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
    return rows;
  }, [filtered]);

  // Stats for KPIs
  const kpis = useMemo(() => {
    const carries = filtered.map(s => s.Carry).filter(isNum) as number[];
    const clubs = filtered.map(s => s.ClubSpeed).filter(isNum) as number[];
    const balls = filtered.map(s => s.BallSpeed).filter(isNum) as number[];

    const smash = coalesceSmash(filtered.map(coalesceSmash)).filter(isNum) as number[];
    const carryM = mean(carries), carryN = carries.length, carrySD = stddev(carries);
    const clubM = mean(clubs), clubN = clubs.length, clubSD = stddev(clubs);
    const ballM = mean(balls), ballN = balls.length, ballSD = stddev(balls);
    const smashM = mean(smash), smashN = smash.length, smashSD = stddev(smash);

    return {
      carry: { mean: carryM, n: carryN, std: carrySD },
      club:  { mean: clubM,  n: clubN,  std: clubSD },
      ball:  { mean: ballM,  n: ballN,  std: ballSD },
      smash: { mean: smashM, n: smashN, std: smashSD }
    };
  }, [filtered]);

  // Journal ref
  const journalRef = useRef<HTMLDivElement>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import handlers
  async function onImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = text.split(/\r?\n/).map(line => line.split(","));
      const header = rows[0] || [];
      const data = rows.slice(1).filter(r => r.length > 1 && r.some(x => x.trim() !== ""));
      const shots = rowsToShots(header, data, file.name);
      setShots(prev => [...prev, ...shots]);
      toast({ type: "success", text: `Imported ${shots.length} shots from ${file.name}` });
    } catch (err: any) {
      toast({ type: "error", text: `Import failed: ${err?.message || err}` });
    } finally {
      e.target.value = "";
    }
  }

  function rowsToShots(headerRow: any[], dataRows: any[][], filename: string): Shot[] {
    const header = headerRow.map(h => String(h ?? ""));
    const hNorm = header.map(h => normalizeHeader(h));
    const idx = (name: string) => hNorm.findIndex(h => h === name);

    return dataRows.map((row) => {
      const dateRaw = String(row[idx("date")] ?? row[idx("timestamp")] ?? row[idx("datetime")] ?? "").trim();
      const sessionByDay = (dateRaw.split(" ")[0] || "Unknown Session");
      const clubIdx = (() => { for (const c of ["club name", "club", "stick", "stick name"]) { const i = idx(c); if (i >= 0) return i; } return -1; })();
      const clubVal = clubIdx >= 0 ? String(row[clubIdx] ?? "").trim() : "Unknown Club";

      const s: Shot = {
        Date: tryParseDate(dateRaw) || new Date().toISOString(),
        Session: sessionByDay || "Unknown Session",
        Club: clubVal,
        Carry:  safeNum(row[idx("carry")]),
        Total:  safeNum(row[idx("total")]),
        ClubSpeed: safeNum(row[idx("club speed")]),
        BallSpeed: safeNum(row[idx("ball speed")]),
        LaunchAngle: clampNum(safeNum(row[idx("launch angle")]), -5, 45),
        FaceToPath_deg: clampNum(safeNum(row[idx("face to path")]), -15, 15),
        // Optional/raw metrics
        SmashFactor: clampNum(safeNum(row[idx("smash factor")]), 0.5, 1.95),
        // For weird CSVs:
        _filename: filename
      };

      // Derive smash if missing but speeds present
      if (!isNum(s.SmashFactor) && isNum(s.BallSpeed) && isNum(s.ClubSpeed) && s.ClubSpeed! > 0) {
        s.SmashFactor = clamp(s.BallSpeed! / s.ClubSpeed!, 0.5, 1.95);
      }

      return s;
    });
  }

  // Export CSV
  function onExportCSV() {
    const rows = shots.map(s => ({
      Date: s.Date,
      Session: s.Session,
      Club: s.Club,
      Carry: s.Carry,
      Total: s.Total,
      ClubSpeed: s.ClubSpeed,
      BallSpeed: s.BallSpeed,
      LaunchAngle: s.LaunchAngle,
      FaceToPath_deg: s.FaceToPath_deg,
      SmashFactor: s.SmashFactor
    }));
    const csv = exportCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "launch-tracker-export.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // Weird CSV import (XLSX path)
  async function onImportWeirdCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 }) as any[][];
      const header = rows[0] || [];
      const data = rows.slice(1).filter(r => r.length > 1 && r.some(x => String(x ?? "").trim() !== ""));
      const shots = weirdRowsToShots(header, data, file.name);
      setShots(prev => [...prev, ...shots]);
      toast({ type: "success", text: `Imported ${shots.length} shots from ${file.name}` });
    } catch (err: any) {
      toast({ type: "error", text: `Weird CSV import failed: ${err?.message || err}` });
    } finally {
      e.target.value = "";
    }
  }

  // Printing
  function onPrintClubAverages() {
    // Print the table (Dashboard table) only
    const el = document.getElementById("club-averages-table");
    if (!el) return;
    const w = window.open("", "_blank", "width=1200,height=800");
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>Club Averages</title>
          <style>
            body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 16px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: right; }
            th:first-child, td:first-child { text-align: left; }
          </style>
        </head>
        <body>${el.outerHTML}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  }

  // Drag helpers
  const dragKeyRef = useRef<string | null>(null);
  const onDragStart = (key: string) => (e: React.DragEvent) => { dragKeyRef.current = key; e.dataTransfer?.setData("text/plain", key); };
  const onDragOver  = (key: string) => (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop      = (key: string, order: string[], setOrder: (v: string[]) => void) => (e: React.DragEvent) => {
    e.preventDefault();
    const k = dragKeyRef.current; dragKeyRef.current = null;
    if (!k || k === key) return;
    const arr = order.slice();
    const from = arr.indexOf(k), to = arr.indexOf(key);
    if (from < 0 || to < 0) return;
    arr.splice(from, 1);
    arr.splice(to, 0, k);
    setOrder(arr);
  };

  // UI
  return (
    <div className="min-h-screen" style={{ background: T.appBg, color: T.text }}>
      {/* Top bar: tabs + theme */}
      <header className="border-b" style={{ borderColor: T.border, background: T.panel }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Mobile: open filters drawer */}
            <button
              className="md:hidden rounded-md px-2 py-1 border text-sm"
              style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
              onClick={() => setFiltersOpen(true)}
              title="Filters"
            >Filters</button>
            <div
              className="text-lg font-semibold"
              style={{
                width: 120,
                height: 32,
                backgroundImage: `url(${import.meta.env.BASE_URL}logo_horiz_color_120w.png)`,
                backgroundRepeat: "no-repeat",
                backgroundSize: "contain",
                backgroundPosition: "left center",
                textIndent: "-9999px",
                overflow: "hidden",
                whiteSpace: "nowrap"
              }}
            >Launch Tracker</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <TopTab label="Dashboard" active={tab === "dashboard"} onClick={() => setTab("dashboard")} theme={T} />
              <TopTab label="Insights"  active={tab === "insights"}  onClick={() => setTab("insights")}  theme={T} />
              <TopTab label="Journal"   active={tab === "journal"}   onClick={() => setTab("journal")}   theme={T} />
            </div>
            <button
              className="rounded-md px-2 py-1 border text-sm"
              style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
              onClick={() => setTheme(theme === LIGHT ? DARK : LIGHT)}
              title={theme === LIGHT ? "Use dark theme" : "Use light theme"}
            >
              {theme === LIGHT ? <IconMoon /> : <IconSun />}
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Filters + content */}
        <div className="flex gap-4">
          {/* Filters panel (drawer on mobile) */}
          <div className="w-72 shrink-0">
            <FiltersPanel
              theme={T}
              shots={shots}
              filtered={filtered}
              sessions={sessions}
              session={session} setSession={setSession}
              clubs={clubs}
              clubsSel={clubsSel} setClubsSel={setClubsSel}
              dateStart={dateStart} setDateStart={setDateStart}
              dateEnd={dateEnd} setDateEnd={setDateEnd}
              carryMin={carryMin} setCarryMin={setCarryMin}
              carryMax={carryMax} setCarryMax={setCarryMax}
              carryAuto={carryAuto} setCarryAuto={setCarryAuto}
              excludeOutliers={excludeOutliers} setExcludeOutliers={setExcludeOutliers}
              onImportCSV={onImportCSV}
              onImportWeirdCSV={onImportWeirdCSV}
              onExportCSV={onExportCSV}
              onPrintClubAverages={onPrintClubAverages}
              setFiltersOpen={setFiltersOpen}
              filtersOpen={filtersOpen}
            />
          </div>

          {/* Content area */}
          <div className="flex-1 min-w-0">
            {tab === "dashboard" && (
              <DashboardCards
                theme={T}
                cardOrder={cardOrder}
                setCardOrder={setCardOrder}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={(key) => onDrop(key, cardOrder, setCardOrder)}
                shots={shots}
                filtered={filtered}
                tableRows={tableRows}
              />
            )}
            {tab === "insights" && (
              <InsightsView
                theme={T}
                insightsOrder={insightsOrder}
                setInsightsOrder={setInsightsOrder}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={(key) => onDrop(key, insightsOrder, setInsightsOrder)}
                shots={shots}
                filtered={filtered}
                clubs={clubs}
                journalRef={journalRef}
              />
            )}
            {tab === "journal" && (
              <JournalView
                theme={T}
                refEl={journalRef}
                html={journalHTML}
                setHTML={setJournalHTML}
                label="Notes"
                minHeightPx={260}
              />
            )}
          </div>
        </div>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2">
        {msgs.map(m => (
          <ToastRow key={m.id} msg={m} onClose={() => removeToast(m.id)} theme={T} />
        ))}
      </div>
    </div>
  );
}
