import React, { useState, useEffect, useMemo } from "react";
import { Theme } from "./theme";
import { Card, KPI, TopTab, Toast } from "./components/UI";
import Filters from "./Filters";
import Dashboard from "./Dashboard";
import Insights from "./Insights";
import Journal from "./Journal";
import {
  Shot,
  parseCSV,
  parseXLSX,
  headerMap,
  fpOf,
} from "./utils";

/* ================== LocalStorage helpers ================== */
function loadLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function saveLS<T>(key: string, val: T) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

/* ================== Outlier filtering ================== */
function iqrFence(vals: number[]) {
  if (vals.length < 5) return { lo: -Infinity, hi: Infinity };
  const a = vals.slice().sort((x, y) => x - y);
  const q = (p: number) => {
    const pos = (a.length - 1) * p;
    const b = Math.floor(pos);
    const r = pos - b;
    return a[b + 1] !== undefined ? a[b] + r * (a[b + 1] - a[b]) : a[b];
  };
  const q1 = q(0.25),
    q3 = q(0.75),
    iqr = q3 - q1;
  return { lo: q1 - 1.5 * iqr, hi: q3 + 1.5 * iqr };
}
function withOutliers(pool: Shot[], excludeOutliers: boolean) {
  if (!excludeOutliers) return pool;
  const byClub = new Map<string, Shot[]>();
  pool.forEach((s) => {
    if (!byClub.has(s.Club)) byClub.set(s.Club, []);
    byClub.get(s.Club)!.push(s);
  });
  const keep: Shot[] = [];
  byClub.forEach((arr) => {
    const carries = arr
      .map((s) => s.CarryDistance_yds)
      .filter((x): x is number => x != null);
    const smashes = arr
      .map(
        (s) =>
          s.SmashFactor ??
          (s.BallSpeed_mph && s.ClubSpeed_mph
            ? s.BallSpeed_mph / s.ClubSpeed_mph
            : undefined)
      )
      .filter((x): x is number => x != null);
    const cf = iqrFence(carries),
      sf = iqrFence(smashes);
    arr.forEach((s) => {
      const c = s.CarryDistance_yds,
        sm =
          s.SmashFactor ??
          (s.BallSpeed_mph && s.ClubSpeed_mph
            ? s.BallSpeed_mph / s.ClubSpeed_mph
            : undefined);
      const okC = c == null || (c >= cf.lo && c <= cf.hi);
      const okS = sm == null || (sm >= sf.lo && sm <= sf.hi);
      if (okC && okS) keep.push(s);
    });
  });
  return keep;
}

/* ================== App ================== */
export default function App() {
  const [shots, setShots] = useState<Shot[]>(
    loadLS<Shot[]>("shots", [])
  );
  const [excludeOutliers, setExcludeOutliers] = useState<boolean>(
    loadLS("excludeOutliers", true)
  );
  const [theme, setTheme] = useState<"light" | "dark">(
    loadLS("theme", "light")
  );
  const [view, setView] = useState<"dashboard" | "insights" | "journal">(
    loadLS("view", "dashboard")
  );
  const [order, setOrder] = useState<string[]>(
    loadLS("order", [])
  );
  const [toast, setToast] = useState<string | null>(null);

  /* Persist state */
  useEffect(() => saveLS("shots", shots), [shots]);
  useEffect(() => saveLS("excludeOutliers", excludeOutliers), [excludeOutliers]);
  useEffect(() => saveLS("theme", theme), [theme]);
  useEffect(() => saveLS("view", view), [view]);
  useEffect(() => saveLS("order", order), [order]);

  /* Filtered shots */
  const shotsFiltered = useMemo(
    () => withOutliers(shots, excludeOutliers),
    [shots, excludeOutliers]
  );

  /* Theme */
  const T = theme === "light" ? Theme.light : Theme.dark;
  useEffect(() => {
    document.body.style.background = T.panel;
    document.body.style.color = T.text;
  }, [T]);

  /* File Import */
  async function handleFile(file: File) {
    try {
      let newShots: Shot[] = [];
      if (file.name.endsWith(".csv")) {
        newShots = await parseCSV(file);
      } else if (file.name.endsWith(".xlsx")) {
        newShots = await parseXLSX(file);
      }
      if (newShots.length) {
        const combined = [...shots, ...newShots];
        const deduped = Array.from(new Map(combined.map((s) => [fpOf(s), s])).values());
        setShots(deduped);
        setToast(`Imported ${newShots.length} shots`);
      } else {
        setToast("No shots found in file");
      }
    } catch (err) {
      console.error(err);
      setToast("Error importing file");
    }
  }

  /* Load sample data */
  async function loadSample() {
    try {
      const resp = await fetch("./sampledata.csv");
      if (!resp.ok) throw new Error("Failed sample fetch");
      const text = await resp.text();
      const blob = new Blob([text], { type: "text/csv" });
      const file = new File([blob], "sample.csv", { type: "text/csv" });
      const data = await parseCSV(file);
      setShots(data);
      setToast("Sample data loaded");
    } catch {
      setToast("Error loading sample data");
    }
  }

  /* Export CSV */
  function exportCSV() {
    const headers = Object.keys(headerMap);
    const rows = shots.map((s) =>
      headers.map((h) => (s as any)[headerMap[h]] ?? "")
    );
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shots.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* Delete all */
  function deleteAll() {
    if (window.confirm("Delete all shots?")) {
      setShots([]);
      setToast("All shots deleted");
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-none border-b" style={{ borderColor: T.border }}>
        <div className="flex items-center px-4 h-12">
          <div className="font-bold text-lg flex-1">Launch Tracker</div>
          <TopTab
            label="Dashboard"
            active={view === "dashboard"}
            onClick={() => setView("dashboard")}
          />
          <TopTab
            label="Insights"
            active={view === "insights"}
            onClick={() => setView("insights")}
          />
          <TopTab
            label="Journal"
            active={view === "journal"}
            onClick={() => setView("journal")}
          />
          <button
            className="ml-4"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <Filters
          shots={shots}
          setShots={setShots}
          handleFile={handleFile}
          loadSample={loadSample}
          exportCSV={exportCSV}
          deleteAll={deleteAll}
          excludeOutliers={excludeOutliers}
          setExcludeOutliers={setExcludeOutliers}
        />

        <div className="flex-1 overflow-auto p-4 bg-white dark:bg-gray-900">
          {view === "dashboard" && (
            <Dashboard
              shots={shotsFiltered}
              order={order}
              setOrder={setOrder}
              theme={T}
            />
          )}
          {view === "insights" && (
            <Insights shots={shotsFiltered} theme={T} />
          )}
          {view === "journal" && <Journal shots={shotsFiltered} theme={T} />}
        </div>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
