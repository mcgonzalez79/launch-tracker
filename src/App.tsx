import React from "react";
import * as XLSX from "xlsx";

import FiltersPanel from "./Filters";
import DashboardView from "./Dashboard";
import InsightsView from "./Insights";
import JournalView from "./Journal";

import { Theme, themeLight, themeDark } from "./theme";
import { Shot, ClubRow, orderIndex, mean } from "./utils";

/** ============ Top-level app state & helpers ============ */

type Tab = "dashboard" | "insights" | "journal";

type Session = {
  id: string;           // stable id, e.g., filename + size + first/last timestamp hash
  name: string;         // nice label (filename or user edited)
  addedAt: number;      // epoch ms
  rows: Shot[];         // parsed shots for this session
};

type Toast = { id: string; kind: "info" | "success" | "warn" | "error"; text: string; createdAt: number };

const TOAST_TTL_MS = 15000;

/** Numeric helper */
const n = (v: any): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  if (!s || s.toUpperCase() === "#DIV/0!" || s.toUpperCase() === "NAN") return undefined;
  const num = Number(s.replace(/,/g, ""));
  return isNaN(num) ? undefined : num;
};

/** Date helper: accepts ISO strings or Excel serials */
const isoDate = (v: any): string | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = v * 24 * 60 * 60 * 1000;
    return new Date(epoch.getTime() + ms).toISOString();
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};

/** Map incoming headers to Shot fields (flexible keys) */
const headerMap: Record<string, keyof Shot> = {
  // core
  "club": "Club",
  "swings": "Swings",

  // speeds, face/path, angles
  "club speed": "ClubSpeed_mph",
  "club speed [mph]": "ClubSpeed_mph",
  "ball speed": "BallSpeed_mph",
  "ball speed [mph]": "BallSpeed_mph",
  "smash factor": "SmashFactor",
  "attack angle": "AttackAngle_deg",
  "attack angle [deg]": "AttackAngle_deg",
  "club path": "ClubPath_deg",
  "club path [deg]": "ClubPath_deg",
  "club face": "ClubFace_deg",
  "club face [deg]": "ClubFace_deg",
  "face to path": "FaceToPath_deg",
  "face to path [deg]": "FaceToPath_deg",

  // launch
  "launch angle": "LaunchAngle_deg",
  "launch angle [deg]": "LaunchAngle_deg",
  "launch direction": "LaunchDirection_deg",
  "launch direction [deg]": "LaunchDirection_deg",

  // spin
  "backspin": "Backspin_rpm",
  "backspin [rpm]": "Backspin_rpm",
  "sidespin": "Sidespin_rpm",
  "sidespin [rpm]": "Sidespin_rpm",
  "spin rate": "SpinRate_rpm",
  "spin rate [rpm]": "SpinRate_rpm",
  "spin rate type": "SpinRateType",
  "spin axis": "SpinAxis_deg",
  "spin axis [deg]": "SpinAxis_deg",

  // flight / result
  "apex height": "ApexHeight_yds",
  "apex height [yds]": "ApexHeight_yds",
  "carry distance": "CarryDistance_yds",
  "carry distance [yards]": "CarryDistance_yds",
  "carry deviation angle": "CarryDeviationAngle_deg",
  "carry deviation angle [deg]": "CarryDeviationAngle_deg",
  "carry deviation distance": "CarryDeviationDistance_yds",
  "carry deviation distance [yards]": "CarryDeviationDistance_yds",
  "total distance": "TotalDistance_yds",
  "total distance [yards]": "TotalDistance_yds",
  "total deviation angle": "TotalDeviationAngle_deg",
  "total deviation angle [deg]": "TotalDeviationAngle_deg",
  "total deviation distance": "TotalDeviationDistance_yds",
  "total deviation distance [yards]": "TotalDeviationDistance_yds",

  // bookkeeping
  "sessionid": "SessionId",
  "session id": "SessionId",
  "timestamp": "Timestamp",
  "date": "Timestamp",
  "datetime": "Timestamp",
};

/** Smash fallback & Face-to-Path derived */
const coalesceSmash = (s: Shot) =>
  s.SmashFactor ?? (s.ClubSpeed_mph && s.BallSpeed_mph ? s.BallSpeed_mph / s.ClubSpeed_mph : undefined);

