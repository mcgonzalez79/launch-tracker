import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Scatter, ScatterChart, ZAxis, Label
} from "recharts";
import * as XLSX from "xlsx";

/** ===== THEME (Green + White) ===== */
const COLORS = {
  brand: "#006747",
  brandTint: "#2F8C76",
  brandSoft: "#ECF8F1",
  white: "#ffffff",
  gray700: "#334155",
  gray600: "#475569",
  gray400: "#94A3B8",
  gray300: "#E5E7EB",
  gray200: "#F1F5F9",
  blueSoft: "#EEF5FF",
  greenSoft: "#EDFDF3",
  orangeSoft: "#FFF6EC",
};

// Per-club palette (distinct)
const clubPalette = [
  "#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD", "#8C564B",
  "#E377C2", "#17BECF", "#7F7F7F", "#BCBD22", "#AEC7E8", "#FFBB78",
];

// Gap chart uses ONLY these two:
const CARRY_BAR = "#1F77B4";      // blue
const TOTAL_BAR = COLORS.brand;   // green

/** ===== TYPES ===== */
type Shot = {
  SessionId?: string;
  Timestamp?: string;
  Club: string;
  Swings?: number;

  ClubSpeed_mph?: number;
  AttackAngle_deg?: number;
  ClubPath_deg?: number;
  ClubFace_deg?: number;
  FaceToPath_deg?: number;

  BallSpeed_mph?: number;
  SmashFactor?: number;

  LaunchAngle_deg?: number;
  LaunchDirection_deg?: number;

  Backspin_rpm?: number;
  Sidespin_rpm?: number;
  SpinRate_rpm?: number;
  SpinRateType?: string;

  SpinAxis_deg?: number;
  ApexHeight_yds?: number;

  CarryDistance_yds?: number;
  CarryDeviationAngle_deg?: number;
  CarryDeviationDistance_yds?: number;

  TotalDistance_yds?: number;
  TotalDeviationAngle_deg?: number;
  TotalDeviationDistance_yds?: number;
};

type ClubRow = {
  club: string;
  count: number;
  avgCarry: number;
  avgTotal: number;
  sdCarry: number;
  avgSmash: number;
  avgSpin: number;
  avgCS: number;
  avgBS: number;
  avgLA: number;
};

/** ===== UTIL: STATS & HELPERS ===== */
const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
const stddev = (arr: number[]) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = mean(arr.map(x => (x - m) ** 2));
  return Math.sqrt(v);
};
const n = (v: any): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  if (!s || s.toUpperCase() === "#DIV/0!" || s.toUpperCase() === "NAN") return undefined;
  const num = Number(s.replace(/,/g, ""));
  return isNaN(num) ? undefined : num;
};
const isoDate = (v: any): string | undefined => {
  if (!v) return undefined;
  if (typeof v === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = v * 24 * 60 * 60 * 1000;
    return new Date(epoch.getTime() + ms).toISOString();
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const coalesceSmash = (s: Shot) =>
  s.SmashFactor ?? (s.ClubSpeed_mph && s.BallSpeed_mph ? s.BallSpeed_mph / s.ClubSpeed_mph : undefined);
const coalesceFaceToPath = (s: Shot) =>
  s.FaceToPath_deg ?? (s.ClubFace_deg !== undefined && s.ClubPath_deg !== undefined
    ? s.ClubFace_deg - s.ClubPath_deg
    : undefined);

// Display order for clubs
const ORDER = [
  "Driver",
  "3 Wood", "5 Wood", "7 Wood",
  "2 Hybrid", "3 Hybrid", "4 Hybrid", "5 Hybrid", "5 Hybrid (5 Iron)",
  "3 Iron", "4 Iron", "5 Iron", "6 Iron", "7 Iron", "8 Iron", "9 Iron",
  "Pitching Wedge", "Gap Wedge", "Sand Wedge", "Lob Wedge", "60 (LW)"
];
const orderIndex = (name: string) => {
  const i = ORDER.findIndex(o => o.toLowerCase() === name.toLowerCase());
  if (i >= 0) return i;
  const lower = name.toLowerCase();
  if (lower.includes("driver")) return 0;
  if (lower.includes("wood")) {
    const m = lower.match(/(\d+)\s*wood/);
    return m ? 1 + Number(m[1]) : 4;
  }
  if (lower.includes("hybrid")) {
    const m = lower.match(/(\d+)\s*hybrid/);
    return m ? 10 + Number(m[1]) : 12;
  }
  if (lower.includes("iron")) {
    const m = lower.match(/(\d+)\s*iron/);
    return m ? 20 + Number(m[1]) : 28;
  }
  if (lower.includes("pitch") || lower.includes("pw")) return 40;
  if (lower.includes("gap")) return 41;
  if (lower.includes("sand") || lower.includes("(sw)")) return 42;
  if (lower.includes("lob") || lower.includes("(lw)")) return 43;
  return 99;
};

/** Robust header normalization */
function normalizeHeader(raw: string): string {
  let s = String(raw || "").trim().toLowerCase();
  // remove content in [] or () like "[yards]" or "(mph)"
  s = s.replace(/\[[^\]]*\]/g, "").replace(/\([^\)]*\)/g, "");
  s = s.replace(/[_\-]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/:$/, ""); // trailing colon
  // unify words
  s = s.replace(/\bclub speed\b/, "club speed")
       .replace(/\bball speed\b/, "ball speed")
       .replace(/\bsmash\s*factor\b/, "smash factor")
       .replace(/\battack angle\b/, "attack angle")
       .replace(/\bclub path\b/, "club path")
       .replace(/\bclub face\b/, "club face")
       .replace(/\bface to path\b/, "face to path")
       .replace(/\blaunch angle\b/, "launch angle")
       .replace(/\blaunch direction\b/, "launch direction")
       .replace(/\bbackspin\b/, "backspin")
       .replace(/\bsidespin\b/, "sidespin")
       .replace(/\bspin rate\b/, "spin rate")
       .replace(/\bspin axis\b/, "spin axis")
       .replace(/\bapex height\b/, "apex height")
       .replace(/\bcarry distance\b/, "carry distance")
       .replace(/\bcarry deviation angle\b/, "carry deviation angle")
       .replace(/\bcarry deviation distance\b/, "carry deviation distance")
       .replace(/\btotal distance\b/, "total distance")
       .replace(/\btotal deviation angle\b/, "total deviation angle")
       .replace(/\btotal deviation distance\b/, "total deviation distance");
  return s;
}

