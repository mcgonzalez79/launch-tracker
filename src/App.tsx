import React, { useEffect, useMemo, useRef, useState } from "react";
import { LIGHT, DARK, Theme } from "./theme";
import FiltersPanel from "./Filters";
import DashboardCards from "./Dashboard";
import InsightsView from "./Insights";
import JournalView from "./Journal";
import { TopTab, IconSun, IconMoon } from "./components/UI";
import {
  Shot, Msg, ViewKey, mean, stddev, isoDate,
  XLSX, orderIndex, ClubRow,
  normalizeHeader, parseWeirdLaunchCSV, weirdRowsToShots, exportCSV,
} from "./utils";

/* =========================
   Toasts
========================= */
function useToasts() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const push = (text: string) =>
    setMsgs((m) => [...m, { id: Date.now(), text } as Msg]);
  const remove = (id: number) =>
    setMsgs((m) => m.filter((x) => x.id !== id));
  return { msgs, push, remove };
}

/* =========================
   Helpers
========================= */
const isNum = (x: any): x is number => typeof x === "number" && Number.isFinite(x);
const clampNumber = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function applyDerived(s: Shot): Shot {
  const out = { ...s };

  // Smash factor if missing and both speeds present
  if (!isNum(out.SmashFactor) && isNum(out.BallSpeed_mph) && isNum(out.ClubSpeed_mph) && out.ClubSpeed_mph > 0) {
    out.SmashFactor = clampNumber(out.BallSpeed_mph / out.ClubSpeed_mph, 0.5, 1.95);
  }

  // Face-to-Path if missing and both angles present
  if (!isNum(out.FaceToPath_deg) && isNum(out.ClubFace_deg) && isNum(out.ClubPath_deg)) {
    out.FaceToPath_deg = out.ClubFace_deg - out.ClubPath_deg;
  }

  return out;
}

