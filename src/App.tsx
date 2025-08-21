import React, { useEffect, useMemo, useRef, useState } from "react";
import { LIGHT, DARK, Theme } from "./theme";
import FiltersPanel from "./Filters";
import DashboardCards from "./Dashboard";
import InsightsView from "./Insights";
import JournalView from "./Journal";
import { TopTab, IconSun, IconMoon } from "./components/UI";
import {
  Shot, Msg, ViewKey, mean, stddev, isoDate, clamp,
  coalesceSmash, coalesceFaceToPath, XLSX, orderIndex,
  normalizeHeader, parseWeirdLaunchCSV, weirdRowsToShots, exportCSV, n, ClubRow
} from "./utils";

/* =========================
   Toasts
========================= */
function useToasts() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const remove = (id: number) => setMsgs(prev => prev.filter(x => x.id !== id));
  const push = (m: Omit<Msg, "id"> & Partial<Pick<Msg, "id">>) => {
    const id = m.id ?? Math.floor(Date.now() + Math.random() * 1000);
    setMsgs(prev => [...prev, { id, text: m.text, type: m.type }]);
    setTimeout(() => remove(id), 10000);
  };
  return { msgs, push, remove };
}

/* =========================
   Helpers
========================= */
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/* derive Smash/Face-to-Path when partially present */
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

  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("launch-tracker:cardOrder") || `["kpis","shape","dispersion","gap","eff","table"]`); } catch { return ["kpis","shape","dispersion","gap","eff","table"]; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:cardOrder", JSON.stringify(cardOrder)); } catch {} }, [cardOrder]);

  const [insightsOrder, setInsightsOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("launch-tracker:insightsOrder") || `[]`); } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:insightsOrder", JSON.stringify(insightsOrder)); } catch {} }, [insightsOrder]);

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
      if (!existing.has(k)) { existing.set(k, applyDerived(s)); added++; }
    }
    const merged = Array.from(existing.values());
    setShots(merged);
    setSessionFilter("ALL");
    toast({ type: added > 0 ? "success" : "info", text: added > 0 ? `Imported ${added} new shots from ${filename}` : `No new shots found in ${filename}` });
  }

  function rowsToShots(headerRow: any[], dataRows: any[][], filename: string): Shot[] {
    const header = headerRow.map(h => String(h ?? ""));
    const hNorm = header.map(h => normalizeHeader(h));
    const idx = (name: string) => hNorm.findIndex(h => h === name);

    return dataRows.map((row) => {
      const dateRaw = String(row[idx("date")] ?? row[idx("timestamp")] ?? row[idx("datetime")] ?? "").trim();
      const sessionByDay = (dateRaw.split(" ")[0] || "Unknown Session");
      const clubIdx = (() => { for (const c of ["club name", "club", "club type"]) { const i = idx(c); if (i >= 0) return i; } return -1; })();
      const clubVal = clubIdx >= 0 ? String(row[clubIdx] ?? "").trim() : "Unknown Club";

      const s: Shot = {
        SessionId: sessionByDay,
        Club: clubVal,
        Timestamp: isoDate(dateRaw),

        ClubSpeed_mph:      n(row[idx("club speed")]),
        AttackAngle_deg:    n(row[idx("attack angle")]),
        ClubPath_deg:       n(row[idx("club path")]),
        ClubFace_deg:       n(row[idx("club face")]),
        FaceToPath_deg:     n(row[idx("face to path")]),
        BallSpeed_mph:      n(row[idx("ball speed")]),
        SmashFactor:        n(row[idx("smash factor")]),
        LaunchAngle_deg:    n(row[idx("launch angle")]),
        LaunchDirection_deg:n(row[idx("launch direction")]),
        ApexHeight_yds:     n(row[idx("apex height")]),
        CarryDistance_yds:  n(row[idx("carry distance")]),
        CarryDeviationDistance_yds: n(row[idx("carry deviation distance")]),
        TotalDeviationDistance_yds: n(row[idx("total deviation distance")]),
        TotalDistance_yds:  n(row[idx("total distance")]),
        Backspin_rpm:       n(row[idx("backspin")]),
        Sidespin_rpm:       n(row[idx("sidespin")]),
        SpinRate_rpm:       n(row[idx("spin rate")]),
        SpinRateType:       (() => { const i = idx("spin rate type"); const v = i >= 0 ? row[i] : undefined; return v == null ? undefined : String(v); })(),
        SpinAxis_deg:       n(row[idx("spin axis")]),
      };

      return applyDerived(s);
    });
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
    const sample: Shot[] = [
      { SessionId: "2025-08-10", Timestamp: "2025-08-10T14:05:00Z", Club: "Driver",
        ClubSpeed_mph: 102, BallSpeed_mph: 150, LaunchAngle_deg: 13, Backspin_rpm: 2500,
        CarryDistance_yds: 245, SmashFactor: 1.470 },
      { SessionId: "2025-08-10", Timestamp: "2025-08-10T14:06:00Z", Club: "7 Iron",
        ClubSpeed_mph: 83, BallSpeed_mph: 115, LaunchAngle_deg: 17, Backspin_rpm: 6200,
        CarryDistance_yds: 152, SmashFactor: 1.386 },
    ];
    mergeImportedShots(sample, "Sample");
  }

  function exportShotsCSV() {
    // preserve util contract: exportCSV(rows)
    exportCSV(shots as unknown as Record<string, any>[]);
  }

  /* =========================
     Print — Club Averages only
  ========================= */
  function onPrintClubAverages() {
    try {
      const headers = Array.from(document.querySelectorAll("section > header"));
      const header = headers.find(h => (h.textContent || "").trim() === "Club Averages");
      const cardSection = header ? (header.parentElement as HTMLElement | null) : null;
      const table = cardSection ? (cardSection.querySelector("table") as HTMLTableElement | null) : null;

      if (!table) {
        window.print();
        return;
      }

      const w = window.open("", "_blank", "noopener,noreferrer");
      if (!w) { window.print(); return; }

      const css = `
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        html, body { height: 100%; }
        body { margin: 16px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'; color: #000; background: #fff; }
        h1 { font-size: 16px; margin: 0 0 8px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 6px 8px; font-size: 12px; text-align: right; }
        th:first-child, td:first-child { text-align: left; }
        thead th { font-weight: 600; }
        @page { margin: 12mm; }
      `;

      const tableHTML = table.outerHTML;

      w.document.open();
      w.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>Club Averages</title>
    <style>${css}</style>
  </head>
  <body>
    <h1>Club Averages</h1>
    ${tableHTML}
    <script>
      window.addEventListener('load', function () {
        window.focus();
        window.print();
        setTimeout(function(){ window.close(); }, 50);
      });
    <\/script>
  </body>
</html>`);
      w.document.close();
    } catch {
      window.print();
    }
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
     Filtering
  ========================= */
  const filtered = useMemo(() => {
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
    if (!excludeOutliers) return filtered;
    // Keep existing behavior (no-op) for now; we can add per-club IQR trimming later without API changes.
    return filtered;
  }, [filtered, excludeOutliers]);

  const hasData = filtered.length > 0;

  /* =========================
     Derived for children
  ========================= */
  const clubs = useMemo(
    () => Array.from(new Set(filteredOutliers.map(s => s.Club))).sort((a, b) => orderIndex(a) - orderIndex(b)),
    [filteredOutliers]
  );

  const tableRows: ClubRow[] = useMemo(() => {
    const byClub = new Map<string, Shot[]>();
    for (const s of filteredOutliers) {
      const arr = byClub.get(s.Club) || [];
      arr.push(s);
      byClub.set(s.Club, arr);
    }
    const rows: ClubRow[] = Array.from(byClub.entries()).map(([club, arr]) => {
      const g = <T extends (keyof Shot)>(k: T) => arr.map(a => a[k]).filter(isNum) as number[];
      const avg = (xs: number[]) => xs.length ? mean(xs) : 0;
      const carry = avg(g("CarryDistance_yds"));
      const total = avg(g("TotalDistance_yds"));
      const cs = avg(g("ClubSpeed_mph"));
      const bs = avg(g("BallSpeed_mph"));
      const la = avg(g("LaunchAngle_deg"));
      const f2p = avg(g("FaceToPath_deg"));
      return {
        club,
        count: arr.length,
        avgCarry: carry,
        avgTotal: total || carry,
        avgCS: cs,
        avgBS: bs,
        avgLA: la,
        avgF2P: f2p,
      } as ClubRow;
    });
    rows.sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
    return rows;
  }, [filteredOutliers]);

  // KPIs for dashboard header tiles
  const kpis = useMemo(() => {
    const xs = (arr: number[]) => arr.filter(isNum) as number[];
    const carry = xs(filteredOutliers.map(s => s.CarryDistance_yds as number));
    const ball = xs(filteredOutliers.map(s => s.BallSpeed_mph as number));
    const club = xs(filteredOutliers.map(s => s.ClubSpeed_mph as number));
    const smash = xs(filteredOutliers.map(s => s.SmashFactor as number));
    return {
      carry: { mean: mean(carry), n: carry.length, std: stddev(carry) },
      ball:  { mean: mean(ball),  n: ball.length,  std: stddev(ball)  },
      club:  { mean: mean(club),  n: club.length,  std: stddev(club)  },
      smash: { mean: mean(smash), n: smash.length, std: stddev(smash) },
    };
  }, [filteredOutliers]);

  const T = theme;

  /* =========================
     Journal
  ========================= */
  const journalRef = useRef<HTMLDivElement>(null);
  const [journalHTML, setJournalHTML] = useState<string>(() => {
    try { return localStorage.getItem("launch-tracker:journal") || ""; } catch { return ""; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:journal", journalHTML); } catch {} }, [journalHTML]);
  const sessionLabel = `Journal — ${sessionFilter === "ALL" ? "All Sessions" : sessionFilter}`;

  /* =========================
     Layout / Filters drawer
  ========================= */
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const [filtersHeight, setFiltersHeight] = useState<number>(340);
  useEffect(() => {
    const el = filtersRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setFiltersHeight(el.getBoundingClientRect().height); });
    ro.observe(el);
    setFiltersHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [filtersRef.current, shots, selectedClubs, sessionFilter, excludeOutliers, carryMin, carryMax, dateFrom, dateTo]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const year = new Date().getFullYear();

  return (
    <div className="min-h-full" style={{ background: T.bg, color: T.text }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ background: T.bg, borderColor: T.border }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="font-semibold">Launch Tracker</span>
            <nav className="hidden md:flex items-center gap-1">
              <TopTab label="Dashboard" active={tab === "dashboard"} theme={T} onClick={() => setTab("dashboard")} />
              <TopTab label="Insights"   active={tab === "insights"}  theme={T} onClick={() => setTab("insights")} />
              <TopTab label="Journal"    active={tab === "journal"}   theme={T} onClick={() => setTab("journal")} />
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md px-2 py-1 border text-xs"
              style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
              onClick={() => setTheme(theme === LIGHT ? DARK : LIGHT)}
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {theme === LIGHT ? <IconMoon /> : <IconSun />}
            </button>
            <button
              className="md:hidden rounded-md px-2 py-1 border text-xs"
              style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
              onClick={() => setFiltersOpen(v => !v)}
              aria-label="Filters"
              title="Filters"
            >
              Filters
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 py-4 grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-4">
        {/* Left sidebar (filters) */}
        <div ref={filtersRef} className="filters-panel">
          <FiltersPanel
            theme={T}
            shots={shots}
            sessions={Array.from(new Set(shots.map(s => s.SessionId ?? "Unknown Session")))}
            clubs={Array.from(new Set(shots.map(s => s.Club))).sort((a, b) => orderIndex(a) - orderIndex(b))}
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
            carryBounds={{ min: 0, max: 500 }}
            onImportFile={onImportFile}
            onLoadSample={onLoadSample}
            onExportCSV={exportShotsCSV}
            onPrintClubAverages={onPrintClubAverages}
            onDeleteSession={() => {
              if (!shots.length || sessionFilter === "ALL") return;
              if (!window.confirm(`Delete all shots in session "${sessionFilter}"? This cannot be undone.`)) return;
              const keep = shots.filter(s => (s.SessionId ?? "Unknown Session") !== sessionFilter);
              setShots(keep);
            }}
            onDeleteAll={() => {
              if (!shots.length) return;
              if (!window.confirm("Delete ALL shots? This cannot be undone.")) return;
              setShots([]);
            }}
          />
        </div>

        {/* Right content */}
        <div>
          {tab === "dashboard" && (
            <DashboardCards
              theme={T}
              cardOrder={cardOrder}
              setCardOrder={setCardOrder}
              onDragStart={(key: string) => (e: React.DragEvent) => {
                e.dataTransfer.setData("text/plain", key);
              }}
              onDragOver={(key: string) => (e: React.DragEvent) => {
                e.preventDefault();
                const cur = [...cardOrder];
                const fromKey = e.dataTransfer.getData("text/plain");
                if (!fromKey || fromKey === key) return;
                if (!cur.includes(fromKey)) return;
                const from = cur.indexOf(fromKey);
                const to = cur.indexOf(key);
                cur.splice(from, 1);
                cur.splice(to, 0, fromKey);
                setCardOrder(cur);
              }}
              onDrop={(_key: string) => (e: React.DragEvent) => {
                e.preventDefault();
              }}
              hasData={hasData}
              kpis={kpis}
              filteredOutliers={filteredOutliers}
              filtered={filtered}
              shots={shots}
              tableRows={tableRows}
              clubs={clubs}
            />
          )}

          {tab === "insights" && (
            <InsightsView
              theme={T}
              tableRows={tableRows}
              filteredOutliers={filteredOutliers}
              filteredNoClubOutliers={filteredOutliers}
              filteredNoClubRaw={filtered}
              allClubs={clubs}
              insightsOrder={insightsOrder}
              onDragStart={(key: string) => (e: React.DragEvent) => {
                e.dataTransfer.setData("text/plain", key);
              }}
              onDragOver={(key: string) => (e: React.DragEvent) => {
                e.preventDefault();
                const cur = [...insightsOrder];
                const fromKey = e.dataTransfer.getData("text/plain");
                if (!fromKey || fromKey === key) return;
                if (!cur.includes(fromKey)) return;
                const from = cur.indexOf(fromKey);
                const to = cur.indexOf(key);
                cur.splice(from, 1);
                cur.splice(to, 0, fromKey);
                setInsightsOrder(cur);
              }}
              onDrop={(_key: string) => (_e: React.DragEvent) => {}}
              allShots={shots}
            />
          )}

          {tab === "journal" && (
            <JournalView
              theme={T}
              editorRef={journalRef}
              value={journalHTML}
              onInputHTML={setJournalHTML}
              sessionLabel={sessionLabel}
              defaultHeightPx={Math.max(200, Math.floor(filtersHeight))}
            />
          )}
        </div>
      </main>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {msgs.map((m) => (
          <button
            key={m.id}
            className="px-3 py-2 rounded-md border text-sm shadow-sm text-left"
            style={{ background: T.panel, borderColor: T.border, color: T.text }}
            onClick={() => removeToast(m.id)}
          >
            {m.text}
          </button>
        ))}
      </div>

      {/* Footer */}
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
    </div>
  );
}
