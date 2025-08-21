import React, { useEffect, useMemo, useRef, useState } from "react";
import { LIGHT, DARK, Theme, orderIndex } from "./theme";
import FiltersPanel from "./Filters";
import DashboardCards from "./Dashboard";
import InsightsView from "./Insights";
import JournalView from "./Journal";
import { TopTab, IconSun, IconMoon } from "./components/UI";
import {
  Shot, Msg, ViewKey, mean, stddev, exportCSV,
  normalizeHeader
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
    setTimeout(() => remove(id), 8000);
  };
  return { msgs, push, remove };
}

/* =========================
   Helpers
========================= */
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const toISODate = (ts?: string) => {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(+d)) return "";
  return d.toISOString().slice(0,10);
};
const sessionLabelOf = (s: Shot) => s.SessionId || toISODate(s.Timestamp) || "Unknown Session";

/* =====================================================
   UI: Simple pill for toast
===================================================== */
function ToastRow({ msg, onClose, theme: T }: { msg: Msg; onClose: () => void; theme: Theme }) {
  const border = T.border;
  const base = T.panel;
  const color = T.text;
  return (
    <div className="rounded px-3 py-2 text-sm shadow"
         style={{ background: base, color, border: `1px solid ${border}` }}>
      <div className="flex items-center gap-3">
        <div>{msg.text}</div>
        <button className="ml-auto underline" onClick={onClose} style={{ color }}>dismiss</button>
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
  const [selectedClubs, setSelectedClubs] = useState<string[]>([]);
  const [sessionFilter, setSessionFilter] = useState<string>("All Sessions");
  const [excludeOutliers, setExcludeOutliers] = useState<boolean>(false);
  const [dateFrom, setDateFrom] = useState<string>(""); // yyyy-mm-dd
  const [dateTo, setDateTo] = useState<string>("");     // yyyy-mm-dd
  const [carryMin, setCarryMin] = useState<string>("");
  const [carryMax, setCarryMax] = useState<string>("");

  // Journal content
  const [journalHTML, setJournalHTML] = useState<string>(() => {
    try { return localStorage.getItem("launch-tracker:journal") || ""; } catch { return ""; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:journal", journalHTML); } catch {} }, [journalHTML]);

  // Orders
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    try { const raw = localStorage.getItem("launch-tracker:card-order"); return raw ? JSON.parse(raw) : ["kpis","gapping","efficiency","shape","dispersion","table"]; } catch { return ["kpis","gapping","efficiency","shape","dispersion","table"]; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:card-order", JSON.stringify(cardOrder)); } catch {} }, [cardOrder]);

  const [insightsOrder, setInsightsOrder] = useState<string[]>(() => {
    try { const raw = localStorage.getItem("launch-tracker:insights-order"); return raw ? JSON.parse(raw) : ["distance","highlights","records","swing","progress","benchmarks"]; } catch { return ["distance","highlights","records","swing","progress","benchmarks"]; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:insights-order", JSON.stringify(insightsOrder)); } catch {} }, [insightsOrder]);

  // Refs
  const journalRef = useRef<HTMLDivElement>(null);

  const T = theme;

  /* ---------- Derived lists ---------- */
  const sessions = useMemo(() => {
    const set = new Set<string>();
    shots.forEach(s => set.add(sessionLabelOf(s)));
    return ["All Sessions", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [shots]);

  const clubs = useMemo(() => {
    const set = new Set<string>();
    shots.forEach(s => s.Club && set.add(s.Club));
    return Array.from(set).sort((a, b) => orderIndex(a) - orderIndex(b));
  }, [shots]);

  const allClubs = clubs;

  const carryBounds = useMemo(() => {
    const vals = shots.map(s => s.CarryDistance_yds).filter(isNum) as number[];
    const min = vals.length ? Math.floor(Math.min(...vals)) : 0;
    const max = vals.length ? Math.ceil(Math.max(...vals)) : 0;
    return { min, max };
  }, [shots]);

  /* ---------- Filtering ---------- */
  function inDateRange(s: Shot) {
    const day = toISODate(s.Timestamp);
    if (dateFrom && day && day < dateFrom) return false;
    if (dateTo && day && day > dateTo) return false;
    return true;
  }

  const filteredBase = useMemo(() => {
    let arr = shots.slice();
    if (sessionFilter !== "All Sessions") arr = arr.filter(s => sessionLabelOf(s) === sessionFilter);
    if (selectedClubs.length) arr = arr.filter(s => selectedClubs.includes(s.Club));
    arr = arr.filter(inDateRange);
    if (carryMin !== "") {
      const v = Number(carryMin);
      if (Number.isFinite(v)) arr = arr.filter(s => !isNum(s.CarryDistance_yds) || s.CarryDistance_yds! >= v);
    }
    if (carryMax !== "") {
      const v = Number(carryMax);
      if (Number.isFinite(v)) arr = arr.filter(s => !isNum(s.CarryDistance_yds) || s.CarryDistance_yds! <= v);
    }

    return arr;
  }, [shots, sessionFilter, selectedClubs, dateFrom, dateTo, carryMin, carryMax]);

  const filteredOutliers = useMemo(() => {
    if (!excludeOutliers) return filteredBase;
    const carries = filteredBase.map(s => s.CarryDistance_yds).filter(isNum) as number[];
    if (carries.length < 4) return filteredBase;
    const sorted = carries.slice().sort((a,b)=>a-b);
    const q1 = sorted[Math.floor(sorted.length*0.25)];
    const q3 = sorted[Math.floor(sorted.length*0.75)];
    const iqr = q3 - q1;
    const lo = q1 - 1.5*iqr, hi = q3 + 1.5*iqr;
    return filteredBase.filter(s => !isNum(s.CarryDistance_yds) || (s.CarryDistance_yds! >= lo && s.CarryDistance_yds! <= hi));
  }, [filteredBase, excludeOutliers]);

  const filtered = filteredBase;

  /* ---------- KPIs ---------- */
  const kpis = useMemo(() => {
    const carries = filteredOutliers.map(s => s.CarryDistance_yds).filter(isNum) as number[];
    const clubsSpd = filteredOutliers.map(s => s.ClubSpeed_mph).filter(isNum) as number[];
    const ballsSpd = filteredOutliers.map(s => s.BallSpeed_mph).filter(isNum) as number[];
    const smashes = filteredOutliers.map(s => isNum(s.SmashFactor) ? s.SmashFactor! : (isNum(s.BallSpeed_mph) && isNum(s.ClubSpeed_mph) && s.ClubSpeed_mph!>0 ? s.BallSpeed_mph!/s.ClubSpeed_mph! : undefined)).filter(isNum) as number[];

    const wrap = (arr: number[]) => ({ mean: mean(arr), n: arr.length, std: stddev(arr) });
    return { carry: wrap(carries), ball: wrap(ballsSpd), club: wrap(clubsSpd), smash: wrap(smashes) };
  }, [filteredOutliers]);

  /* ---------- Table rows ---------- */
  const tableRows = useMemo(() => {
    const byClub = new Map<string, Shot[]>();
    filteredOutliers.forEach(s => {
      if (!byClub.has(s.Club)) byClub.set(s.Club, []);
      byClub.get(s.Club)!.push(s);
    });
    const rows = Array.from(byClub.entries()).map(([club, arr]) => {
      const count = arr.length;
      const avgCarry = mean(arr.map(x => x.CarryDistance_yds!).filter(isNum as any));
      const avgTotal = mean(arr.map(x => x.TotalDistance_yds!).filter(isNum as any));
      const avgCS = mean(arr.map(x => x.ClubSpeed_mph!).filter(isNum as any));
      const avgBS = mean(arr.map(x => x.BallSpeed_mph!).filter(isNum as any));
      const avgLA = mean(arr.map(x => x.LaunchAngle_deg!).filter(isNum as any));
      const avgF2P = mean(arr.map(x => x.FaceToPath_deg!).filter(isNum as any));
      const avgSmash = mean(arr.map(x => {
        if (isNum(x.SmashFactor)) return x.SmashFactor!;
        if (isNum(x.BallSpeed_mph) && isNum(x.ClubSpeed_mph) && x.ClubSpeed_mph!>0) return x.BallSpeed_mph!/x.ClubSpeed_mph!;
        return NaN as any;
      }).filter(isNum as any));
      const avgSpin = mean(arr.map(x => x.SpinRate_rpm!).filter(isNum as any));
      return { club, count, avgCarry, avgTotal, avgSmash, avgSpin, avgCS, avgBS, avgLA, avgF2P } as any;
    }).sort((a,b)=>orderIndex(a.club)-orderIndex(b.club));
    return rows as any[];
  }, [filteredOutliers]);

  /* ---------- IO ---------- */
  async function onImportFile(file: File) {
    const text = await file.text();
    const rows = text.split(/\r?\n/).map(line => line.split(","));
    const header = rows[0]?.map(h => normalizeHeader(String(h))) ?? [];
    const idx = (name: string) => header.indexOf(name);
    const dataRows = rows.slice(1).filter(r => r.some(x => (x ?? "").trim() !== ""));

    const toNum = (v: any) => {
      if (v==null) return undefined;
      const n = Number(String(v).trim());
      return Number.isFinite(n) ? n : undefined;
    };

    const parsed: Shot[] = dataRows.map((r) => {
      const get = (nm: string) => {
        const i = idx(nm);
        return i>=0 ? r[i] : undefined;
      };
      const shot: Shot = {
        SessionId: String(get("session") ?? get("session id") ?? "") || undefined,
        Timestamp: String(get("timestamp") ?? get("date") ?? get("datetime") ?? "") || undefined,
        Club: String(get("club") ?? get("club name") ?? "").trim(),
        CarryDistance_yds: toNum(get("carry") ?? get("carry distance yds")),
        TotalDistance_yds: toNum(get("total") ?? get("total distance yds")),
        ClubSpeed_mph: toNum(get("club speed") ?? get("club speed mph")),
        BallSpeed_mph: toNum(get("ball speed") ?? get("ball speed mph")),
        LaunchAngle_deg: toNum(get("launch angle") ?? get("launch angle deg")),
        FaceToPath_deg: toNum(get("face to path") ?? get("face to path deg")),
        SmashFactor: toNum(get("smash") ?? get("smash factor")),
        SpinRate_rpm: toNum(get("spin") ?? get("spin rate rpm")),
      };
      return shot;
    });

    setShots(prev => [...prev, ...parsed]);
    toast({ type: "success", text: `Imported ${parsed.length} shots from ${file.name}` });
  }

  async function onLoadSample() {
    const url = new URL('sampledata.csv', document.baseURI).toString();
    const resp = await fetch(url);
    if (!resp.ok) { toast({ type: "error", text: "Failed to load sample data" }); return; }
    const blob = await resp.blob();
    await onImportFile(new File([blob], "sampledata.csv", { type: "text/csv" }));
  }

  function onExport() {
    const rows = filteredOutliers.map(s => ({
      SessionId: s.SessionId, Timestamp: s.Timestamp, Club: s.Club,
      CarryDistance_yds: s.CarryDistance_yds, TotalDistance_yds: s.TotalDistance_yds,
      ClubSpeed_mph: s.ClubSpeed_mph, BallSpeed_mph: s.BallSpeed_mph,
      LaunchAngle_deg: s.LaunchAngle_deg, FaceToPath_deg: s.FaceToPath_deg,
      SmashFactor: s.SmashFactor, SpinRate_rpm: s.SpinRate_rpm
    }));
    exportCSV(rows);
  }

  function onDeleteAll() {
    if (!confirm("Delete ALL shots? This cannot be undone.")) return;
    setShots([]);
  }
  function onDeleteSession() {
    if (sessionFilter==="All Sessions") return;
    if (!confirm(`Delete session "${sessionFilter}"?`)) return;
    setShots(prev => prev.filter(s => sessionLabelOf(s) !== sessionFilter));
  }

  function onPrintClubAverages() {
    const table = document.querySelector("table.min-w-full.text-sm");
    const t = document.getElementById("club-averages-table") || table;
    if (!t) return;
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
        <body>${(t as HTMLElement).outerHTML}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  }

  /* ---------- Drag helpers ---------- */
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

  const hasData = shots.length > 0;

  /* ---------- UI ---------- */
  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.text }}>
      {/* Top bar */}
      <header className="border-b" style={{ borderColor: T.border, background: T.panel, height: "150px" }}>
        <div className="max-w-6xl mx-auto px-4 h-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              className="md:hidden rounded-md px-2 py-1 border text-sm"
              style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
              title="Filters"
              onClick={() => {/* drawer handled within Filters on small screens if implemented */}}
            >Filters</button>
            <div
              className="text-lg font-semibold"
              style={{
                width: 300,
                height: 100,
                backgroundImage: `url(${new URL('logo_horiz_color_120w.png', document.baseURI).toString()})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: "contain",
                backgroundPosition: "left center",
                textIndent: "-9999px",
                overflow: "hidden",
                whiteSpace: "nowrap"
              }}
            >SwingTrackr</div>
          </div>
          <div
            className="flex items-center gap-2"
            style={{
              alignSelf: "flex-end",
              // Header is 150px tall, logo is 100px high and vertically centered,
              // so its bottom sits 25px above the header bottom.
              marginBottom: "25px"
            }}
          >
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

      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex gap-4">
          {/* Filters panel (left) */}
          <div className="w-72 shrink-0">
            <FiltersPanel
              theme={T}
              shots={shots}
              sessions={sessions}
              clubs={clubs}
              selectedClubs={selectedClubs}
              setSelectedClubs={(v) => setSelectedClubs(v)}
              sessionFilter={sessionFilter}
              setSessionFilter={(v) => setSessionFilter(v)}
              excludeOutliers={excludeOutliers}
              setExcludeOutliers={(v) => setExcludeOutliers(v)}
              dateFrom={dateFrom}
              setDateFrom={(v) => setDateFrom(v)}
              dateTo={dateTo}
              setDateTo={(v) => setDateTo(v)}
              carryMin={carryMin}
              setCarryMin={(v) => setCarryMin(v)}
              carryMax={carryMax}
              setCarryMax={(v) => setCarryMax(v)}
              carryBounds={carryBounds}
              onImportFile={onImportFile}
              onLoadSample={onLoadSample}
              onExportCSV={onExport}
              onPrintClubAverages={onPrintClubAverages}
              onDeleteSession={onDeleteSession}
              onDeleteAll={onDeleteAll}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {tab === "dashboard" && (
              <DashboardCards
                theme={T}
                cardOrder={cardOrder}
                setCardOrder={setCardOrder}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={(key) => onDrop(key, cardOrder, setCardOrder)}
                hasData={hasData}
                kpis={kpis}
                filteredOutliers={filteredOutliers}
                filtered={filtered}
                shots={shots}
                tableRows={tableRows as any}
                clubs={allClubs}
              />
            )}
            {tab === "insights" && (
              <InsightsView
                theme={T}
                tableRows={tableRows as any}
                filteredOutliers={filteredOutliers}
                filteredNoClubOutliers={filteredOutliers}
                filteredNoClubRaw={filtered}
                allClubs={allClubs}
                insightsOrder={insightsOrder}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={(key) => onDrop(key, insightsOrder, setInsightsOrder)}
                allShots={shots}
              />
            )}
            {tab === "journal" && (
              <JournalView
                theme={T}
                editorRef={journalRef}
                value={journalHTML}
                onInputHTML={setJournalHTML}
                sessionLabel={`Journal — ${sessionFilter}`}
                defaultHeightPx={260}
              />
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t mt-6" style={{ borderColor: T.border, background: T.panel }}>
        <div className="max-w-6xl mx-auto px-4 py-4 text-sm" style={{ color: T.text }}>
          <div>© {new Date().getFullYear()} SwingTrackr</div>
        </div>
      </footer>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2">
        {msgs.map(m => (
          <ToastRow key={m.id} msg={m} onClose={() => removeToast(m.id)} theme={T} />
        ))}
      </div>
    </div>
  );
}