/** Header map after normalization */
const headerMap: Record<string, keyof Shot> = {
  "club": "Club",
  "swings": "Swings",

  "club speed": "ClubSpeed_mph",
  "attack angle": "AttackAngle_deg",
  "club path": "ClubPath_deg",
  "club face": "ClubFace_deg",
  "face to path": "FaceToPath_deg",

  "ball speed": "BallSpeed_mph",
  "smash factor": "SmashFactor",

  "launch angle": "LaunchAngle_deg",
  "launch direction": "LaunchDirection_deg",

  "backspin": "Backspin_rpm",
  "sidespin": "Sidespin_rpm",
  "spin rate": "SpinRate_rpm",
  "spin rate type": "SpinRateType",
  "spin axis": "SpinAxis_deg",

  "apex height": "ApexHeight_yds",

  "carry distance": "CarryDistance_yds",
  "carry deviation angle": "CarryDeviationAngle_deg",
  "carry deviation distance": "CarryDeviationDistance_yds",

  "total distance": "TotalDistance_yds",
  "total deviation angle": "TotalDeviationAngle_deg",
  "total deviation distance": "TotalDeviationDistance_yds",

  "sessionid": "SessionId",
  "session id": "SessionId",
  "timestamp": "Timestamp",
  "date": "Timestamp",
  "datetime": "Timestamp",
};

