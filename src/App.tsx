import React, { useEffect, useMemo, useRef, useState } from "react";
import { LIGHT, DARK, Theme } from "./theme";
import FiltersPanel from "./Filters";
import DashboardCards from "./Dashboard";
import InsightsView from "./Insights";
import JournalView from "./Journal";
import ScorecardView from "./Scorecard";
import GoalsView from "./Goals";
import { TopTab, IconSun, IconMoon, IconInstagram, IconMenu, AchievementNotificationModal, IconAdjustments } from "./components/UI";
import { ALL_ACHIEVEMENTS, checkAchievements, Achievement } from "./achievements";
import {
  Shot, Msg, ViewKey, mean, stddev, isoDate, clamp,
  coalesceSmash, coalesceFaceToPath, fpOf, XLSX, orderIndex, ClubRow,
  normalizeHeader, parseWeirdLaunchCSV, weirdRowsToShots, exportCSV,
  quantile, ScorecardData, isNum, Goal
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
    setTimeout(() => remove(id), 10000); // auto-clear after 10s
  };
  return { msgs, push, remove };
}

/* =========================
   Helpers
========================= */
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

const EMPTY_SCORECARD: ScorecardData = { header: {}, holes: {}, summary: {}, notes: "" };

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

  const [goals, setGoals] = useState<Goal[]>(() => {
    try { const raw = localStorage.getItem("swingledger:goals"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("swingledger:goals", JSON.stringify(goals)); } catch {} }, [goals]);
  
  // Achievements & Scorecards
  const [unlockedAchievements, setUnlockedAchievements] = useState<Set<string>>(() => {
    try { const saved = localStorage.getItem("swingledger:achievements"); return saved ? new Set(JSON.parse(saved)) : new Set(); } catch { return new Set(); }
  });
  useEffect(() => {
    try { localStorage.setItem("swingledger:achievements", JSON.stringify(Array.from(unlockedAchievements))); } catch {}
  }, [unlockedAchievements]);

  const [savedScorecards, setSavedScorecards] = useState<Record<string, ScorecardData>>(() => {
    try { return JSON.parse(localStorage.getItem("launch-tracker:saved-scorecards") || "{}"); } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:saved-scorecards", JSON.stringify(savedScorecards)); } catch {} }, [savedScorecards]);

  const newShotsRef = useRef<Shot[]>([]);
  const [lastCheckedCount, setLastCheckedCount] = useState(() => shots.length);
  const [newlyUnlockedBatch, setNewlyUnlockedBatch] = useState<Achievement[]>([]);
  
  const [activeScorecard, setActiveScorecard] = useState<ScorecardData>(EMPTY_SCORECARD);
  const [activeScorecardName, setActiveScorecardName] = useState<string | null>(null);

  // Journal State
  const journalRef = useRef<HTMLDivElement>(null);
  const [journals, setJournals] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("launch-tracker:journals") || "{}"); } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:journals", JSON.stringify(journals)); } catch {} }, [journals]);

  const runAchievementChecks = (newestShots: Shot[], allScorecards: Record<string, ScorecardData>) => {
    const { newlyUnlocked } = checkAchievements({
      allShots: shots,
      newShots: newestShots,
      savedScorecards: allScorecards,
      unlockedAchievements,
    });
    
    if (newlyUnlocked.length > 0) {
      setNewlyUnlockedBatch(newlyUnlocked);
      
      setUnlockedAchievements(prev => {
        const next = new Set(prev);
        newlyUnlocked.forEach(ach => next.add(ach.id));
        return next;
      });
    }
  };
  
  useEffect(() => {
    if (shots.length > lastCheckedCount && newShotsRef.current.length > 0) {
      runAchievementChecks(newShotsRef.current, savedScorecards);
      newShotsRef.current = [];
      setLastCheckedCount(shots.length);
    }
  }, [shots, lastCheckedCount, unlockedAchievements, savedScorecards]);

  // Sessions & clubs (always derived from current shots)
  const sessions = useMemo(
    () => ["ALL", ...Array.from(new Set(shots.map(s => s.SessionId ?? "Unknown Session"))).sort()],
    [shots]
  );
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
    newShotsRef.current = newShots;
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

        ClubSpeed_mph:      numOrUndef(row[idx("club speed")]),
        AttackAngle_deg:    numOrUndef(row[idx("attack angle")]),
        ClubPath_deg:       numOrUndef(row[idx("club path")]),
        ClubFace_deg:       numOrUndef(row[idx("club face")]),
        FaceToPath_deg:     numOrUndef(row[idx("face to path")]),
        BallSpeed_mph:      numOrUndef(row[idx("ball speed")]),
        SmashFactor:        numOrUndef(row[idx("smash factor")]),
        LaunchAngle_deg:    numOrUndef(row[idx("launch angle")]),
        LaunchDirection_deg:numOrUndef(row[idx("launch direction")]),
        ApexHeight_yds:     numOrUndef(row[idx("apex height")]),
        CarryDistance_yds:  numOrUndef(row[idx("carry distance")]),
        CarryDeviationDistance_yds: numOrUndef(row[idx("carry deviation distance")]),
        TotalDeviationDistance_yds: numOrUndef(row[idx("total deviation distance")]),
        TotalDistance_yds:  numOrUndef(row[idx("total distance")]),
        Backspin_rpm:       numOrUndef(row[idx("backspin")]),
        Sidespin_rpm:       numOrUndef(row[idx("sidespin")]),
        SpinRate_rpm:       numOrUndef(row[idx("spin rate")]),
        SpinRateType:       (() => { const i = idx("spin rate type"); const v = i >= 0 ? row[i] : undefined; return v == null ? undefined : String(v); })(),
        SpinAxis_deg:       numOrUndef(row[idx("spin axis")]),
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

  function exportShotsCSV() { exportCSV(shots); }

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
    if (tableRows.length) window.print();
    else toast({ type: "info", text: "No club data to print." });
  }
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
    
    const byClub = new Map<string, Shot[]>();
    for (const s of filteredBase) {
      const k = s.Club || "Unknown";
      if (!byClub.has(k)) byClub.set(k, []);
      byClub.get(k)!.push(s);
    }
    
    const result: Shot[] = [];
    for (const shotsOfClub of byClub.values()) {
      const carries = shotsOfClub.map(s => s.CarryDistance_yds).filter(isNum) as number[];
      if (carries.length < 5) {
        result.push(...shotsOfClub);
        continue;
      }
      const q1 = quantile(carries, 0.25);
      const q3 = quantile(carries, 0.75);
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;

      const kept = shotsOfClub.filter(s => {
        if (!isNum(s.CarryDistance_yds)) return true; // keep shots without carry data
        return s.CarryDistance_yds >= lowerBound && s.CarryDistance_yds <= upperBound;
      });
      result.push(...kept);
    }
    return result;

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
      const k = s.Club || "Unknown";
      if (!byClub.has(k)) byClub.set(k, []);
      byClub.get(k)!.push(s);
    }
    const rows: ClubRow[] = [];
    Array.from(byClub.keys()).sort((a,b)=>orderIndex(a)-orderIndex(b)).forEach(club => {
      const arr = byClub.get(club)!;
      const avg = (key: keyof Shot) => {
        const xs = arr.map(r => r[key]).filter(isNum) as number[];
        return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
      };
      rows.push({ club, count: arr.length, avgCarry: avg("CarryDistance_yds"), avgTotal: avg("TotalDistance_yds"), avgSmash: avg("SmashFactor"), avgSpin: avg("Backspin_rpm") || avg("SpinRate_rpm"), avgCS: avg("ClubSpeed_mph"), avgBS: avg("BallSpeed_mph"), avgLA: avg("LaunchAngle_deg"), avgF2P: avg("FaceToPath_deg") } as any);
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
  const INSIGHTS_DEFAULT = ["dist", "high", "bench", "assessment", "swings", "records", "progress"];
  const [insightsOrder, setInsightsOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:insights-order");
      const saved = raw ? JSON.parse(raw) : null;
      if (Array.isArray(saved) && saved.length) return Array.from(new Set([...saved, ...INSIGHTS_DEFAULT]));
      return INSIGHTS_DEFAULT;
    } catch { return INSIGHTS_DEFAULT; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:insights-order", JSON.stringify(insightsOrder)); } catch {} }, [insightsOrder]);

  // Goals
  const handleAddGoal = (goal: Omit<Goal, 'id'>) => {
    const newGoal = { ...goal, id: `goal_${Date.now()}` };
    setGoals(prev => [...prev, newGoal]);
  };
  const handleDeleteGoal = (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
  };
  
  // Scorecard Handlers
  const handleSaveScorecard = () => {
    const { course, date } = activeScorecard.header;
    if (!course?.trim() || !date?.trim()) {
      toast({ type: "warn", text: "Please enter a Course and Date before saving." });
      return;
    }
    const name = `${course} - ${date}`;
    const updatedScorecards = { ...savedScorecards, [name]: activeScorecard };
    setSavedScorecards(updatedScorecards);
    setActiveScorecardName(name);
    toast({ type: "success", text: `Round "${name}" saved.` });
    runAchievementChecks([], updatedScorecards);
  };
  const handleLoadScorecard = (name: string) => {
    const data = savedScorecards[name];
    if (data) {
      setActiveScorecard(data);
      setActiveScorecardName(name);
      toast({ type: "info", text: `Loaded round "${name}".` });
    }
  };
  const handleNewScorecard = () => {
    setActiveScorecard(EMPTY_SCORECARD);
    setActiveScorecardName(null);
  };
  const handleDeleteScorecard = () => {
    if (!activeScorecardName) return;
    if (window.confirm(`Are you sure you want to delete the round "${activeScorecardName}"? This cannot be undone.`)) {
      setSavedScorecards(prev => {
        const next = { ...prev };
        delete next[activeScorecardName];
        return next;
      });
      handleNewScorecard();
      toast({ type: 'info', text: `Deleted round "${activeScorecardName}".`});
    }
  };

  const onJournalInput = (html: string) => { setJournals(prev => ({ ...prev, [sessionFilter]: html })); };
  const currentJournalHTML = journals[sessionFilter] || "";
  const sessionLabel = `Journal — ${sessionFilter === "ALL" ? "All Sessions" : sessionFilter}`;

  /* =========================
     Layout / Modals
  ========================= */
  const [isAchievementsModalOpen, setAchievementsModalOpen] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const T = theme;

  return (
    <>
      <div className="print-only">
        <PrintableClubAverages rows={tableRows} />
      </div>

      <div className="screen-only" style={{ background: T.bg, color: T.text, minHeight: "100vh", display: 'flex', flexDirection: 'column' }}>
        {/* Header with tabs + theme */}
        <header className="border-b relative" style={{ borderColor: T.border, background: theme.mode === 'light' ? '#dbe8e1' : T.panel, height: '120px' }}>
          <div className="max-w-6xl mx-auto px-4 h-full flex items-end justify-between gap-3 pb-2">
            <div className="flex items-end gap-2">
              <img src="logo_horiz_color_120w.png" alt="SwingLedger Logo" className="h-24 w-auto" />
            </div>
            <div className="flex items-end gap-2">
              <div className="hidden md:flex items-center gap-2">
                <TopTab label="Dashboard" active={tab === "dashboard"} onClick={() => setTab("dashboard")} theme={T} />
                <TopTab label="Insights"  active={tab === "insights"}  onClick={() => setTab("insights")}  theme={T} />
                <TopTab label="Scorecard" active={tab === "scorecard"} onClick={() => setTab("scorecard")} theme={T} />
                <TopTab label="Goals"     active={tab === "goals"}     onClick={() => setTab("goals")}     theme={T} />
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
              <button
                className="md:hidden px-2 py-1 rounded-md border text-xs"
                style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
                onClick={() => setFiltersOpen(true)}
                title="Filters"
              >
                <IconAdjustments />
              </button>
              <div className="relative">
                <button
                  className="md:hidden px-2 py-1 rounded-md border text-xs"
                  style={{ background: T.panelAlt, borderColor: T.border, color: T.text }}
                  onClick={() => setMobileMenuOpen(prev => !prev)}
                  title="Menu"
                >
                  <IconMenu />
                </button>
                {isMobileMenuOpen && (
                  <div className="absolute top-full right-0 mt-2 w-48 rounded-md shadow-lg border z-50" style={{background: T.panel, borderColor: T.border}}>
                    <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                      <a href="#" onClick={(e) => { e.preventDefault(); setTab("dashboard"); setMobileMenuOpen(false); }} className="block px-4 py-2 text-sm" style={{color: tab === 'dashboard' ? T.brand : T.text}} onMouseOver={e => e.currentTarget.style.backgroundColor=T.panelAlt} onMouseOut={e => e.currentTarget.style.backgroundColor='transparent'} role="menuitem">Dashboard</a>
                      <a href="#" onClick={(e) => { e.preventDefault(); setTab("insights"); setMobileMenuOpen(false); }} className="block px-4 py-2 text-sm" style={{color: tab === 'insights' ? T.brand : T.text}} onMouseOver={e => e.currentTarget.style.backgroundColor=T.panelAlt} onMouseOut={e => e.currentTarget.style.backgroundColor='transparent'} role="menuitem">Insights</a>
                      <a href="#" onClick={(e) => { e.preventDefault(); setTab("scorecard"); setMobileMenuOpen(false); }} className="block px-4 py-2 text-sm" style={{color: tab === 'scorecard' ? T.brand : T.text}} onMouseOver={e => e.currentTarget.style.backgroundColor=T.panelAlt} onMouseOut={e => e.currentTarget.style.backgroundColor='transparent'} role="menuitem">Scorecard</a>
                      <a href="#" onClick={(e) => { e.preventDefault(); setTab("goals"); setMobileMenuOpen(false); }} className="block px-4 py-2 text-sm" style={{color: tab === 'goals' ? T.brand : T.text}} onMouseOver={e => e.currentTarget.style.backgroundColor=T.panelAlt} onMouseOut={e => e.currentTarget.style.backgroundColor='transparent'} role="menuitem">Goals</a>
                      <a href="#" onClick={(e) => { e.preventDefault(); setTab("journal"); setMobileMenuOpen(false); }} className="block px-4 py-2 text-sm" style={{color: tab === 'journal' ? T.brand : T.text}} onMouseOver={e => e.currentTarget.style.backgroundColor=T.panelAlt} onMouseOut={e => e.currentTarget.style.backgroundColor='transparent'} role="menuitem">Journal</a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Filters Drawer */}
        {filtersOpen ? (
          <div className="md:hidden fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setFiltersOpen(false)}>
            <div className="absolute left-0 top-0 bottom-0 w-[90%] max-w-sm overflow-y-auto" style={{ background: T.panel, color: T.text }} onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-2 flex items-center justify-between border-b" style={{ borderColor: T.border }}>
                <div className="text-sm">Filters</div>
                <button className="text-xs underline" style={{ color: T.brand }} onClick={() => setFiltersOpen(false)}>Close</button>
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
                  onShowAchievements={() => setAchievementsModalOpen(true)}
                />
              </div>
            </div>
          </div>
        ) : null}

        <main className="w-full max-w-6xl mx-auto px-4 py-3" style={{ flex: '1 0 auto' }}>
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
                onShowAchievements={() => setAchievementsModalOpen(true)}
              />
            </div>

            {/* Right content */}
            <div>
              {tab === "dashboard" && (
                <DashboardCards
                  theme={T}
                  cardOrder={cardOrder}
                  setCardOrder={setCardOrder}
                  onDragStart={(key) => (e) => e.dataTransfer.setData("text/plain", key)}
                  onDragOver={(_key) => (e) => e.preventDefault()}
                  onDrop={(targetKey) => (e) => {
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
                  }}
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
                  allShots={shots}
                  insightsOrder={insightsOrder}
                  onDragStart={(key) => (e) => e.dataTransfer.setData("text/plain", key)}
                  onDragOver={(_key) => (e) => e.preventDefault()}
                  onDrop={(targetKey) => (e) => {
                    e.preventDefault();
                    const sourceKey = e.dataTransfer.getData("text/plain");
                    if (!sourceKey || sourceKey === targetKey) return;
                    setInsightsOrder(prev => {
                      const cur = [...prev];
                      const si = cur.indexOf(sourceKey);
                      const ti = cur.indexOf(targetKey);
                      if (si < 0 || ti < 0) return cur;
                      cur.splice(si, 1);
                      cur.splice(ti, 0, sourceKey);
                      return cur;
                    });
                  }}
                />
              )}
              {tab === "scorecard" && (
                <ScorecardView
                  theme={T}
                  data={activeScorecard}
                  onUpdate={setActiveScorecard}
                  savedRoundNames={Object.keys(savedScorecards).sort()}
                  onSave={handleSaveScorecard}
                  onLoad={handleLoadScorecard}
                  onNew={handleNewScorecard}
                  onDelete={handleDeleteScorecard}
                  activeScorecardName={activeScorecardName}
                  savedScorecards={savedScorecards}
                />
              )}
              {tab === "goals" && (
                <GoalsView
                  theme={T}
                  goals={goals}
                  shots={shots}
                  clubs={clubs}
                  onAddGoal={handleAddGoal}
                  onDeleteGoal={handleDeleteGoal}
                />
              )}
              {tab === "journal" && (
                <JournalView
                  theme={T}
                  editorRef={journalRef}
                  value={currentJournalHTML}
                  onInputHTML={onJournalInput}
                  sessionLabel={sessionLabel}
                  defaultHeightPx={Math.max(320, Math.floor(filtersHeight))}
                />
              )}
            </div>
          </div>
        </main>

        <Footer T={T} />
        
        {isAchievementsModalOpen && <AchievementsModal theme={T} unlocked={unlockedAchievements} onClose={() => setAchievementsModalOpen(false)} />}
        {newlyUnlockedBatch.length > 0 && <AchievementNotificationModal achievements={newlyUnlockedBatch} onClose={() => setNewlyUnlockedBatch([])} theme={T} />}

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
      </div>
    </>
  );
}

/* =========================
   Printable Table
========================= */
function PrintableClubAverages({ rows }: { rows: ClubRow[] }) {
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">SwingLedger - Club Averages</h1>
      <table className="min-w-full text-sm border-collapse border border-gray-400">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left py-2 px-2 border border-gray-300">Club</th>
            <th className="text-right py-2 px-2 border border-gray-300">#</th>
            <th className="text-right py-2 px-2 border border-gray-300">Avg Carry</th>
            <th className="text-right py-2 px-2 border border-gray-300">Avg Total</th>
            <th className="text-right py-2 px-2 border border-gray-300">Avg Smash</th>
            <th className="text-right py-2 px-2 border border-gray-300">Avg Spin</th>
            <th className="text-right py-2 px-2 border border-gray-300">Avg CS</th>
            <th className="text-right py-2 px-2 border border-gray-300">Avg BS</th>
            <th className="text-right py-2 px-2 border border-gray-300">Avg LA</th>
            <th className="text-right py-2 px-2 border border-gray-300">Avg F2P</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.club} className="odd:bg-white even:bg-gray-50">
              <td className="py-1 px-2 border border-gray-300">{r.club}</td>
              <td className="text-right py-1 px-2 border border-gray-300">{r.count}</td>
              <td className="text-right py-1 px-2 border border-gray-300">{Number(r.avgCarry ?? 0).toFixed(1)}</td>
              <td className="text-right py-1 px-2 border border-gray-300">{Number(r.avgTotal ?? 0).toFixed(1)}</td>
              <td className="text-right py-1 px-2 border border-gray-300">{Number(r.avgSmash ?? 0).toFixed(3)}</td>
              <td className="text-right py-1 px-2 border border-gray-300">{Number(r.avgSpin ?? 0).toFixed(0)}</td>
              <td className="text-right py-1 px-2 border border-gray-300">{Number(r.avgCS ?? 0).toFixed(1)}</td>
              <td className="text-right py-1 px-2 border border-gray-300">{Number(r.avgBS ?? 0).toFixed(1)}</td>
              <td className="text-right py-1 px-2 border border-gray-300">{Number(r.avgLA ?? 0).toFixed(1)}</td>
              <td className="text-right py-1 px-2 border border-gray-300">{Number(r.avgF2P ?? 0).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================
   Achievements Modal
========================= */
function AchievementsModal({ theme: T, unlocked, onClose }: { theme: Theme; unlocked: Set<string>; onClose: () => void; }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl border shadow-lg overflow-hidden" style={{ background: T.panel, borderColor: T.border }} onClick={e => e.stopPropagation()}>
        <header className="p-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.border}`, background: T.panelAlt }}>
          <h3 className="font-semibold">Achievements</h3>
          <button className="text-xs underline" style={{ color: T.brand }} onClick={onClose}>Close</button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {ALL_ACHIEVEMENTS.map(ach => {
              const isUnlocked = unlocked.has(ach.id);
              return (
                <div key={ach.id} className="p-4 flex items-start gap-4" style={{ borderBottom: `1px solid ${T.border}`, opacity: isUnlocked ? 1 : 0.4 }}>
                  <div className="text-2xl pt-0.5">{isUnlocked ? '🏆' : '🔒'}</div>
                  <div>
                    <div className="font-semibold" style={{ color: isUnlocked ? T.text : T.textDim }}>{ach.name}</div>
                    <div className="text-xs" style={{ color: T.textDim }}>{ach.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
    <footer style={{ borderColor: T.border, background: T.mode === 'light' ? '#dbe8e1' : T.bg }}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-2 border-t" style={{borderColor: T.border}}>
        <div className="text-xs" style={{ color: T.textDim }}>
          © {year} SwingLedger
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: T.textDim }}>
          <span>Matt Gonzalez</span>
          <a href="https://www.instagram.com/mattgonzalez79/" target="_blank" rel="noopener noreferrer" title="Instagram" className="hover:text-fuchsia-500 transition-colors">
            <IconInstagram />
          </a>
        </div>
      </div>
    </footer>
  );
}