const coalesceFaceToPath = (s: Shot) =>
  s.FaceToPath_deg ?? ((s.ClubFace_deg !== undefined && s.ClubPath_deg !== undefined)
    ? s.ClubFace_deg - s.ClubPath_deg
    : undefined);

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Dedup key per shot (best-effort) */
function shotKey(s: Shot, idx: number) {
  return [
    s.Timestamp ?? "",
    s.Club ?? "",
    s.CarryDistance_yds ?? "",
    s.TotalDistance_yds ?? "",
    s.BallSpeed_mph ?? "",
    s.ClubSpeed_mph ?? "",
    idx
  ].join("|");
}

/** Parse a worksheet -> Shot[] (tolerant headers) */
function sheetToShots(ws: XLSX.WorkSheet): Shot[] {
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  const shots: Shot[] = rows.map((row) => {
    const s: any = {};
    Object.keys(row).forEach((keyRaw) => {
      const k = keyRaw.trim().toLowerCase();
      const mapped = headerMap[k];
      if (!mapped) return;
      if (mapped === "Timestamp") {
        s[mapped] = isoDate(row[keyRaw]);
      } else if (mapped === "Club" || mapped === "SpinRateType" || mapped === "SessionId") {
        const val = String(row[keyRaw] ?? "").trim();
        if (val) s[mapped] = val;
      } else if (mapped === "Swings") {
        const val = n(row[keyRaw]); if (val !== undefined) s[mapped] = Math.round(val);
      } else {
        const val = n(row[keyRaw]); if (val !== undefined) s[mapped] = val;
      }
    });
    // derived
    const Smash = coalesceSmash(s);
    const F2P = coalesceFaceToPath(s);
    if (Smash !== undefined) s.SmashFactor = clamp(Smash, 0.5, 1.95);
    if (F2P !== undefined) s.FaceToPath_deg = F2P;
    return s as Shot;
  });
  // keep rows that at least have club + carry OR total
  return shots.filter(s => s.Club && (s.CarryDistance_yds != null || s.TotalDistance_yds != null));
}

/** Session id from file meta + content fingerprint */
async function fileToSession(file: File): Promise<Session> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const shots = sheetToShots(ws);

  // fingerprint: filename + size + first/last TS/carry
  const first = shots[0], last = shots[shots.length - 1];
  const fp = [
    file.name, file.size,
    first?.Timestamp ?? "", first?.CarryDistance_yds ?? "",
    last?.Timestamp ?? "", last?.CarryDistance_yds ?? ""
  ].join("#");

  const id = btoa(unescape(encodeURIComponent(fp))).slice(0, 32);
  return {
    id,
    name: file.name,
    addedAt: Date.now(),
    rows: shots
  };
}