/** ===== APP ===== */
export default function App() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedClubs, setSelectedClubs] = useState<string[]>([]);
  const [excludeOutliers, setExcludeOutliers] = useState<boolean>(true);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [sessionFilter, setSessionFilter] = useState<string>("ALL");
  const [carryMin, setCarryMin] = useState<string>("");
  const [carryMax, setCarryMax] = useState<string>("");
  const [importMsg, setImportMsg] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:shots");
      if (raw) {
        const parsed: Shot[] = JSON.parse(raw);
        setShots(parsed);
      }
    } catch {}
  }, []);
  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("launch-tracker:shots", JSON.stringify(shots));
    } catch {}
  }, [shots]);

  const clubs = useMemo(
    () => Array.from(new Set(shots.map(s => s.Club))).sort((a, b) => orderIndex(a) - orderIndex(b)),
    [shots]
  );

  const sessions = useMemo(() => {
    const ids = Array.from(new Set(shots.map(s => s.SessionId ?? "Unknown Session")));
    return ["ALL", ...ids.sort()];
  }, [shots]);

  const carryBounds = useMemo(() => {
    const vals = shots.map(s => s.CarryDistance_yds).filter((v): v is number => v !== undefined);
    if (!vals.length) return { min: 0, max: 0 };
    return { min: Math.floor(Math.min(...vals)), max: Math.ceil(Math.max(...vals)) };
  }, [shots]);

  const loadSample = () => {
    const id = `Sample ${new Date().toLocaleString()}`;
    const sample: Shot[] = [
      { SessionId: id, Club: "Driver", ClubSpeed_mph: 85.1, BallSpeed_mph: 119.8, SmashFactor: 1.41, LaunchAngle_deg: 12.9, Backspin_rpm: 3465, CarryDistance_yds: 176, TotalDistance_yds: 193, SpinAxis_deg: -1.7, Timestamp: "2025-08-08T12:00:00Z" },
      { SessionId: id, Club: "4 Hybrid", ClubSpeed_mph: 80.1, BallSpeed_mph: 105.4, SmashFactor: 1.32, LaunchAngle_deg: 12.4, Backspin_rpm: 3391, CarryDistance_yds: 139, TotalDistance_yds: 161, SpinAxis_deg: -2.9, Timestamp: "2025-08-08T12:05:00Z" },
      { SessionId: id, Club: "5 Hybrid (5 Iron)", ClubSpeed_mph: 78.7, BallSpeed_mph: 99.3, SmashFactor: 1.26, LaunchAngle_deg: 11.8, Backspin_rpm: 3932, CarryDistance_yds: 120, TotalDistance_yds: 143, SpinAxis_deg: -7.7, Timestamp: "2025-08-08T12:08:00Z" },
      { SessionId: id, Club: "6 Iron", ClubSpeed_mph: 74.3, BallSpeed_mph: 94.8, SmashFactor: 1.27, LaunchAngle_deg: 14.6, Backspin_rpm: 3771, CarryDistance_yds: 115, TotalDistance_yds: 133, SpinAxis_deg: -0.2, Timestamp: "2025-08-08T12:11:00Z" },
      { SessionId: id, Club: "7 Iron", ClubSpeed_mph: 72.5, BallSpeed_mph: 90.0, SmashFactor: 1.24, LaunchAngle_deg: 13.9, Backspin_rpm: 4463, CarryDistance_yds: 103, TotalDistance_yds: 121, SpinAxis_deg: 1.1, Timestamp: "2025-08-08T12:14:00Z" },
      { SessionId: id, Club: "8 Iron", ClubSpeed_mph: 70.7, BallSpeed_mph: 85.3, SmashFactor: 1.20, LaunchAngle_deg: 17.5, Backspin_rpm: 4426, CarryDistance_yds: 100, TotalDistance_yds: 114, SpinAxis_deg: 0.1, Timestamp: "2025-08-08T12:17:00Z" },
      { SessionId: id, Club: "9 Iron", ClubSpeed_mph: 68.9, BallSpeed_mph: 83.8, SmashFactor: 1.22, LaunchAngle_deg: 19.8, Backspin_rpm: 4446, CarryDistance_yds: 93,  TotalDistance_yds: 110, SpinAxis_deg: 0.7, Timestamp: "2025-08-08T12:20:00Z" },
      { SessionId: id, Club: "Pitching Wedge", ClubSpeed_mph: 69.5, BallSpeed_mph: 84.1, SmashFactor: 1.21, LaunchAngle_deg: 20.1, Backspin_rpm: 5760, CarryDistance_yds: 99,  TotalDistance_yds: 109, SpinAxis_deg: 0.3, Timestamp: "2025-08-08T12:23:00Z" },
      { SessionId: id, Club: "60 (LW)", ClubSpeed_mph: 64.1, BallSpeed_mph: 63.4, SmashFactor: 0.99, LaunchAngle_deg: 27.6, Backspin_rpm: 5975, CarryDistance_yds: 60,  TotalDistance_yds: 70,  SpinAxis_deg: 4.9, Timestamp: "2025-08-08T12:26:00Z" },
    ];
    setShots(prev => [...prev, ...sample.map(applyDerived)]);
    setImportMsg(`Loaded sample session (${sample.length} shots).`);
  };

  /** ===== Importer (CSV/XLSX/XLS) with delimiter & header normalization ===== */
  const onFile = async (file: File) => {
    let wb: XLSX.WorkBook;
    try {
      const isCSV =
        /\.csv$/i.test(file.name) ||
        file.type === "text/csv" ||
        file.type === "application/vnd.ms-excel";

      if (isCSV) {
        let text = await file.text();

        // Detect delimiter: comma, semicolon, or tab
        const firstLine = text.split(/\r?\n/)[0] || "";
        const comma = (firstLine.match(/,/g) || []).length;
        const semi = (firstLine.match(/;/g) || []).length;
        const tabs = (firstLine.match(/\t/g) || []).length;
        let FS = ",";
        if (semi > comma && semi >= tabs) FS = ";";
        if (tabs > comma && tabs >= semi) FS = "\t";

        wb = XLSX.read(text, { type: "string", FS });
      } else {
        const buf = await file.arrayBuffer();
        wb = XLSX.read(buf, { type: "array" });
      }
    } catch (err) {
      console.error(err);
      setImportMsg("Sorry, I couldn't read that file. Is it a CSV/XLSX/XLS export?");
      return;
    }

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Convert to JSON with raw headers; we will normalize below
    const rowsRaw: any[] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true, header: 1 }) as any[];
    if (!rowsRaw.length) {
      setImportMsg("The file seems empty.");
      return;
    }

    // Build a normalized header index
    const headerRow = rowsRaw[0] as any[];
    const normIndex: (keyof Shot | undefined)[] = headerRow.map((h) => {
      const key = normalizeHeader(String(h ?? ""));
      return headerMap[key];
    });

    // If we fail to map at least one key, warn (but continue)
    if (!normIndex.some(Boolean)) {
      setImportMsg("Could not match any known columns. Please check your header names.");
      return;
    }

    // Turn remaining rows into objects
    const objects = rowsRaw.slice(1).map((rowArr) => {
      const obj: Record<string, any> = {};
      rowArr.forEach((cell: any, i: number) => {
        const mappedKey = normIndex[i];
        if (!mappedKey) return;
        obj[mappedKey] = cell;
      });
      return obj;
    });

    const fallbackId = `${file.name.replace(/\.[^.]+$/, "")} • ${new Date().toLocaleString()}`;

    let totalRows = objects.length;
    let mappedCount = 0;
    const mapped: Shot[] = objects
      .map((row) => {
        const shot: any = {};

        // Assign with number/date parsing
        Object.keys(row).forEach((mappedKey) => {
          const k = mappedKey as keyof Shot;
          const v = row[k];

          if (k === "Timestamp") {
            shot[k] = isoDate(v);
          } else if (k === "SpinRateType" || k === "Club" || k === "SessionId") {
            const val = String(v ?? "").trim();
            if (val) shot[k] = val;
          } else if (k === "Swings") {
            const val = n(v); if (val !== undefined) shot[k] = Math.round(val);
          } else {
            const val = n(v); if (val !== undefined) shot[k] = val;
          }
        });

        if (!shot.SessionId) shot.SessionId = fallbackId;
        if (!shot.Club) return null; // need at least the club
        mappedCount++;
        return applyDerived(shot as Shot);
      })
      .filter(Boolean) as Shot[];

    // Keep rows even if they lack carry (charts may ignore them, but session list should update)
    setShots((prev) => [...prev, ...mapped]);

    const withCarry = mapped.filter(s => s.CarryDistance_yds !== undefined).length;
    setImportMsg(`Imported ${mapped.length}/${totalRows} rows from "${file.name}" (${withCarry} with carry distance). Session: ${mapped[0]?.SessionId ?? "N/A"}`);
  };

  function applyDerived(s: Shot): Shot {
    const s2 = { ...s };
    const Sm = coalesceSmash(s2);
    const F2P = coalesceFaceToPath(s2);
    if (Sm !== undefined) s2.SmashFactor = clamp(Sm, 0.5, 1.95);
    if (F2P !== undefined) s2.FaceToPath_deg = F2P;
    return s2;
  }

  /** Filters */
  const filtered = useMemo(() => {
    let pool = shots;

    if (sessionFilter !== "ALL") {
      pool = pool.filter(s => (s.SessionId ?? "Unknown Session") === sessionFilter);
    }

    pool = selectedClubs.length ? pool.filter(s => selectedClubs.includes(s.Club)) : pool;

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
  }, [shots, sessionFilter, selectedClubs, dateFrom, dateTo, carryMin, carryMax]);

  /** Outlier filter (2.5σ on Carry & Smash) */
  const filteredOutliers = useMemo(() => {
    if (!excludeOutliers) return filtered;

    const carryVals = filtered.map(s => s.CarryDistance_yds!).filter((x): x is number => x != null);
    const smashVals = filtered.map(s => s.SmashFactor!).filter((x): x is number => x != null);

    if (carryVals.length < 5 || smashVals.length < 5) return filtered;

    const cm = mean(carryVals), cs = stddev(carryVals);
    const sm = mean(smashVals), ss = stddev(smashVals);
    const inCarry = (x?: number) => x === undefined ? false : (x >= cm - 2.5 * cs && x <= cm + 2.5 * cs);
    const inSmash = (x?: number) => x === undefined ? false : (x >= sm - 2.5 * ss && x <= sm + 2.5 * ss);

    return filtered.filter(s => inCarry(s.CarryDistance_yds) && inSmash(s.SmashFactor));
  }, [filtered, excludeOutliers]);

  /** KPIs & Shot Shape */
  const kpis = useMemo(() => {
    const grab = (sel: (s: Shot) => number | undefined) =>
      filteredOutliers.map(sel).filter((x): x is number => x !== undefined);

    const carry = grab(s => s.CarryDistance_yds);
    const total = grab(s => s.TotalDistance_yds);
    const smash = grab(s => s.SmashFactor);
    const spin = grab(s => s.SpinRate_rpm);
    const cs = grab(s => s.ClubSpeed_mph);
    const bs = grab(s => s.BallSpeed_mph);
    const la = grab(s => s.LaunchAngle_deg);

    const draw = filteredOutliers.filter(s => (s.SpinAxis_deg ?? 0) < -2).length;
    const fade = filteredOutliers.filter(s => (s.SpinAxis_deg ?? 0) > 2).length;
    const shotsN = filteredOutliers.length;
    const straight = Math.max(0, shotsN - draw - fade);
    const pct = (n: number) => (shotsN ? (n / shotsN) * 100 : 0);

    return {
      avgCarry: carry.length ? mean(carry) : undefined,
      avgTotal: total.length ? mean(total) : undefined,
      sdCarry: carry.length ? stddev(carry) : undefined,
      avgSmash: smash.length ? mean(smash) : undefined,
      avgSpin: spin.length ? mean(spin) : undefined,
      avgCS: cs.length ? mean(cs) : undefined,
      avgBS: bs.length ? mean(bs) : undefined,
      avgLA: la.length ? mean(la) : undefined,
      shots: shotsN,
      shape: {
        draw: { n: draw, pct: pct(draw) },
        straight: { n: straight, pct: pct(straight) },
        fade: { n: fade, pct: pct(fade) },
      },
    };
  }, [filteredOutliers]);

  /** Aggregates per club */
  const tableRows: ClubRow[] = useMemo(() => {
    const byClub = new Map<string, Shot[]>();
    filteredOutliers.forEach(s => {
      if (!byClub.has(s.Club)) byClub.set(s.Club, []);
      byClub.get(s.Club)!.push(s);
    });
    const rows: ClubRow[] = [];
    for (const [club, arr] of byClub.entries()) {
      const grab = (sel: (s: Shot) => number | undefined) =>
        arr.map(sel).filter((x): x is number => x !== undefined);
      const carry = grab(s => s.CarryDistance_yds);
      rows.push({
        club,
        count: arr.length,
        avgCarry: carry.length ? mean(carry) : 0,
        avgTotal: (grab(s => s.TotalDistance_yds).length ? mean(grab(s => s.TotalDistance_yds)) : 0),
        sdCarry: carry.length ? stddev(carry) : 0,
        avgSmash: (grab(s => s.SmashFactor).length ? mean(grab(s => s.SmashFactor)) : 0),
        avgSpin: (grab(s => s.SpinRate_rpm).length ? mean(grab(s => s.SpinRate_rpm)) : 0),
        avgCS: (grab(s => s.ClubSpeed_mph).length ? mean(grab(s => s.ClubSpeed_mph)) : 0),
        avgBS: (grab(s => s.BallSpeed_mph).length ? mean(grab(s => s.BallSpeed_mph)) : 0),
        avgLA: (grab(s => s.LaunchAngle_deg).length ? mean(grab(s => s.LaunchAngle_deg)) : 0),
      });
    }
    return rows.sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
  }, [filteredOutliers]);

  const hasData = filteredOutliers.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.white }}>
      {/* Header */}
      <header className="px-6 py-4" style={{ background: COLORS.brand, color: COLORS.white }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-wide">Launch Tracker • Golf Launch Monitor Dashboard</h1>
          <div className="flex gap-2">
            <button onClick={loadSample} className="px-3 py-2 rounded-lg font-medium" style={{ background: COLORS.white, color: COLORS.brand }}>
              Load sample
            </button>
            <button onClick={() => exportCSV(filteredOutliers)} className="px-3 py-2 rounded-lg font-medium border" style={{ background: COLORS.white, color: COLORS.brand, borderColor: COLORS.white }}>
              Export CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.currentTarget.value = "";
              }}
              className="hidden"
            />
            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-lg font-medium border" style={{ background: COLORS.white, color: COLORS.brand, borderColor: COLORS.white }}>
              Import file
            </button>
          </div>
        </div>
      </header>

      {/* Import message */}
      {importMsg && (
        <div className="px-6">
          <div className="max-w-7xl mx-auto mt-4">
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: COLORS.blueSoft, color: COLORS.gray700, border: `1px solid ${COLORS.gray300}` }}>
              {importMsg}
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-12 gap-8">
        {/* Filters */}
        <aside className="col-span-12 lg:col-span-3">
          <Card title="Filters">
            {/* Session selector */}
            <div className="mb-5">
              <label className="text-sm font-medium block mb-2" style={{ color: COLORS.gray700 }}>Session</label>
              <select
                value={sessionFilter}
                onChange={(e) => setSessionFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: COLORS.gray300 }}
              >
                {sessions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Vertical Club selector */}
            <div className="mb-5">
              <label className="text-sm font-medium block mb-2" style={{ color: COLORS.gray700 }}>Clubs</label>
              <ClubList options={clubs} selected={selectedClubs} onChange={setSelectedClubs} palette={clubPalette} />
              <div className="mt-3 flex gap-2">
                <button className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: COLORS.gray300, color: COLORS.brand }} onClick={() => setSelectedClubs(clubs)} disabled={!clubs.length}>
                  Select all
                </button>
                <button className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: COLORS.gray300 }} onClick={() => setSelectedClubs([])} disabled={!selectedClubs.length}>
                  Clear
                </button>
              </div>
            </div>

            {/* Carry range */}
            <div className="mb-5">
              <label className="text-sm font-medium block mb-2" style={{ color: COLORS.gray700 }}>Carry Distance Range (yds)</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder={carryBounds.min ? String(carryBounds.min) : "min"} value={carryMin} onChange={(e) => setCarryMin(e.target.value)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: COLORS.gray300 }} />
                <input type="number" placeholder={carryBounds.max ? String(carryBounds.max) : "max"} value={carryMax} onChange={(e) => setCarryMax(e.target.value)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: COLORS.gray300 }} />
              </div>
              <div className="mt-2">
                <button onClick={() => { setCarryMin(""); setCarryMax(""); }} className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: COLORS.gray300 }}>
                  Reset range
                </button>
              </div>
            </div>

            {/* Outliers + Dates */}
            <div className="mb-4 flex items-center justify-between">
              <label className="text-sm font-medium" style={{ color: COLORS.gray700 }}>Exclude outliers (2.5σ)</label>
              <input type="checkbox" checked={excludeOutliers} onChange={(e) => setExcludeOutliers(e.target.checked)} />
            </div>

            <div className="mb-2">
              <label className="text-sm font-medium block" style={{ color: COLORS.gray700 }}>Date range</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-2 py-2 rounded-lg border text-sm" style={{ borderColor: COLORS.gray300 }} />
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-2 py-2 rounded-lg border text-sm" style={{ borderColor: COLORS.gray300 }} />
              </div>
              <div className="mt-2 flex gap-2">
                {[
                  { label: "Last 7d", days: 7 },
                  { label: "Last 30d", days: 30 },
                  { label: "Last 90d", days: 90 },
                ].map(({ label, days }) => (
                  <button key={label} className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: COLORS.gray300, color: COLORS.brand }}
                    onClick={() => {
                      const to = new Date();
                      const from = new Date();
                      from.setDate(to.getDate() - days + 1);
                      setDateFrom(from.toISOString().slice(0, 10));
                      setDateTo(to.toISOString().slice(0, 10));
                    }}>
                    {label}
                  </button>
                ))}
                <button className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: COLORS.gray300 }} onClick={() => { setDateFrom(""); setDateTo(""); }}>
                  Reset
                </button>
              </div>
            </div>
          </Card>
        </aside>

        {/* KPIs + Charts */}
        <section className="col-span-12 lg:col-span-9 space-y-8">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPI label="Avg Carry" value={fmtNum(kpis.avgCarry, 1, " yds")} color={COLORS.brand} />
            <KPI label="Avg Total" value={fmtNum(kpis.avgTotal, 1, " yds")} color={COLORS.brandTint} />
            <KPI label="Carry Consistency" value={fmtNum(kpis.sdCarry, 1, " sd")} color={COLORS.brand} />
            <KPI label="Avg Smash" value={fmtNum(kpis.avgSmash, 3, "")} color={COLORS.brandTint} />
            <KPI label="Avg Spin" value={fmtNum(kpis.avgSpin, 0, " rpm")} color={COLORS.brand} />
            <KPI label="Shots" value={String(kpis.shots ?? 0)} color={COLORS.gray700} />
          </div>

          {/* Shot shape (FULL WIDTH) */}
          <Card title="Shot Shape Distribution">
            {!hasData ? <EmptyChart /> : (
              <ShotShape draw={kpis.shape.draw} straight={kpis.shape.straight} fade={kpis.shape.fade} />
            )}
          </Card>

          {/* Dispersion (FULL WIDTH) */}
          <Card title="Dispersion — Driving Range View (50y to max)">
            {!hasData ? <EmptyChart /> : (
              <div style={{ width: "100%", height: 420 }}>
                <RangeDispersion shots={filteredOutliers} clubs={clubs} palette={clubPalette} />
              </div>
            )}
          </Card>

          {/* Gap chart */}
          <Card title="Gap Chart — Carry vs Total by Club">
            {!hasData ? <EmptyChart /> : (
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart data={tableRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="club" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="avgCarry" name="Carry (avg)" fill={CARRY_BAR} />
                    <Bar dataKey="avgTotal" name="Total (avg)" fill={TOTAL_BAR} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Efficiency */}
          <Card title="Efficiency — Club Speed vs Ball Speed">
            {!hasData ? <EmptyChart /> : (
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <ScatterChart>
                    <CartesianGrid />
                    <XAxis type="number" dataKey="ClubSpeed_mph" name="Club Speed" unit=" mph">
                      <Label value="Club Speed (mph)" position="insideBottom" offset={-5} />
                    </XAxis>
                    <YAxis type="number" dataKey="BallSpeed_mph" name="Ball Speed" unit=" mph">
                      <Label value="Ball Speed (mph)" angle={-90} position="insideLeft" />
                    </YAxis>
                    <Tooltip formatter={(v: any, n: any) => [v, n]} />
                    {clubs.map((c, i) => (
                      <Scatter key={c} name={c} data={filteredOutliers.filter(s => s.Club === c)} fill={clubPalette[i % clubPalette.length]} />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Launch vs Spin */}
          <Card title="Launch vs Spin — bubble size is Carry">
            {!hasData ? <EmptyChart /> : (
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <ScatterChart>
                    <CartesianGrid />
                    <XAxis type="number" dataKey="LaunchAngle_deg" name="Launch Angle" unit=" °">
                      <Label value="Launch Angle (°)" position="insideBottom" offset={-5} />
                    </XAxis>
                    <YAxis type="number" dataKey="SpinRate_rpm" name="Spin Rate" unit=" rpm">
                      <Label value="Spin Rate (rpm)" angle={-90} position="insideLeft" />
                    </YAxis>
                    <ZAxis type="number" dataKey="CarryDistance_yds" range={[30, 400]} />
                    <Tooltip formatter={(v: any, n: any) => [v, n]} />
                    {clubs.map((c, i) => (
                      <Scatter key={c} name={c} data={filteredOutliers.filter(s => s.Club === c)} fill={clubPalette[i % clubPalette.length]} />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Club Averages */}
          <Card title="Club Averages">
            {!hasData ? <EmptyChart /> : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <Th>Club</Th><Th>Shots</Th><Th>Avg Carry</Th><Th>Avg Total</Th><Th>Carry SD</Th>
                      <Th>Avg Smash</Th><Th>Avg Spin</Th><Th>Avg Club Spd</Th><Th>Avg Ball Spd</Th><Th>Avg Launch</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((r, idx) => (
                      <tr key={r.club} className="border-t">
                        <Td>
                          <span className="inline-flex items-center gap-2">
                            <span className="w-3 h-3 inline-block rounded-full" style={{ background: clubPalette[idx % clubPalette.length] }} />
                            {r.club}
                          </span>
                        </Td>
                        <Td>{r.count}</Td>
                        <Td>{r.avgCarry.toFixed(1)}</Td>
                        <Td>{r.avgTotal.toFixed(1)}</Td>
                        <Td>{r.sdCarry.toFixed(1)}</Td>
                        <Td>{r.avgSmash.toFixed(3)}</Td>
                        <Td>{Math.round(r.avgSpin)}</Td>
                        <Td>{r.avgCS.toFixed(1)}</Td>
                        <Td>{r.avgBS.toFixed(1)}</Td>
                        <Td>{r.avgLA.toFixed(1)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      </main>

      <footer className="px-6 py-8 text-xs text-center" style={{ color: COLORS.gray600 }}>
        Gap chart: Carry = blue, Total = green. Shot shape uses Spin Axis: Draw &lt; -2°, Straight within ±2°, Fade &gt; 2°. Data is saved locally in your browser.
      </footer>
    </div>
  );
}

/** ===== Range-style dispersion (SVG) ===== */
function RangeDispersion({ shots, clubs, palette }: { shots: Shot[]; clubs: string[]; palette: string[] }) {
  const lateralDev = (s: Shot): number | undefined => {
    if (s.CarryDeviationDistance_yds !== undefined) return s.CarryDeviationDistance_yds;
    if (s.LaunchDirection_deg !== undefined && s.CarryDistance_yds !== undefined) {
      const rad = (s.LaunchDirection_deg * Math.PI) / 180;
      return s.CarryDistance_yds * Math.sin(rad);
    }
    return undefined;
  };

  const pts = shots.map((s) => ({ club: s.Club, x: lateralDev(s), y: s.CarryDistance_yds }))
                   .filter((p) => p.x !== undefined && p.y !== undefined) as { club: string; x: number; y: number }[];

  const YMIN = 50;
  const yMaxData = pts.length ? Math.max(...pts.map((p) => p.y)) : 150;
  const nice = (v: number, step: number) => Math.ceil((v + step * 0.1) / step) * step;
  const YMAX = Math.max(100, nice(Math.max(YMIN, yMaxData), 25));

  const xMaxData = pts.length ? Math.max(...pts.map((p) => Math.abs(p.x))) : 25;
  const XMAX = Math.max(25, nice(xMaxData, 5));

  const W = 900, H = 420, PAD = 40;
  const xScale = (x: number) => PAD + ((x + XMAX) / (2 * XMAX)) * (W - 2 * PAD);
  const yScale = (y: number) => {
    const innerH = H - 2 * PAD;
    const clamped = Math.max(YMIN, Math.min(YMAX, y));
    return H - PAD - ((clamped - YMIN) / (YMAX - YMIN)) * innerH;
  };

  const byClub = new Map<string, { x: number; y: number }[]>();
  pts.forEach((p) => {
    if (!byClub.has(p.club)) byClub.set(p.club, []);
    byClub.get(p.club)!.push({ x: p.x, y: p.y });
  });

  const stripes = Array.from({ length: 12 }, (_, i) => i);
  const distTicks: number[] = [];
  for (let d = 50; d <= YMAX; d += 50) distTicks.push(d);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ background: COLORS.brandSoft, borderRadius: 12, border: `1px solid ${COLORS.gray300}` }}>
      {stripes.map((i) => (
        <rect key={i} x={0} y={(H / stripes.length) * i} width={W} height={H / stripes.length} fill={i % 2 === 0 ? "#E8F4EE" : "#F4FBF8"} opacity={0.9} />
      ))}

      <line x1={xScale(0)} y1={PAD - 10} x2={xScale(0)} y2={H - PAD + 10} stroke={COLORS.brand} strokeDasharray="6 6" strokeWidth={2} />

      {distTicks.map((d, idx) => (
        <g key={d}>
          <line x1={PAD} x2={W - PAD} y1={yScale(d)} y2={yScale(d)} stroke="#CFE6DA" strokeDasharray="4 8" />
          <Flag x={xScale(0)} y={yScale(d)} color={clubPalette[idx % clubPalette.length]} label={`${d}y`} />
        </g>
      ))}

      <text x={xScale(0) + 8} y={PAD - 16} fontSize={12} fill={COLORS.gray600}>Target line</text>
      <text x={PAD} y={H - 8} fontSize={11} fill={COLORS.gray600}>Left ←  Deviation (yds)  → Right</text>
      <text x={W - PAD - 110} y={PAD - 16} fontSize={11} fill={COLORS.gray600}>Range: {YMIN}–{YMAX} yds</text>

      {[...byClub.keys()].map((club, idx) => {
        const color = palette[idx % palette.length];
        const ptsC = byClub.get(club)!;
        return (
          <g key={club}>
            {ptsC.map((p, i) => (
              <circle key={i} cx={xScale(p.x)} cy={yScale(p.y)} r={4} fill={color} stroke="#fff" strokeWidth={1} opacity={0.95} />
            ))}
          </g>
        );
      })}

      <rect x={PAD} y={PAD - 28} width={Math.min(780, 18 * clubs.length + 200)} height={22} rx={6} ry={6} fill={COLORS.white} opacity={0.9} stroke={COLORS.gray300} />
      {clubs.map((c, i) => (
        <g key={c} transform={`translate(${PAD + 10 + i * 80}, ${PAD - 14})`}>
          <rect width="10" height="10" fill={clubPalette[i % clubPalette.length]} rx="2" ry="2" />
          <text x="14" y="9" fontSize="12" fill={COLORS.gray600}>{c}</text>
        </g>
      ))}
    </svg>
  );
}

function Flag({ x, y, color, label }: { x: number; y: number; color: string; label: string }) {
  const poleH = 22, flagW = 16, flagH = 10;
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - poleH} stroke="#7A7A7A" strokeWidth={2} />
      <polygon points={`${x},${y - poleH} ${x + flagW},${y - poleH + flagH / 2} ${x},${y - poleH + flagH}`} fill={color} stroke="#333" strokeWidth={0.5} />
      <text x={x + flagW + 6} y={y - poleH + flagH / 1.2} fontSize={11} fill="#333">{label}</text>
    </g>
  );
}

/** ===== Shot Shape component ===== */
function ShotShape({ draw, straight, fade }: { draw: { n: number; pct: number }; straight: { n: number; pct: number }; fade: { n: number; pct: number } }) {
  const Box = ({ title, pct, n, bg, color }: { title: string; pct: number; n: number; bg: string; color: string }) => (
    <div className="rounded-2xl px-6 py-6" style={{ background: bg }}>
      <div className="text-2xl font-semibold" style={{ color }}>{pct.toFixed(1)}%</div>
      <div className="mt-1 text-sm" style={{ color: COLORS.gray700 }}>{title}</div>
      <div className="text-xs" style={{ color: COLORS.gray600 }}>{n} shots</div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Box title="Draw" pct={draw.pct} n={draw.n} bg={COLORS.blueSoft} color="#2463EB" />
      <Box title="Straight" pct={straight.pct} n={straight.n} bg={COLORS.greenSoft} color={COLORS.brand} />
      <Box title="Fade" pct={fade.pct} n={fade.n} bg={COLORS.orangeSoft} color="#D97706" />
    </div>
  );
}

/** ===== UI PRIMITIVES ===== */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 shadow" style={{ background: COLORS.white, border: `1px solid ${COLORS.gray300}` }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold tracking-wide" style={{ color: COLORS.brand }}>{title}</h2>
        <div className="h-1 rounded-full w-24" style={{ background: `linear-gradient(90deg, ${COLORS.brand}, ${COLORS.brandTint})` }} />
      </div>
      {children}
    </div>
  );
}
function KPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl p-3 shadow text-sm" style={{ background: COLORS.white, border: `1px solid ${COLORS.gray300}` }}>
      <div className="text-slate-500" style={{ color: COLORS.gray600 }}>{label}</div>
      <div className="mt-1 text-lg font-semibold" style={{ color }}>{value || "-"}</div>
    </div>
  );
}
function ClubList({ options, selected, onChange, palette }: { options: string[]; selected: string[]; onChange: (v: string[]) => void; palette: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt, i) => {
        const active = selected.includes(opt);
        const color = palette[i % palette.length];
        return (
          <label key={opt} className="flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer" style={{ borderColor: active ? color : COLORS.gray300, background: active ? "#FAFAFA" : COLORS.white }}>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 inline-block rounded-full" style={{ background: color }} />
              <span className="text-sm" style={{ color: COLORS.gray700 }}>{opt}</span>
            </div>
            <input type="checkbox" checked={active} onChange={() => onChange(active ? selected.filter(s => s !== opt) : [...selected, opt])} />
          </label>
        );
      })}
    </div>
  );
}
function EmptyChart() { return <div style={{ padding: 16, color: COLORS.gray600 }}>No shots in this range.</div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="py-2 pr-4" style={{ color: COLORS.gray700 }}>{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="py-2 pr-4">{children}</td>; }

/** ===== HELPERS ===== */
function fmtNum(v: number | undefined, fixed: number, suffix: string) {
  return v === undefined ? "-" : `${v.toFixed(fixed)}${suffix}`;
}
function toCSV(rows: Record<string, any>[]) {
  if (!rows.length) return "";
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))];
  return lines.join("\n");
}
function exportCSV(rows: Record<string, any>[]) {
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "launch-tracker_filtered.csv";
  a.click();
  URL.revokeObjectURL(url);
}