/* =========================
   App
========================= */
export default function App() {
  // Theme
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("launch-tracker:theme") || "dark") === "light" ? LIGHT : DARK;
    } catch {
      return DARK;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("launch-tracker:theme", theme === LIGHT ? "light" : "dark");
    } catch {}
    document.documentElement.style.setProperty("color-scheme", theme === LIGHT ? "light" : "dark");
  }, [theme]);

  // View
  const [tab, setTab] = useState<ViewKey>(() => {
    try {
      return (localStorage.getItem("launch-tracker:tab") as ViewKey) || "dashboard";
    } catch {
      return "dashboard";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("launch-tracker:tab", tab);
    } catch {}
  }, [tab]);

  // Toasts
  const { msgs, push: toast, remove: removeToast } = useToasts();

  // Data
  const [shots, setShots] = useState<Shot[]>(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:shots");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("launch-tracker:shots", JSON.stringify(shots));
    } catch {}
  }, [shots]);

  // Sessions
  const sessions = useMemo(
    () => Array.from(new Set(shots.map((s) => s.SessionId ?? "Unknown Session")).values()).sort(),
    [shots]
  );

  // Clubs & bounds
  const clubs = useMemo(
    () => Array.from(new Set(shots.map((s) => s.Club))).sort((a, b) => orderIndex(a) - orderIndex(b)),
    [shots]
  );
  const carryBounds = useMemo(() => {
    const xs = shots.map((s) => s.CarryDistance_yds).filter(isNum);
    return xs.length
      ? { min: Math.floor(Math.min(...xs)), max: Math.ceil(Math.max(...xs)) }
      : { min: 0, max: 0 };
  }, [shots]);

  /* =========================
     Import / Export
  ========================= */
  function mergeImportedShots(newShots: Shot[], filename: string) {
    const keyOf = (s: Shot) =>
      [s.Timestamp ?? "", s.Club, s.CarryDistance_yds ?? 0, s.BallSpeed_mph ?? 0, s.ClubSpeed_mph ?? 0].join("|");
    const existing = new Map(shots.map((s) => [keyOf(s), s]));
    const merged: Shot[] = [];
    for (const s of newShots) {
      const key = keyOf(s);
      if (!existing.has(key)) merged.push(applyDerived(s));
    }
    if (!merged.length) {
      toast(`No new shots found in ${filename}.`);
      return;
    }
    setShots([...shots, ...merged]);
    toast(`Imported ${merged.length} new shots from ${filename}.`);
  }

  async function onImportFile(file: File) {
    const ext = file.name.toLowerCase().split(".").pop();
    try {
      if (ext === "csv") {
        const text = await file.text();
        const parsed = parseWeirdLaunchCSV(text);
        if (!parsed) {
          toast("CSV format not recognized (no club column?)");
          return;
        }
        const imported = weirdRowsToShots(parsed.header, parsed.dataRows, "Imported").map(applyDerived);
        mergeImportedShots(imported, file.name);
        return;
      }
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      processWorkbook(wb, file.name);
    } catch (e) {
      console.error(e);
      toast(`Failed to import ${file.name}`);
    }
  }

  function processWorkbook(wb: XLSX.WorkBook, filename: string) {
    const valid = wb.SheetNames.find((name) => {
      const ws = wb.Sheets[name];
      if (!ws) return false; // guard: sheet might not exist
      const rr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
      return rr && rr.length > 0 && rr[0] && rr[0].length > 3;
    });
    if (!valid) {
      toast(`No data in ${filename}`);
      return;
    }
    const ws = wb.Sheets[valid];
    if (!ws) {
      toast(`Unable to read sheet in ${filename}`);
      return;
    }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
    const header = (rows[0] || []).map((x) => String(x ?? ""));
    const idx = (key: string) => header.findIndex((h) => normalizeHeader(h) === key);
    const data = rows.slice(1);

    const numOrUndef = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    const shots2: Shot[] = data.map((row) => {
      const s: Shot = {
        SessionId: (row[idx("session")] ?? undefined) as any,
        Timestamp: (() => {
          const v = row[idx("timestamp")];
          if (v instanceof Date) return v.toISOString();
          try {
            const d = new Date(v);
            return isNaN(d as any) ? undefined : d.toISOString();
          } catch {
            return undefined;
          }
        })(),
        Club: (row[idx("club")] ?? undefined) as any,
        ClubSpeed_mph: numOrUndef(row[idx("club speed")]),
        AttackAngle_deg: numOrUndef(row[idx("attack angle")]),
        ClubPath_deg: numOrUndef(row[idx("club path")]),
        ClubFace_deg: numOrUndef(row[idx("club face")]),
        FaceToPath_deg: numOrUndef(row[idx("face to path")]),
        BallSpeed_mph: numOrUndef(row[idx("ball speed")]),
        SmashFactor: numOrUndef(row[idx("smash factor")]),
        LaunchAngle_deg: numOrUndef(row[idx("launch angle")]),
        LaunchDirection_deg: numOrUndef(row[idx("launch direction")]),
        ApexHeight_yds: numOrUndef(row[idx("apex height")]),
        CarryDistance_yds: numOrUndef(row[idx("carry distance")]),
        CarryDeviationDistance_yds: numOrUndef(row[idx("carry deviation distance")]),
        TotalDeviationDistance_yds: numOrUndef(row[idx("total deviation distance")]),
        TotalDistance_yds: numOrUndef(row[idx("total distance")]),
        Backspin_rpm: numOrUndef(row[idx("backspin")]),
        Sidespin_rpm: numOrUndef(row[idx("sidespin")]),
        SpinRate_rpm: numOrUndef(row[idx("spin rate")]),
        SpinRateType: (() => {
          const i = idx("spin rate type");
          const v = i >= 0 ? row[i] : undefined;
          return v == null ? undefined : String(v);
        })(),
        SpinAxis_deg: numOrUndef(row[idx("spin axis")]),
      };

      return applyDerived(s);
    });

    mergeImportedShots(shots2, filename);
  }

  function onLoadSample() {
    // minimal sample generator for demo
    const now = Date.now();
    const clubsDemo = ["Driver", "5W", "4i", "7i", "PW"];
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const shots2: Shot[] = Array.from({ length: 80 }, (_, i) => {
      const c = clubsDemo[i % clubsDemo.length];
      const t = new Date(now - i * 3600 * 1000 * 6).toISOString();
      const cs = rand(70, 115);
      const bs = cs * rand(1.35, 1.52);
      const ca = cs * rand(2.1, 2.6);
      const td = ca * rand(1.0, 1.15);
      return applyDerived({
        SessionId: isoDate(t).slice(0, 10),
        Timestamp: t,
        Club: c,
        ClubSpeed_mph: cs,
        BallSpeed_mph: bs,
        SmashFactor: bs / Math.max(cs, 1),
        CarryDistance_yds: ca,
        TotalDistance_yds: td,
        AttackAngle_deg: rand(-6, 6),
        ClubPath_deg: rand(-5, 5),
        ClubFace_deg: rand(-4, 4),
        FaceToPath_deg: rand(-3, 3),
        LaunchAngle_deg: rand(8, 22),
        SpinRate_rpm: rand(1800, 6800),
        CarryDeviationDistance_yds: rand(-25, 25),
      } as Shot);
    });
    setShots([...shots, ...shots2]);
  }

  function exportShotsCSV() {
    const rows: any[] = shots.map((s) => ({
      session: s.SessionId,
      timestamp: s.Timestamp,
      club: s.Club,
      carry: s.CarryDistance_yds,
      total: s.TotalDistance_yds,
      ball: s.BallSpeed_mph,
      clubSpeed: s.ClubSpeed_mph,
      smash: s.SmashFactor,
    }));
    exportCSV(rows); // utils.exportCSV expects one arg
  }

  // Mobile drawer state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement | null>(null);

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
  function onPrintClubAverages() {
    try {
      const rows = tableRows as any[];
      if (!rows || rows.length === 0) {
        alert("No club averages to print.");
        return;
      }
      // Discover columns present on first row
      const first = rows[0] || {};
      const colDefs: { key: string; label: string; align?: "left" | "right" }[] = (
        [
          { key: "club", label: "Club", align: "left" as const },
          { key: "count", label: "Shots" },
          { key: "avgCarry", label: "Avg Carry (yds)" },
          { key: "avgTotal", label: "Avg Total (yds)" },
          { key: "avgBall", label: "Avg Ball (mph)" },
          { key: "avgClub", label: "Avg Club (mph)" },
          { key: "avgSmash", label: "Smash" },
          { key: "avgLaunch", label: "Launch (°)" },
          { key: "avgF2P", label: "Face-to-Path (°)" },
        ] as const
      ).filter((c) => c.key in first) as { key: string; label: string; align?: "left" | "right" }[];

      const fmt = (k: string, v: any) => {
        if (v == null || v === "") return "";
        if (k === "club") return String(v);
        if (k === "count") return String(v);
        if (/Smash/i.test(k)) return Number(v).toFixed(2);
        if (/Launch|F2P/i.test(k)) return Number(v).toFixed(2);
        if (/Carry|Total|Ball|Club/i.test(k)) return Number(v).toFixed(1);
        return String(v);
      };

      const tableHead = colDefs
        .map((c) => `<th style="text-align:${c.align === "left" ? "left" : "right"}">${c.label}</th>`)
        .join("");

      const rowsHtml = rows
        .map((r) => {
          const cells = colDefs
            .map((c) => {
              const raw = (r as any)[c.key];
              return `<td style="text-align:${c.align === "left" ? "left" : "right"}">${fmt(c.key, raw)}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");

      const now = new Date().toLocaleString();
      const html = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>Club Averages</title>
<style>
  :root{ --text:#111; --muted:#555; --grid:#ddd; }
  body{ font-family: system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial; margin:0; padding:24px; color:var(--text); }
  h1{ margin:0 0 8px; font-size:20px; }
  .meta{ color:var(--muted); margin-bottom:16px; font-size:12px; }
  table{ width:100%; border-collapse:collapse; }
  th,td{ border:1px solid var(--grid); padding:8px 10px; font-size:12px; }
  thead th{ background:#f7f7f7; text-align:right; }
  thead th:first-child, tbody td:first-child{ text-align:left; }
  @media print{ @page { size: landscape; margin: 10mm; } body{ padding:0; } }
</style>
</head><body>
  <h1>Club Averages</h1>
  <div class="meta">Printed ${now}</div>
  <table>
    <thead><tr>${tableHead}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <script>window.onload=()=>{ window.print(); setTimeout(()=>window.close(), 300); }</script>
</body></html>`;

      const w = window.open("", "_blank", "noopener,noreferrer");
      if (!w) {
        alert("Pop-up blocked. Please allow pop-ups to print.");
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      console.error(e);
      alert("Unable to generate printable averages.");
    }
  }
  function onDeleteSession() {
    if (!shots.length || sessionFilter === "ALL") return;
    if (!window.confirm(`Delete all shots in session "${sessionFilter}"? This cannot be undone.`)) return;
    const keep = shots.filter((s) => (s.SessionId ?? "Unknown Session") !== sessionFilter);
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

    return shots.filter((s) => {
      if (!inClubs(s) || !inSession(s)) return false;
      if (from) {
        try {
          if (new Date(s.Timestamp || "") < from) return false;
        } catch {}
      }
      if (to) {
        try {
          if (new Date(s.Timestamp || "") > to) return false;
        } catch {}
      }
      if (isNum(s.CarryDistance_yds)) {
        if (min != null && (s.CarryDistance_yds ?? 0) < min) return false;
        if (max != null && (s.CarryDistance_yds ?? 0) > max) return false;
      }
      return true;
    });
  }, [shots, sessionFilter, selectedClubs, dateFrom, dateTo, carryMin, carryMax]);

  const filteredOutliers = useMemo(() => {
    if (!excludeOutliers) return filteredBase;
    // todo: per-club IQR trim etc.
    return filteredBase;
  }, [filteredBase, excludeOutliers]);

  /* =========================
     Derived for child views
  ========================= */
  const hasData = filteredBase.length > 0;
  const kpis = useMemo(() => {
    const vCarry = filteredOutliers.map((s) => s.CarryDistance_yds).filter(isNum);
    const vBall = filteredOutliers.map((s) => s.BallSpeed_mph).filter(isNum);
    const vClub = filteredOutliers.map((s) => s.ClubSpeed_mph).filter(isNum);
    const vSmash = filteredOutliers.map((s) => s.SmashFactor).filter(isNum);
    return {
      carry: { mean: mean(vCarry), n: vCarry.length, std: stddev(vCarry) },
      ball: { mean: mean(vBall), n: vBall.length, std: stddev(vBall) },
      club: { mean: mean(vClub), n: vClub.length, std: stddev(vClub) },
      smash: { mean: mean(vSmash), n: vSmash.length, std: stddev(vSmash) },
    } as any;
  }, [filteredOutliers]);

  const tableRows: ClubRow[] = useMemo(() => {
    const byClub = new Map<string, Shot[]>();
    for (const s of filteredOutliers) {
      const k = s.Club || "Unknown";
      if (!byClub.has(k)) byClub.set(k, []);
      byClub.get(k)!.push(s);
    }
    const rows: ClubRow[] = [];
    Array.from(byClub.keys())
      .sort((a, b) => orderIndex(a) - orderIndex(b))
      .forEach((club) => {
        const arr = byClub.get(club)!;
        const avg = (key: keyof Shot) => {
          const xs = arr.map((r) => r[key]).filter(isNum) as number[];
          return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
        };
        rows.push({
          club,
          count: arr.length,
          avgCarry: avg("CarryDistance_yds"),
          avgTotal: avg("TotalDistance_yds"),
          avgBall: avg("BallSpeed_mph"),
          avgClub: avg("ClubSpeed_mph"),
          avgSmash: avg("SmashFactor"),
          avgLaunch: avg("LaunchAngle_deg"),
          avgF2P: avg("FaceToPath_deg"),
        } as any);
      });
    return rows;
  }, [filteredOutliers]);

  // Card ordering
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    const DEFAULT = ["kpis", "shape", "dispersion", "gap", "eff", "table"];
    try {
      const raw = localStorage.getItem("launch-tracker:card-order");
      const saved = raw ? JSON.parse(raw) : null;
      if (Array.isArray(saved) && saved.length)
        return Array.from(new Set([...saved, ...DEFAULT])).filter((k) => DEFAULT.includes(k));
      return DEFAULT;
    } catch {
      return DEFAULT;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("launch-tracker:card-order", JSON.stringify(cardOrder));
    } catch {}
  }, [cardOrder]);

  // Insights ordering
  const INSIGHTS_DEFAULT = ["dist", "high", "records", "gaps", "progress"];
  const [insightsOrder, setInsightsOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:insights-order");
      const saved = raw ? JSON.parse(raw) : null;
      if (Array.isArray(saved) && saved.length) return saved;
      return INSIGHTS_DEFAULT;
    } catch {
      return INSIGHTS_DEFAULT;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("launch-tracker:insights-order", JSON.stringify(insightsOrder));
    } catch {}
  }, [insightsOrder]);

  // Journal height measurement (match filters)
  const [filtersHeight, setFiltersHeight] = useState<number>(340);
  useEffect(() => {
    const node = filtersRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    // seed once
    const seed = node.getBoundingClientRect?.().height;
    if (typeof seed === "number" && Number.isFinite(seed)) setFiltersHeight(seed);

    const ro = new ResizeObserver((entries) => {
      const h = entries?.[0]?.contentRect?.height;
      if (typeof h === "number" && Number.isFinite(h)) setFiltersHeight(h);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const year = new Date().getFullYear();

  return (
    <div style={{ background: theme.bg, color: theme.text, minHeight: "100dvh" }}>
      {/* Header */}
      <header className="border-b" style={{ borderColor: theme.border, background: theme.panel }}>
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded-md border text-xs md:hidden"
              style={{ background: theme.panelAlt, borderColor: theme.border, color: theme.text }}
              onClick={() => setFiltersOpen(true)}
              title="Filters"
            >
              Filters
            </button>
            <div className="text-lg font-semibold">Launch Tracker</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <TopTab label="Dashboard" active={tab === "dashboard"} onClick={() => setTab("dashboard")} theme={theme} />
              <TopTab label="Insights" active={tab === "insights"} onClick={() => setTab("insights")} theme={theme} />
              <TopTab label="Journal" active={tab === "journal"} onClick={() => setTab("journal")} theme={theme} />
            </div>
            <button
              className="px-2 py-1 rounded-md border text-xs"
              style={{ background: theme.panelAlt, borderColor: theme.border, color: theme.text }}
              onClick={() => setTheme(theme === LIGHT ? DARK : LIGHT)}
              title="Toggle theme"
            >
              {theme === LIGHT ? <IconMoon /> : <IconSun />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile tabs row */}
      <div className="md:hidden border-b" style={{ borderColor: theme.border, background: theme.panel }}>
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2">
          <TopTab label="Dashboard" active={tab === "dashboard"} onClick={() => setTab("dashboard")} theme={theme} />
          <TopTab label="Insights" active={tab === "insights"} onClick={() => setTab("insights")} theme={theme} />
          <TopTab label="Journal" active={tab === "journal"} onClick={() => setTab("journal")} theme={theme} />
        </div>
      </div>

      {/* Mobile filters drawer */}
      {filtersOpen ? (
        <div
          className="md:hidden fixed inset-0 z-50"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setFiltersOpen(false)}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-[85%] max-w-sm"
            style={{ background: theme.panel, color: theme.text }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2 flex items-center justify-between border-b" style={{ borderColor: theme.border }}>
              <div className="text-sm">Filters</div>
              <button
                className="text-xs underline"
                style={{ color: theme.brand }}
                onClick={() => setFiltersOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="p-3">
              <FiltersPanel
                theme={theme}
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
      ) : null}

      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-4">
          {/* Left rail (desktop) */}
          <div ref={filtersRef} className="hidden md:block filters-panel">
            <FiltersPanel
              theme={theme}
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
                theme={theme}
                cardOrder={cardOrder}
                setCardOrder={(arr: string[]) => setCardOrder(arr)}
                onDragStart={(key) => (e) => e.dataTransfer.setData("text/plain", key)}
                onDragOver={(_key) => (e) => e.preventDefault()}
                onDrop={(targetKey) => (e) => {
                  e.preventDefault();
                  const sourceKey = e.dataTransfer.getData("text/plain");
                  if (!sourceKey || sourceKey === targetKey) return;
                  setCardOrder((prev) => {
                    const cur = [...prev];
                    const si = cur.indexOf(sourceKey);
                    const ti = cur.indexOf(targetKey);
                    if (si < 0 || ti < 0) return cur;
                    cur.splice(si, 1);
                    cur.splice(ti, 0, sourceKey);
                    return cur;
                  });
                }}
                hasData={hasData}
                kpis={kpis}
                filteredOutliers={filteredOutliers}
                filtered={filteredBase}
                shots={shots}
                tableRows={tableRows as any}
                clubs={clubs}
              />
            )}
            {tab === "insights" && (
              <InsightsView
                theme={theme}
                tableRows={tableRows as any}
                filteredOutliers={filteredOutliers}
                filteredNoClubOutliers={filteredOutliers /* replace with no-club if you add it */}
                filteredNoClubRaw={filteredBase /* raw-ish base; respects current filters */}
                allClubs={clubs}
                insightsOrder={["distanceBox", "highlights", "swingMetrics", "personalRecords", "progress", "weaknesses"]}
                onDragStart={(key) => (e) => e.dataTransfer.setData("text/plain", key)}
                onDragOver={(_key) => (e) => e.preventDefault()}
                onDrop={(targetKey) => (e) => {
                  e.preventDefault();
                  const sourceKey = e.dataTransfer.getData("text/plain");
                  if (!sourceKey || sourceKey === targetKey) return;
                  // persist order if desired
                }}
              />
            )}
            {tab === "journal" && (
              <JournalView
                theme={theme}
                editorRef={useRef(null)}
                value={(() => {
                  try {
                    return localStorage.getItem("launch-tracker:journal") || "";
                  } catch {
                    return "";
                  }
                })()}
                onInputHTML={(html) => {
                  try {
                    localStorage.setItem("launch-tracker:journal", html);
                  } catch {}
                }}
                sessionLabel={`Journal — ${sessionFilter === "ALL" ? "All Sessions" : sessionFilter}`}
                defaultHeightPx={filtersHeight}
              />
            )}
          </div>
        </div>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-3 right-3 flex flex-col gap-2">
        {msgs.map((m) => (
          <div
            key={m.id}
            className="rounded-md border px-3 py-2 text-sm shadow-sm"
            style={{ background: theme.panel, color: theme.text, borderColor: theme.border }}
          >
            <div className="flex items-center gap-2">
              <div>{m.text}</div>
              <button
                className="text-xs underline"
                onClick={() => removeToast(m.id)}
                style={{ color: theme.textDim }}
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-6 border-t" style={{ borderColor: theme.border, background: theme.bg }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-2">
          <div className="text-xs" style={{ color: theme.textDim }}>
            © {year} Launch Tracker
          </div>
          <nav className="flex items-center gap-3 text-xs" style={{ color: theme.textDim }}>
            <a
              href="https://github.com/mcgonzalez79/launch-tracker"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Repo
            </a>
            <span>·</span>
            <span>v1.0.0+</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