/** ========= App ========= */
export default function App() {
  /** Theme & tabs */
  const [dark, setDark] = React.useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem("launch-tracker:dark") || "false"); } catch { return false; }
  });
  const theme: Theme = dark ? themeDark : themeLight;
  React.useEffect(() => {
    try { localStorage.setItem("launch-tracker:dark", JSON.stringify(dark)); } catch {}
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);

  const [tab, setTab] = React.useState<Tab>(() => (localStorage.getItem("launch-tracker:tab") as Tab) || "dashboard");
  React.useEffect(() => { localStorage.setItem("launch-tracker:tab", tab); }, [tab]);

  /** Data store */
  const [sessions, setSessions] = React.useState<Session[]>(() => {
    try { return JSON.parse(localStorage.getItem("launch-tracker:sessions") || "[]"); } catch { return []; }
  });
  const [selectedSessionId, setSelectedSessionId] = React.useState<string | "ALL">(() => {
    return (localStorage.getItem("launch-tracker:selected-session") as any) || "ALL";
  });
  React.useEffect(() => {
    try { localStorage.setItem("launch-tracker:sessions", JSON.stringify(sessions)); } catch {}
  }, [sessions]);
  React.useEffect(() => {
    localStorage.setItem("launch-tracker:selected-session", selectedSessionId);
  }, [selectedSessionId]);

  /** Filters */
  const [selectedClubs, setSelectedClubs] = React.useState<string[]>([]);
  const [excludeOutliers, setExcludeOutliers] = React.useState<boolean>(true);
  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");
  const [carryMin, setCarryMin] = React.useState<number | "">("");
  const [carryMax, setCarryMax] = React.useState<number | "">("");

  /** Toasts */
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const pushToast = React.useCallback((t: Omit<Toast, "id" | "createdAt">) => {
    const item: Toast = { ...t, id: Math.random().toString(36).slice(2), createdAt: Date.now() };
    setToasts(prev => [...prev, item]);
  }, []);
  // autoclose
  React.useEffect(() => {
    const i = setInterval(() => {
      setToasts(prev => prev.filter(t => Date.now() - t.createdAt < TOAST_TTL_MS));
    }, 1000);
    return () => clearInterval(i);
  }, []);

  /** Import handlers */
  const onImportFiles = React.useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;
    let added = 0, dup = 0;
    for (const file of Array.from(files)) {
      try {
        const session = await fileToSession(file);
        const exists = sessions.some(s => s.id === session.id);
        if (exists) { dup++; continue; }
        setSessions(prev => [...prev, session]);
        added++;
      } catch (e) {
        pushToast({ kind: "error", text: `Failed to import "${file.name}"` });
      }
    }
    if (added) pushToast({ kind: "success", text: `Imported ${added} session(s)` });
    if (dup)   pushToast({ kind: "warn", text: `${dup} duplicate session(s) skipped` });
  }, [sessions, pushToast]);

  const deleteSession = React.useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    pushToast({ kind: "info", text: "Session deleted" });
    if (selectedSessionId === sessionId) setSelectedSessionId("ALL");
  }, [selectedSessionId, pushToast]);

  const clearAll = React.useCallback(() => {
    if (!confirm("Delete ALL imported data? This cannot be undone.")) return;
    setSessions([]);
    setSelectedSessionId("ALL");
    pushToast({ kind: "info", text: "All data cleared" });
  }, [pushToast]);

  const exportCsv = React.useCallback(() => {
    const rows = sessions.flatMap(s => s.rows);
    if (!rows.length) { pushToast({ kind: "warn", text: "No data to export" }); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, "launch-tracker-export.csv");
  }, [sessions, pushToast]);

  /** Aggregate shots (respect session dropdown) */
  const allShots: Shot[] = React.useMemo(() => {
    if (selectedSessionId === "ALL") return sessions.flatMap(s => s.rows);
    const s = sessions.find(x => x.id === selectedSessionId);
    return s ? s.rows : [];
  }, [sessions, selectedSessionId]);

  /** Clubs list */
  const clubs = React.useMemo(
    () => Array.from(new Set(allShots.map(s => s.Club))).sort((a,b)=>orderIndex(a)-orderIndex(b)),
    [allShots]
  );

  /** >>> NEW: club color mapping (Driver -> LW order) */
  const CLUB_PALETTE = React.useMemo(
    () => ["#3A86FF", "#FF7F0E", "#2ECC71", "#EF476F", "#8E44AD", "#00B8D9", "#F94144", "#577590", "#E67E22", "#F72585"],
    []
  );
  const clubColorMap = React.useMemo(() => {
    const ordered = [...clubs].sort((a, b) => orderIndex(a) - orderIndex(b));
    const m = new Map<string, string>();
    ordered.forEach((c, i) => m.set(c, CLUB_PALETTE[i % CLUB_PALETTE.length]));
    return m;
  }, [clubs, CLUB_PALETTE]);
  const clubColorOf = React.useCallback(
    (club: string) => clubColorMap.get(club) ?? CLUB_PALETTE[0],
    [clubColorMap, CLUB_PALETTE]
  );
  /** <<< NEW: club color mapping */

  /** Filters (club, date, carry range) */
  const filteredBase = React.useMemo(() => {
    let pool = allShots;
    if (selectedClubs.length) {
      const set = new Set(selectedClubs);
      pool = pool.filter(s => set.has(s.Club));
    }
    // date range
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(dateTo) : null;
      if (to) to.setDate(to.getDate() + 1);
      pool = pool.filter(s => {
        if (!s.Timestamp) return true;
        const d = new Date(s.Timestamp);
        if (isNaN(d.getTime())) return true;
        if (from && d < from) return false;
        if (to && d >= to) return false;
        return true;
      });
    }
    // carry range
    if (carryMin !== "" || carryMax !== "") {
      const lo = carryMin === "" ? -Infinity : Number(carryMin);
      const hi = carryMax === "" ? Infinity  : Number(carryMax);
      pool = pool.filter(s => {
        const c = s.CarryDistance_yds ?? s.TotalDistance_yds;
        if (c == null) return false;
        return c >= lo && c <= hi;
      });
    }
    return pool;
  }, [allShots, selectedClubs, dateFrom, dateTo, carryMin, carryMax]);

  /** Outlier filtering (2.5σ on Carry & Smash) */
  const filteredOutliers = React.useMemo(() => {
    if (!excludeOutliers) return filteredBase;
    const carryVals = filteredBase.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
    const smashVals = filteredBase.map(s => s.SmashFactor).filter((x): x is number => x != null);
    if (carryVals.length < 5 || smashVals.length < 5) return filteredBase;
    const mCarry = mean(carryVals);
    const sCarry = Math.sqrt(carryVals.reduce((a,b)=>a+(b-mCarry)*(b-mCarry),0)/carryVals.length);
    const mSmash = mean(smashVals);
    const sSmash = Math.sqrt(smashVals.reduce((a,b)=>a+(b-mSmash)*(b-mSmash),0)/smashVals.length);
    const inCarry = (x?: number) => x == null ? false : (x >= mCarry - 2.5*sCarry && x <= mCarry + 2.5*sCarry);
    const inSmash = (x?: number) => x == null ? false : (x >= mSmash - 2.5*sSmash && x <= mSmash + 2.5*sSmash);
    return filteredBase.filter(s => inCarry(s.CarryDistance_yds) && inSmash(s.SmashFactor));
  }, [filteredBase, excludeOutliers]);

  /** A variant that ignores club selection (for some Insights cards) */
  const filteredNoClubBase = React.useMemo(() => {
    // like filteredBase but without club filter
    let pool = allShots;

    // date range
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(dateTo) : null;
      if (to) to.setDate(to.getDate() + 1);
      pool = pool.filter(s => {
        if (!s.Timestamp) return true;
        const d = new Date(s.Timestamp);
        if (isNaN(d.getTime())) return true;
        if (from && d < from) return false;
        if (to && d >= to) return false;
        return true;
      });
    }
    // carry range
    if (carryMin !== "" || carryMax !== "") {
      const lo = carryMin === "" ? -Infinity : Number(carryMin);
      const hi = carryMax === "" ? Infinity  : Number(carryMax);
      pool = pool.filter(s => {
        const c = s.CarryDistance_yds ?? s.TotalDistance_yds;
        if (c == null) return false;
        return c >= lo && c <= hi;
      });
    }
    return pool;
  }, [allShots, dateFrom, dateTo, carryMin, carryMax]);

  const filteredNoClubOutliers = React.useMemo(() => {
    if (!excludeOutliers) return filteredNoClubBase;
    const carryVals = filteredNoClubBase.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
    const smashVals = filteredNoClubBase.map(s => s.SmashFactor).filter((x): x is number => x != null);
    if (carryVals.length < 5 || smashVals.length < 5) return filteredNoClubBase;
    const mCarry = mean(carryVals);
    const sCarry = Math.sqrt(carryVals.reduce((a,b)=>a+(b-mCarry)*(b-mCarry),0)/carryVals.length);
    const mSmash = mean(smashVals);
    const sSmash = Math.sqrt(smashVals.reduce((a,b)=>a+(b-mSmash)*(b-mSmash),0)/smashVals.length);
    const inCarry = (x?: number) => x == null ? false : (x >= mCarry - 2.5*sCarry && x <= mCarry + 2.5*sCarry);
    const inSmash = (x?: number) => x == null ? false : (x >= mSmash - 2.5*sSmash && x <= mSmash + 2.5*sSmash);
    return filteredNoClubBase.filter(s => inCarry(s.CarryDistance_yds) && inSmash(s.SmashFactor));
  }, [filteredNoClubBase, excludeOutliers]);

  /** A raw all-clubs pool (ignoring outliers) for global PRs if needed */
  const filteredNoClub = filteredNoClubBase;

  /** Club averages table rows (for Dashboard & Insights if needed) */
  const tableRows: ClubRow[] = React.useMemo(() => {
    const byClub = new Map<string, Shot[]>();
    filteredOutliers.forEach(s => {
      if (!byClub.has(s.Club)) byClub.set(s.Club, []);
      byClub.get(s.Club)!.push(s);
    });
    const rows: ClubRow[] = [];
    byClub.forEach((arr, club) => {
      const grab = (sel: (s: Shot) => number | undefined) =>
        arr.map(sel).filter((x): x is number => x != null);
      const carry = grab(s => s.CarryDistance_yds);
      const total = grab(s => s.TotalDistance_yds);
      const smash = grab(s => s.SmashFactor);
      const spin = grab(s => s.SpinRate_rpm);
      const cs = grab(s => s.ClubSpeed_mph);
      const bs = grab(s => s.BallSpeed_mph);
      const la = grab(s => s.LaunchAngle_deg);
      const f2p = grab(s => s.FaceToPath_deg);

      const m = (a: number[]) => (a.length ? mean(a) : 0);
      const sd = (a: number[]) => {
        if (a.length < 2) return 0;
        const mu = mean(a);
        return Math.sqrt(a.reduce((acc, v) => acc + (v - mu) * (v - mu), 0) / a.length);
      };

      rows.push({
        club,
        count: arr.length,
        avgCarry: m(carry),
        avgTotal: m(total),
        sdCarry: sd(carry),
        avgSmash: m(smash),
        avgSpin: m(spin),
        avgCS: m(cs),
        avgBS: m(bs),
        avgLA: m(la),
        // optional: face-to-path shown on dashboard’s table if your component supports it
        // @ts-ignore
        avgF2P: m(f2p),
      } as any);
    });
    return rows.sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
  }, [filteredOutliers]);

  /** Insights card order (draggable) */
  const [insightsOrder, setInsightsOrder] = React.useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:insights-order");
      return raw ? JSON.parse(raw) : ["distanceBox", "highlights", "warnings", "personalRecords", "progress", "weaknesses"];
    } catch { return ["distanceBox", "highlights", "warnings", "personalRecords", "progress", "weaknesses"]; }
  });
  React.useEffect(() => {
    try { localStorage.setItem("launch-tracker:insights-order", JSON.stringify(insightsOrder)); } catch {}
  }, [insightsOrder]);

  const dragKey = React.useRef<string | null>(null);
  const onDragStart = (k: string) => (e: React.DragEvent) => { dragKey.current = k; e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (_k: string) => (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (k: string) => (_e: React.DragEvent) => {
    const from = dragKey.current; dragKey.current = null;
    if (!from || from === k) return;
    const arr = [...insightsOrder];
    const i = arr.indexOf(from), j = arr.indexOf(k);
    if (i < 0 || j < 0) return;
    arr.splice(i, 1);
    arr.splice(j, 0, from);
    setInsightsOrder(arr);
  };

  /** Load sample (uses your latest sample structure) */
  const loadSample = React.useCallback(() => {
    // You can replace with your real sample rows; kept tiny synthetic here.
    const sample: Shot[] = [
      { Club: "Driver",  ClubSpeed_mph: 85.1, BallSpeed_mph: 119.8, SmashFactor: 1.41, LaunchAngle_deg: 12.9, Backspin_rpm: 3465, CarryDistance_yds: 176, TotalDistance_yds: 193, SpinAxis_deg: -1.7, Timestamp: "2025-08-08T12:00:00Z" },
      { Club: "4 Hybrid", ClubSpeed_mph: 80.1, BallSpeed_mph: 105.4, SmashFactor: 1.32, LaunchAngle_deg: 12.4, Backspin_rpm: 3391, CarryDistance_yds: 139, TotalDistance_yds: 161, SpinAxis_deg: -2.9, Timestamp: "2025-08-08T12:05:00Z" },
      { Club: "7 Iron",  ClubSpeed_mph: 72.5, BallSpeed_mph: 90.0, SmashFactor: 1.24, LaunchAngle_deg: 13.9, Backspin_rpm: 4463, CarryDistance_yds: 103, TotalDistance_yds: 121, SpinAxis_deg: 1.1, Timestamp: "2025-08-08T12:14:00Z" },
      { Club: "60 (LW)",  ClubSpeed_mph: 64.1, BallSpeed_mph: 63.4, SmashFactor: 0.99, LaunchAngle_deg: 27.6, Backspin_rpm: 5975, CarryDistance_yds: 60, TotalDistance_yds: 70, SpinAxis_deg: 4.9, Timestamp: "2025-08-08T12:26:00Z" },
    ];
    const sess: Session = {
      id: "sample",
      name: "Sample Data",
      addedAt: Date.now(),
      rows: sample
    };
    // replace or add
    setSessions(prev => {
      const p = prev.filter(s => s.id !== "sample");
      return [...p, sess];
    });
    setSelectedSessionId("ALL");
    pushToast({ kind: "success", text: "Loaded sample data" });
  }, [pushToast]);

  /** Top bar */
  const Brand = (
    <div className="flex items-center gap-3">
      <span style={{ fontWeight: 700, letterSpacing: 0.2, color: theme.brand }}>Launch Tracker</span>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: theme.appBg, color: theme.text }}>
      {/* Header */}
      <header className="px-6 py-4" style={{ background: theme.headerBg, color: theme.headerFg, position: "sticky", top: 0, zIndex: 10 }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {Brand}
          <div className="flex items-center gap-2">
            <NavBtn label="Dashboard" active={tab === "dashboard"} onClick={() => setTab("dashboard")} />
            <NavBtn label="Insights"  active={tab === "insights"}  onClick={() => setTab("insights")} />
            <NavBtn label="Journal"   active={tab === "journal"}   onClick={() => setTab("journal")} />
            <button
              onClick={() => setDark(d => !d)}
              title={dark ? "Light mode" : "Dark mode"}
              className="ml-2 px-2 py-1 rounded-md border"
              style={{ borderColor: "#e5e7eb", background: dark ? "#0b1220" : "#fff", color: dark ? "#fff" : "#111827" }}
            >
              {dark ? "🌞" : "🌙"}
            </button>
          </div>
        </div>
      </header>

      {/* Toasts */}
      <div className="fixed top-16 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className="px-3 py-2 rounded-lg shadow text-sm flex items-center gap-2"
            style={{
              background: t.kind === "error" ? "#fee2e2"
                : t.kind === "warn" ? "#fef3c7"
                : t.kind === "success" ? "#dcfce7"
                : "#e5e7eb",
              color: "#111827",
              border: "1px solid #e5e7eb",
              maxWidth: 380
            }}
          >
            <span>{t.text}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              title="Dismiss"
              className="ml-auto px-2 py-1 rounded-md"
              style={{ background: "#00000010" }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <main className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-6">
        {/* Left: Filters */}
        <aside className="col-span-12 lg:col-span-3">
          <FiltersPanel
            theme={theme}
            // data context
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            setSelectedSessionId={setSelectedSessionId}
            clubs={clubs}
            selectedClubs={selectedClubs}
            setSelectedClubs={setSelectedClubs}
            // filters
            excludeOutliers={excludeOutliers}
            setExcludeOutliers={setExcludeOutliers}
            dateFrom={dateFrom} dateTo={dateTo}
            setDateFrom={setDateFrom} setDateTo={setDateTo}
            carryMin={carryMin} carryMax={carryMax}
            setCarryMin={setCarryMin} setCarryMax={setCarryMax}
            // actions
            onImportFiles={onImportFiles}
            onDeleteSession={deleteSession}
            onDeleteAll={clearAll}
            onExportCsv={exportCsv}
            onLoadSample={loadSample}
            // helpers
            onSelectAllClubs={() => setSelectedClubs(clubs)}
          />
        </aside>

        {/* Right: Content */}
        <section className="col-span-12 lg:col-span-9">
          {tab === "dashboard" && (
            <DashboardView
              theme={theme}
              clubs={clubs}
              tableRows={tableRows}
              // datasets
              filteredOutliers={filteredOutliers}
              // for dispersion etc. if your Dashboard needs color mapping too
              clubColorOf={clubColorOf}
            />
          )}

          {tab === "insights" && (
            <InsightsView
              theme={theme}
              tableRows={tableRows}
              filteredOutliers={filteredOutliers}
              filteredNoClubOutliers={filteredNoClubOutliers}
              filteredNoClubRaw={filteredNoClub}
              allClubs={clubs}
              insightsOrder={insightsOrder}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              // >>> NEW: pass exact color mapping so boxplot matches Filters
              clubColorOf={clubColorOf}
            />
          )}

          {tab === "journal" && (
            <JournalView theme={theme} />
          )}
        </section>
      </main>

      <footer className="px-6 py-6 text-xs text-center" style={{ color: "#64748b" }}>
        Launch Tracker — keep swinging! ⛳
      </footer>
    </div>
  );
}

/** ============ Small UI helper ============ */
function NavBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 rounded-md text-sm border"
      style={{
        background: active ? "#10b981" : "#ffffff",
        borderColor: "#e5e7eb",
        color: active ? "#ffffff" : "#111827",
        fontWeight: active ? 600 : 500
      }}
    >
      {label}
    </button>
  );
}
