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
export default function App() {
  // Theme
  const [dark, setDark] = useState<boolean>(() => { try { return localStorage.getItem("launch-tracker:theme") === "dark"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("launch-tracker:theme", dark ? "dark" : "light"); } catch {} }, [dark]);
  const T: Theme = dark ? DARK : LIGHT;

  // View
  const [view, setView] = useState<ViewKey>(() => { try { return (localStorage.getItem("launch-tracker:view") as ViewKey) || "dashboard"; } catch { return "dashboard"; } });
  useEffect(() => { try { localStorage.setItem("launch-tracker:view", view); } catch {} }, [view]);

  // Data & UI state
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedClubs, setSelectedClubs] = useState<string[]>([]);
  const [excludeOutliers, setExcludeOutliers] = useState<boolean>(true);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [sessionFilter, setSessionFilter] = useState<string>("ALL");
  const [carryMin, setCarryMin] = useState<string>("");
  const [carryMax, setCarryMax] = useState<string>("");

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("launch-tracker:card-order") || "[]"); } catch { return []; }
  });
  useEffect(() => { if(!cardOrder.length){ setCardOrder(["kpis","shape","dispersion","gap","eff","launchspin","table"]); } }, []);
  useEffect(() => { try { localStorage.setItem("launch-tracker:card-order", JSON.stringify(cardOrder)); } catch {} }, [cardOrder]);

  // Insights order (merge-safe)
  const INSIGHTS_DEFAULT = ["distanceBox", "highlights", "warnings", "personalRecords", "progress", "weaknesses"];
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
  const journalKey = sessionFilter === "ALL" ? "GLOBAL" : (sessionFilter || "Unknown Session");
  const [journalHTML, setJournalHTML] = useState<string>(() => { try { return localStorage.getItem(`launch-tracker:journal:${journalKey}`) || ""; } catch { return ""; } });
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { try { setJournalHTML(localStorage.getItem(`launch-tracker:journal:${journalKey}`) || ""); } catch {} }, [journalKey]);
  useEffect(() => { try { localStorage.setItem(`launch-tracker:journal:${journalKey}`, journalHTML); } catch {} }, [journalKey, journalHTML]);

  // Measure Filters height for journal
  const filtersRef = useRef<HTMLDivElement>(null);
  const [filtersHeight, setFiltersHeight] = useState<number>(420);
  useEffect(() => {
    const el = filtersRef.current; if (!el) return; const update = () => setFiltersHeight(el.getBoundingClientRect().height || 420);
    const ro = new ResizeObserver(update); ro.observe(el); window.addEventListener("resize", update); update();
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  // Load/persist
  useEffect(() => { try { const raw = localStorage.getItem("launch-tracker:shots"); if (raw) setShots(JSON.parse(raw)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("launch-tracker:shots", JSON.stringify(shots)); } catch {} }, [shots]);

  // Messages with auto-dismiss
  const pushMsg = (text: string, type: Msg["type"] = "info") => {
    const id = Date.now() + Math.random(); setMsgs((prev) => [...prev, { id, text, type }]);
    window.setTimeout(() => setMsgs((prev) => prev.filter(m => m.id !== id)), 15000);
  };
  const closeMsg = (id: number) => setMsgs((prev) => prev.filter(m => m.id !== id));

  // Clubs & sessions
  const clubs = useMemo(() => Array.from(new Set(shots.map(s => s.Club))).sort((a,b)=>orderIndex(a)-orderIndex(b)), [shots]);
  const sessions = useMemo(() => ["ALL", ...Array.from(new Set(shots.map(s => s.SessionId ?? "Unknown Session"))).sort()], [shots]);

  const carryBounds = useMemo(() => {
    const vals = shots.map(s => s.CarryDistance_yds).filter((v): v is number => v !== undefined);
    if (!vals.length) return { min: 0, max: 0 };
    return { min: Math.floor(Math.min(...vals)), max: Math.ceil(Math.max(...vals)) };
  }, [shots]);

  /* ===== Import processing (XLSX/CSV + dedupe) ===== */
  function applyDerived(s: Shot): Shot {
    const s2 = { ...s };
    const Sm = coalesceSmash(s2); const F2P = coalesceFaceToPath(s2);
    if (Sm !== undefined) s2.SmashFactor = clamp(Sm, 0.5, 1.95);
    if (F2P !== undefined) s2.FaceToPath_deg = F2P;
    return s2;
  }
  function processWorkbook(wb: XLSX.WorkBook, textFromCSV: string | null, filename: string) {
    const firstSheet = wb.SheetNames.find(n => {
      const ws = wb.Sheets[n]; const rr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
      return rr && rr.flat().some(v => v !== null && v !== "");
    }) || wb.SheetNames[0];
    const ws = wb.Sheets[firstSheet];
    const rowsRaw: any[][] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true, header: 1 }) as any[][];
    if (!rowsRaw.length) { pushMsg("The sheet seems empty.", "warn"); return; }

    const best = findBestHeader(rowsRaw);
    const headerRow = rowsRaw[best.idx] || [];
    const nextRow   = rowsRaw[best.idx + 1] || [];
    const effectiveHeader = best.usedTwoRows ? headerRow.map((v, i) => [v, nextRow[i]].filter(Boolean).join(" ")) : headerRow;

    const hdrNorms = effectiveHeader.map((h) => normalizeHeader(String(h ?? "")));
    const normIndex: (keyof Shot | undefined)[] = hdrNorms.map((key) => headerMap[key]);
    let clubIdx = normIndex.findIndex((k) => k === "Club");
    if (clubIdx === -1) {
      const clubHeaderSyns = ["club", "club name", "club type", "club model", "club used", "club #", "club id"];
      clubIdx = hdrNorms.findIndex((h) => clubHeaderSyns.includes(h));
      if (clubIdx !== -1) normIndex[clubIdx] = "Club";
    }

    const startRow = best.idx + (best.usedTwoRows ? 2 : 1);
    const dataRows = rowsRaw.slice(startRow);
    const fallbackId = `${filename.replace(/\.[^.]+$/, "")} • ${new Date().toLocaleString()}`;

    const mapped: Shot[] = [];
    if (clubIdx !== -1) {
      for (const rowArr of dataRows) {
        if (!rowArr || rowArr.every((v: any) => v === null || String(v).trim() === "")) continue;
        const obj: any = {};
        rowArr.forEach((cell: any, i: number) => { const mk = normIndex[i]; if (mk) obj[mk] = cell; });
        if (!obj.Club) continue;

        const shot: any = {};
        Object.keys(obj).forEach((k) => {
          const mk = k as keyof Shot; const v = obj[mk];
          if (mk === "Timestamp") shot[mk] = isoDate(v);
          else if (mk === "SpinRateType" || mk === "Club" || mk === "SessionId") { const val = String(v ?? "").trim(); if (val) shot[mk] = val; }
          else if (mk === "Swings") { const val = n(v); if (val !== undefined) shot[mk] = Math.round(val); }
          else { const val = n(v); if (val !== undefined) shot[mk] = val; }
        });
        if (!shot.SessionId) shot.SessionId = fallbackId;
        mapped.push(applyDerived(shot as Shot));
      }
    }

    let finalShots: Shot[] = mapped; let usedFallback = false;
    if (textFromCSV && mapped.length === 0) {
      const weird = parseWeirdLaunchCSV(textFromCSV);
      if (weird) {
        const ws2 = weirdRowsToShots(weird.header, weird.dataRows as any, fallbackId).map(applyDerived);
        if (ws2.length) { finalShots = ws2; usedFallback = true; }
      }
    }

    const existing = new Set(shots.map(fpOf));
    const seen = new Set<string>(); const deduped: Shot[] = []; let dupCount = 0;
    for (const s of finalShots) { const key = fpOf(s); if (existing.has(key) || seen.has(key)) { dupCount++; continue; } seen.add(key); deduped.push(s); }
    if (deduped.length) setShots(prev => [...prev, ...deduped]);

    pushMsg(`${usedFallback ? "Imported via fallback" : "Imported"} ${deduped.length}/${finalShots.length} rows from "${filename}". ${dupCount} duplicates skipped.`, deduped.length ? "success" : "warn");
  }
  const onFile = async (file: File) => {
    try {
      const isCSV = /\.csv$/i.test(file.name) || file.type === "text/csv" || file.type === "application/vnd.ms-excel";
      if (isCSV) {
        const text = await file.text();
        const first = (text.split(/\r?\n/)[0] || "");
        const count = (ch: string) => (first.match(new RegExp(ch, "g")) || []).length;
        const FS = count("\t") >= count(";") && count("\t") >= count(",") ? "\t" : (count(";") > count(",") ? ";" : ",");
        const wb = XLSX.read(text, { type: "string", FS });
        processWorkbook(wb, text, file.name);
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        processWorkbook(wb, null, file.name);
      }
    } catch { pushMsg("Sorry, I couldn't read that file. Is it CSV/XLSX?", "error"); }
  };

  const loadSample = async () => {
    try {
      const resp = await fetch("./sampledata.csv", { cache: "no-store" });
      if (!resp.ok) throw new Error();
      const text = await resp.text();
      const wb = XLSX.read(text, { type: "string" });
      processWorkbook(wb, text, "sampledata.csv");
    } catch {
      const id = `Sample ${new Date().toLocaleString()}`;
      const sample: Shot[] = [
        { SessionId: id, Club: "Driver", ClubSpeed_mph: 85.1, BallSpeed_mph: 119.8, SmashFactor: 1.41, LaunchAngle_deg: 12.9, CarryDistance_yds: 176, TotalDistance_yds: 193, SpinAxis_deg: -1.7, Timestamp: "2025-08-08T12:00:00Z" },
        { SessionId: id, Club: "6 Iron", ClubSpeed_mph: 74.3, BallSpeed_mph: 94.8, SmashFactor: 1.27, LaunchAngle_deg: 14.6, CarryDistance_yds: 115, TotalDistance_yds: 133, SpinAxis_deg: -0.2, Timestamp: "2025-08-08T12:11:00Z" },
      ];
      const existing = new Set(shots.map(fpOf));
      const add = sample.map(applyDerived).filter(s => !existing.has(fpOf(s)));
      setShots(prev => [...prev, ...add]);
      pushMsg(`Loaded built-in sample (${add.length}/${sample.length} new).`, "success");
    }
  };

  /* Filters + withOutliers */
  const baseFilter = (source: Shot[], skipClub = false) => {
    let pool = source;
    if (sessionFilter !== "ALL") pool = pool.filter(s => (s.SessionId ?? "Unknown Session") === sessionFilter);
    if (!skipClub) pool = selectedClubs.length ? pool.filter(s => selectedClubs.includes(s.Club)) : pool;
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : null; const to = dateTo ? new Date(dateTo) : null; if (to) to.setDate(to.getDate() + 1);
      pool = pool.filter(s => {
        if (!s.Timestamp) return true; const d = new Date(s.Timestamp); if (isNaN(d.getTime())) return true;
        if (from && d < from) return false; if (to && d >= to) return false; return true;
      });
    }
    const minC = carryMin ? Number(carryMin) : undefined;
    const maxC = carryMax ? Number(carryMax) : undefined;
    if (minC !== undefined || maxC !== undefined) {
      pool = pool.filter(s => {
        const c = s.CarryDistance_yds ?? -Infinity;
        if (minC !== undefined && c < minC) return false;
        if (maxC !== undefined && c > maxC) return false;
        return true;
      });
    }
    return pool;
  };
  const filtered = useMemo(() => baseFilter(shots, false), [shots, sessionFilter, selectedClubs, dateFrom, dateTo, carryMin, carryMax]);
  const filteredNoClub = useMemo(() => baseFilter(shots, true), [shots, sessionFilter, dateFrom, dateTo, carryMin, carryMax]);

  const withOutliers = (pool: Shot[]) => {
    if (!excludeOutliers) return pool;
    const carryVals = pool.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
    const smashVals = pool.map(s => (s.SmashFactor ?? (s.BallSpeed_mph && s.ClubSpeed_mph ? s.BallSpeed_mph / s.ClubSpeed_mph : undefined))).filter((x): x is number => x != null);
    const haveC = carryVals.length >= 5, haveS = smashVals.length >= 5;
    const cm = haveC ? mean(carryVals) : 0, cs = haveC ? stddev(carryVals) : 0;
    const sm = haveS ? mean(smashVals) : 0, ss = haveS ? stddev(smashVals) : 0;
    return pool.filter(s => {
      let ok = true;
      if (haveC && s.CarryDistance_yds != null) ok = ok && s.CarryDistance_yds >= cm - 2.5 * cs && s.CarryDistance_yds <= cm + 2.5 * cs;
      if (haveS) { const sv = s.SmashFactor ?? (s.BallSpeed_mph && s.ClubSpeed_mph ? s.BallSpeed_mph / s.ClubSpeed_mph : undefined); if (sv != null) ok = ok && sv >= sm - 2.5 * ss && sv <= sm + 2.5 * ss; }
      return ok;
    });
  };
  const filteredOutliers = useMemo(() => withOutliers(filtered), [filtered, excludeOutliers]);
  const filteredNoClubOutliers = useMemo(() => withOutliers(filteredNoClub), [filteredNoClub, excludeOutliers]);
  const hasData = filteredOutliers.length > 0;

  /* Club Averages table rows (for Dashboard) */
  const tableRowsDash: ClubRow[] = useMemo(() => {
    const byClub = new Map<string, Shot[]>();
    filteredOutliers.forEach(s => {
      if (!byClub.has(s.Club)) byClub.set(s.Club, []);
      byClub.get(s.Club)!.push(s);
    });

    const rows: ClubRow[] = [];
    for (const [club, arr] of byClub.entries()) {
      const grab = (sel: (s: Shot) => number | undefined) =>
        arr.map(sel).filter((x): x is number => x !== undefined);

      const avg = (vals: number[]) => (vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0);
      const f2pSel = (s: Shot) => (s.ClubFace_deg != null && s.ClubPath_deg != null) ? (s.ClubFace_deg - s.ClubPath_deg) : undefined;

      rows.push({
        club,
        count: arr.length,
        avgCarry:  avg(grab(s => s.CarryDistance_yds)),
        avgTotal:  avg(grab(s => s.TotalDistance_yds)),
        avgSmash:  avg(grab(s => s.SmashFactor)),
        avgSpin:   avg(grab(s => s.SpinRate_rpm)),
        avgCS:     avg(grab(s => s.ClubSpeed_mph)),
        avgBS:     avg(grab(s => s.BallSpeed_mph)),
        avgLA:     avg(grab(s => s.LaunchAngle_deg)),
        avgF2P:    avg(grab(f2pSel)),
      });
    }
    return rows.sort((a,b)=>orderIndex(a.club)-orderIndex(b.club));
  }, [filteredOutliers]);

  /* Delete actions */
  const deleteSession = () => {
    if (sessionFilter === "ALL") return;
    const count = shots.filter(s => (s.SessionId ?? "Unknown Session") === sessionFilter).length;
    if (!count) { pushMsg(`No shots for session "${sessionFilter}".`, "warn"); return; }
    if (!window.confirm(`Delete session "${sessionFilter}" (${count} shots)?`)) return;
    setShots(prev => prev.filter(s => (s.SessionId ?? "Unknown Session") !== sessionFilter));
    setSelectedClubs([]); setSessionFilter("ALL");
    pushMsg(`Deleted session "${sessionFilter}".`, "success");
  };
  const deleteAll = () => {
    if (!window.confirm("Delete ALL imported data?")) return;
    setShots([]); setSelectedClubs([]); setSessionFilter("ALL");
    try { localStorage.removeItem("launch-tracker:shots"); } catch {}
    pushMsg("All data deleted.", "success");
  };

  // DnD handlers (dashboard)
  const dragKeyRef = useRef<string | null>(null);
  const onDragStart = (k: string) => (e: React.DragEvent) => { dragKeyRef.current = k; e.dataTransfer.effectAllowed = "move"; };
  const onDragOver  = (k: string) => (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop      = (k: string) => (e: React.DragEvent) => { e.preventDefault(); const from = dragKeyRef.current; dragKeyRef.current = null; if (!from || from === k) return;
    setCardOrder((prev) => { const arr = prev.slice(); const i = arr.indexOf(from), j = arr.indexOf(k); if (i === -1 || j === -1) return prev; arr.splice(j, 0, ...arr.splice(i, 1)); return arr; }); };

  // DnD (insights) – separate drop handler to reorder insightsOrder
  const onDropInsight = (k: string) => (e: React.DragEvent) => { e.preventDefault(); const from = dragKeyRef.current; dragKeyRef.current = null; if (!from || from === k) return;
    setInsightsOrder((prev) => { const arr = prev.slice(); const i = arr.indexOf(from), j = arr.indexOf(k); if (i === -1 || j === -1) return prev; arr.splice(j, 0, ...arr.splice(i, 1)); return arr; }); };

  // Print Club Averages (unchanged)
  const printClubAverages = () => {
    const win = window.open("", "_blank", "width=900,height=700"); if (!win) return;
    win.document.write(`<html><head><title>Club Averages</title><style>
      body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;}
      h1{margin:0 0 12px;color:${T.brand}} table{border-collapse:collapse;width:100%;font-size:13px}
      th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background:#f8fafc}
    </style></head><body><h1>Launch Tracker — Club Averages</h1><table>
      <tr><th>Club</th><th>Shots</th><th>Avg Carry</th><th>Avg Total</th><th>Avg Smash</th><th>Avg Spin</th><th>Avg Club Spd</th><th>Avg Ball Spd</th><th>Avg Launch</th><th>Face-to-Path</th></tr>
      ${tableRowsDash.map(r=>`<tr><td>${r.club}</td><td>${r.count}</td><td>${r.avgCarry.toFixed(1)}</td><td>${r.avgTotal.toFixed(1)}</td><td>${r.avgSmash.toFixed(3)}</td><td>${Math.round(r.avgSpin)}</td><td>${r.avgCS.toFixed(1)}</td><td>${r.avgBS.toFixed(1)}</td><td>${r.avgLA.toFixed(1)}</td><td>${r.avgF2P.toFixed(2)}°</td></tr>`).join("")}
    </table><script>window.onload=()=>window.print()</script></body></html>`); win.document.close();
  };

  return (
    <div style={{ minHeight: "100vh", background: T.white }}>
      {/* Header */}
      <header className="px-6 py-4" style={{ background: T.brand, color: "#fff" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-wide">Launch Tracker</h1>
          <div className="flex items-center gap-2">
            <TopTab theme={T} label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} />
            <TopTab theme={T} label="Insights"  active={view === "insights"}  onClick={() => setView("insights")} />
            <TopTab theme={T} label="Journal"   active={view === "journal"}   onClick={() => setView("journal")} />
            <button onClick={() => setDark(!dark)} className="ml-3 p-2 rounded-lg border" style={{ background: "#ffffff10", borderColor: "#ffffff55" }} title={dark ? "Switch to light mode" : "Switch to dark mode"}>
              {dark ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      {msgs.length > 0 && (
        <div className="px-6 mt-4">
          <div className="max-w-7xl mx-auto flex flex-col gap-2">
            {msgs.map(m => (
              <div key={m.id} className="rounded-lg px-4 py-3 text-sm flex items-start justify-between"
                   style={{ background: m.type === "error" ? "#FDECEC" : m.type === "success" ? "#EDFDF3" : m.type === "warn" ? "#FFF6EC" : "#EEF5FF", color: "#111827", border: `1px solid #E5E7EB` }}>
                <div style={{ whiteSpace: "pre-line" }}>{m.text}</div>
                <button onClick={() => closeMsg(m.id)} className="ml-4 px-2 py-1 text-xs rounded border" style={{ borderColor: "#E5E7EB", color: "#475569" }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-12 gap-8">
        {/* LEFT */}
        <aside className="col-span-12 lg:col-span-3 space-y-8">
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
              dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
              carryMin={carryMin} carryMax={carryMax} setCarryMin={setCarryMin} setCarryMax={setCarryMax}
              carryBounds={carryBounds}
              onImportFile={onFile}
              onLoadSample={loadSample}
              onExportCSV={()=>exportCSV(filteredOutliers as any)}
              onPrintClubAverages={printClubAverages}
              onDeleteSession={deleteSession}
              onDeleteAll={deleteAll}
            />
          </div>
        </aside>

        {/* RIGHT */}
        <section className="col-span-12 lg:col-span-9">
          {view === "dashboard" && (
            <DashboardCards
              theme={T}
              cardOrder={cardOrder}
              setCardOrder={setCardOrder}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              hasData={filteredOutliers.length>0}
              kpis={{
                avgCarry: filteredOutliers.map(s=>s.CarryDistance_yds).filter((x):x is number=>x!=null).reduce((a,b,i,arr)=>a+b/(arr.length||1),0) || undefined,
                avgTotal: filteredOutliers.map(s=>s.TotalDistance_yds).filter((x):x is number=>x!=null).reduce((a,b,i,arr)=>a+b/(arr.length||1),0) || undefined,
                avgSmash: filteredOutliers.map(s=>s.SmashFactor).filter((x):x is number=>x!=null).reduce((a,b,i,arr)=>a+b/(arr.length||1),0) || undefined,
                avgSpin: filteredOutliers.map(s=>s.SpinRate_rpm).filter((x):x is number=>x!=null).reduce((a,b,i,arr)=>a+b/(arr.length||1),0) || undefined,
                avgCS: filteredOutliers.map(s=>s.ClubSpeed_mph).filter((x):x is number=>x!=null).reduce((a,b,i,arr)=>a+b/(arr.length||1),0) || undefined,
                avgBS: filteredOutliers.map(s=>s.BallSpeed_mph).filter((x):x is number=>x!=null).reduce((a,b,i,arr)=>a+b/(arr.length||1),0) || undefined,
                shape: {
                  draw: { n: filteredOutliers.filter(s => (s.SpinAxis_deg ?? 0) < -2).length, pct: filteredOutliers.length ? (filteredOutliers.filter(s => (s.SpinAxis_deg ?? 0) < -2).length / filteredOutliers.length) * 100 : 0 },
                  fade: { n: filteredOutliers.filter(s => (s.SpinAxis_deg ?? 0) > 2).length, pct: filteredOutliers.length ? (filteredOutliers.filter(s => (s.SpinAxis_deg ?? 0) > 2).length / filteredOutliers.length) * 100 : 0 },
                  straight: { n: Math.max(0, filteredOutliers.length - filteredOutliers.filter(s => (s.SpinAxis_deg ?? 0) < -2).length - filteredOutliers.filter(s => (s.SpinAxis_deg ?? 0) > 2).length),
                              pct: filteredOutliers.length ? (Math.max(0, filteredOutliers.length - filteredOutliers.filter(s => (s.SpinAxis_deg ?? 0) < -2).length - filteredOutliers.filter(s => (s.SpinAxis_deg ?? 0) > 2).length) / filteredOutliers.length) * 100 : 0 },
                }
              }}
              filteredOutliers={filteredOutliers}
              filtered={filtered}
              shots={shots}
              tableRows={tableRowsDash}
              clubs={clubs}
            />
          )}

          {view === "insights" && (
            <InsightsView
              theme={T}
              tableRows={tableRowsDash}
              filteredNoClubOutliers={filteredNoClubOutliers}
              allClubs={clubs}
              selectedClubs={selectedClubs}
              insightsOrder={insightsOrder}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDropInsight}
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
        </section>
      </main>

      <footer className="px-6 py-8 text-xs text-center" style={{ color: "#475569" }}>
        Gap chart: Carry = blue, Total = green. Shot shape: Draw &lt; -2°, Straight ±2°, Fade &gt; 2°. Data is saved locally.
      </footer>
    </div>
  );
}
