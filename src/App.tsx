import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Scatter, ScatterChart, ZAxis, Label, ComposedChart, ReferenceLine 
} from "recharts";
import * as XLSX from "xlsx";

/** ================= THEME ================= */
type Theme = {
  brand: string; brandTint: string; brandSoft: string; white: string;
  text: string; textDim: string; border: string; panel: string;
  blueSoft: string; greenSoft: string; orangeSoft: string;
  kpiBorder: string; gridStripeA: string; gridStripeB: string;
};

const LIGHT: Theme = {
  brand: "#006747",
  brandTint: "#2F8C76",
  brandSoft: "#ECF8F1",
  white: "#ffffff",
  text: "#0f172a",
  textDim: "#475569",
  border: "#E5E7EB",
  panel: "#ffffff",
  blueSoft: "#EEF5FF",
  greenSoft: "#EDFDF3",
  orangeSoft: "#FFF6EC",
  kpiBorder: "#E5E7EB",
  gridStripeA: "#E8F4EE",
  gridStripeB: "#F4FBF8",
};

const DARK: Theme = {
  brand: "#25B07C",
  brandTint: "#43C593",
  brandSoft: "#0F1B17",
  white: "#0B0F14",
  text: "#E6EDF3",
  textDim: "#93A1B3",
  border: "#2B3542",
  panel: "#111827",
  blueSoft: "#0E223B",
  greenSoft: "#0F2420",
  orangeSoft: "#2A1909",
  kpiBorder: "#2B3542",
  gridStripeA: "#0E1915",
  gridStripeB: "#0A1411",
};

// Per-club palette (distinct, stable)
const clubPalette = [
  "#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD", "#8C564B",
  "#E377C2", "#17BECF", "#7F7F7F", "#BCBD22", "#AEC7E8", "#FFBB78",
];

// Gap chart uses ONLY these two:
const CARRY_BAR = "#1F77B4"; // blue

/** ================= TYPES ================= */
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

type Msg = { id: number; text: string; type?: "info" | "success" | "warn" | "error" };
type ViewKey = "dashboard" | "insights" | "journal";

/** ================= STATS & HELPERS ================= */
const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
const stddev = (arr: number[]) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = mean(arr.map(x => (x - m) ** 2));
  return Math.sqrt(v);
};
const quantile = (arr: number[], p: number) => {
  if (!arr.length) return NaN;
  const a = [...arr].sort((x, y) => x - y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  const h = idx - lo;
  return a[lo] * (1 - h) + a[hi] * h;
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

// Club display order
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

/** Robust header normalization (with CamelCase split) */
function normalizeHeader(raw: string): string {
  let s = String(raw || "").trim();
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2"); // CamelCase -> spaced
  s = s.toLowerCase();
  s = s.replace(/\[[^\]]*\]/g, "").replace(/\([^\)]*\)/g, "");
  s = s.replace(/[_\-]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/:$/, "");
  s = s.replace(/\bsmash\s*factor\b/, "smash factor");
  return s;
}

/** Header -> Shot key map (after normalization) */
const headerMap: Record<string, keyof Shot> = {
  "club": "Club",
  "club type": "Club",
  "clubname": "Club",
  "club name": "Club",
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
  "carry": "CarryDistance_yds",
  "carry deviation angle": "CarryDeviationAngle_deg",
  "carry deviation distance": "CarryDeviationDistance_yds",

  "total distance": "TotalDistance_yds",
  "total": "TotalDistance_yds",
  "total deviation angle": "TotalDeviationAngle_deg",
  "total deviation distance": "TotalDeviationDistance_yds",

  "sessionid": "SessionId",
  "session id": "SessionId",
  "timestamp": "Timestamp",
  "date": "Timestamp",
  "datetime": "Timestamp",
};

/** Find best header row (supports two-row header+units) */
function findBestHeader(rowsRaw: any[][]) {
  const MAX_SCAN = Math.min(20, rowsRaw.length);
  let best = { idx: 0, map: [] as (keyof Shot | undefined)[], score: 0, usedTwoRows: false };
  const scoreMap = (hdr: any[]) => {
    const mapped = hdr.map((h) => headerMap[normalizeHeader(String(h ?? ""))]);
    const score = mapped.filter(Boolean).length + (mapped.includes("Club" as keyof Shot) ? 2 : 0);
    return { mapped, score };
  };
  for (let i = 0; i < MAX_SCAN; i++) {
    const row = rowsRaw[i] || [];
    const s1 = scoreMap(row);
    if (s1.score > best.score) best = { idx: i, map: s1.mapped, score: s1.score, usedTwoRows: false };
    if (i + 1 < rowsRaw.length) {
      const row2 = rowsRaw[i + 1] || [];
      const combined = row.map((v: any, c: number) => [v, row2[c]].filter(Boolean).join(" "));
      const s2 = scoreMap(combined);
      if (s2.score > best.score) best = { idx: i, map: s2.mapped, score: s2.score, usedTwoRows: true };
    }
  }
  return best;
}

/** ===== Fallback parser for "weird CSV" ===== */
function parseWeirdLaunchCSV(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return null;
  const split = (line: string) => line.replace(/\t/g, "").replace(/"/g, "").trim().split(",");
  const header = split(lines[0]).map((h) => h.trim());
  const unitsLooksLike = (s: string) => /\[[^\]]*\]/.test(s);
  const maybeUnits = lines[1] ? split(lines[1]) : [];
  const hasUnits = maybeUnits.some(unitsLooksLike);
  const dataRows = lines.slice(hasUnits ? 2 : 1).map(split);
  const hasClub = header.includes("ClubType") || header.includes("Club Name") || header.includes("ClubName");
  if (!hasClub) return null;
  return { header, dataRows };
}

function weirdRowsToShots(header: string[], rows: string[][], fallbackSessionId: string): Shot[] {
  const norm = (s: string) => normalizeHeader(s);
  const find = (aliases: string[]) => {
    const wants = aliases.map(norm);
    for (let i = 0; i < header.length; i++) {
      if (wants.includes(norm(header[i] || ""))) return i;
    }
    return -1;
  };
  const id = {
    Date: find(["date", "timestamp", "datetime"]),
    ClubName: find(["club name", "clubname"]),
    ClubType: find(["club type", "club"]),
    ClubSpeed: find(["club speed"]),
    AttackAngle: find(["attack angle"]),
    ClubPath: find(["club path"]),
    ClubFace: find(["club face"]),
    FaceToPath: find(["face to path"]),
    BallSpeed: find(["ball speed"]),
    Smash: find(["smash factor", "smash"]),
    LaunchAngle: find(["launch angle"]),
    LaunchDir: find(["launch direction"]),
    Backspin: find(["backspin"]),
    Sidespin: find(["sidespin"]),
    SpinRate: find(["spin rate"]),
    SpinRateType: find(["spin rate type"]),
    SpinAxis: find(["spin axis"]),
    Apex: find(["apex height"]),
    Carry: find(["carry distance", "carry"]),
    CarryDevAng: find(["carry deviation angle"]),
    CarryDevDist: find(["carry deviation distance"]),
    Total: find(["total distance", "total"]),
    TotalDevAng: find(["total deviation angle"]),
    TotalDevDist: find(["total deviation distance"]),
  };
  const num = (v: any) => {
    if (v === null || v === undefined) return undefined;
    const s = String(v).trim();
    if (!s || s.toUpperCase() === "#DIV/0!" || s.toUpperCase() === "NAN") return undefined;
    const x = Number(s.replace(/,/g, ""));
    return isNaN(x) ? undefined : x;
  };
  const parseWeirdTimestamp = (v: string | undefined) => {
    if (!v) return undefined;
    const s = String(v).trim();
    const m = s.match(/^(\d{1,2}\/\d{1,2}\/\d{4})(\d{1,2}:\d{2}:\d{2})(AM|PM)$/i);
    if (m) {
      const str = `${m[1]} ${m[2]} ${m[3].toUpperCase()}`;
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    const d2 = new Date(s);
    return isNaN(d2.getTime()) ? undefined : d2.toISOString();
  };
  const shots: Shot[] = [];
  for (const row of rows) {
    const rawType = id.ClubType >= 0 ? row[id.ClubType] : "";
    const rawName = id.ClubName >= 0 ? row[id.ClubName] : "";
    let club = (rawType || "").trim();
    const nm = (rawName || "").trim();
    if (!club && nm) club = nm;
    else if (club && nm && !club.toLowerCase().includes(nm.toLowerCase())) club = `${nm} ${club}`.trim();
    if (!club) continue;
    const shot: Shot = {
      SessionId: fallbackSessionId,
      Club: club,
      Timestamp: id.Date >= 0 ? parseWeirdTimestamp(row[id.Date]) : undefined,
      ClubSpeed_mph: id.ClubSpeed >= 0 ? num(row[id.ClubSpeed]) : undefined,
      AttackAngle_deg: id.AttackAngle >= 0 ? num(row[id.AttackAngle]) : undefined,
      ClubPath_deg: id.ClubPath >= 0 ? num(row[id.ClubPath]) : undefined,
      ClubFace_deg: id.ClubFace >= 0 ? num(row[id.ClubFace]) : undefined,
      FaceToPath_deg: id.FaceToPath >= 0 ? num(row[id.FaceToPath]) : undefined,
      BallSpeed_mph: id.BallSpeed >= 0 ? num(row[id.BallSpeed]) : undefined,
      SmashFactor: id.Smash >= 0 ? num(row[id.Smash]) : undefined,
      LaunchAngle_deg: id.LaunchAngle >= 0 ? num(row[id.LaunchAngle]) : undefined,
      LaunchDirection_deg: id.LaunchDir >= 0 ? num(row[id.LaunchDir]) : undefined,
      Backspin_rpm: id.Backspin >= 0 ? num(row[id.Backspin]) : undefined,
      Sidespin_rpm: id.Sidespin >= 0 ? num(row[id.Sidespin]) : undefined,
      SpinRate_rpm: id.SpinRate >= 0 ? num(row[id.SpinRate]) : undefined,
      SpinRateType: id.SpinRateType >= 0 ? String(row[id.SpinRateType] ?? "").trim() : undefined,
      SpinAxis_deg: id.SpinAxis >= 0 ? num(row[id.SpinAxis]) : undefined,
      ApexHeight_yds: id.Apex >= 0 ? num(row[id.Apex]) : undefined,
      CarryDistance_yds: id.Carry >= 0 ? num(row[id.Carry]) : undefined,
      CarryDeviationAngle_deg: id.CarryDevAng >= 0 ? num(row[id.CarryDevAng]) : undefined,
      CarryDeviationDistance_yds: id.CarryDevDist >= 0 ? num(row[id.CarryDevDist]) : undefined,
      TotalDistance_yds: id.Total >= 0 ? num(row[id.Total]) : undefined,
      TotalDeviationAngle_deg: id.TotalDevAng >= 0 ? num(row[id.TotalDevAng]) : undefined,
      TotalDeviationDistance_yds: id.TotalDevDist >= 0 ? num(row[id.TotalDevDist]) : undefined,
    };
    shots.push(shot);
  }
  return shots;
}

/** ===== Fingerprint for duplicate detection ===== */
function fpOf(s: Shot): string {
  const r = (x?: number, d = 2) => (x == null ? "" : Number(x).toFixed(d));
  const t = s.Timestamp ? new Date(s.Timestamp).getTime() : "";
  return [
    s.Club?.toLowerCase().trim(),
    r(s.CarryDistance_yds, 1),
    r(s.TotalDistance_yds, 1),
    r(s.BallSpeed_mph, 1),
    r(s.ClubSpeed_mph, 1),
    r(s.LaunchAngle_deg, 1),
    r(s.SpinRate_rpm, 0),
    r(s.LaunchDirection_deg, 1),
    r(s.ApexHeight_yds, 1),
    t
  ].join("|");
}

/** ===== Stable color for a club ===== */
function colorForClub(club: string, clubsAll: string[], palette: string[]) {
  const idx = clubsAll.findIndex(c => c.toLowerCase() === club.toLowerCase());
  if (idx >= 0) return palette[idx % palette.length];
  let h = 0;
  for (let i = 0; i < club.length; i++) h = (h * 31 + club.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/** ================= APP ================= */
export default function App() {
  // THEME
  const [dark, setDark] = useState<boolean>(() => {
    try { return localStorage.getItem("launch-tracker:theme") === "dark"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:theme", dark ? "dark" : "light"); } catch {} }, [dark]);
  const T = dark ? DARK : LIGHT;

  // VIEW (Dashboard / Insights / Journal)
  const [view, setView] = useState<ViewKey>(() => {
    try { return (localStorage.getItem("launch-tracker:view") as ViewKey) || "dashboard"; } catch { return "dashboard"; }
  });
  useEffect(() => { try { localStorage.setItem("launch-tracker:view", view); } catch {} }, [view]);

  // DATA + UI state
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
    try {
      const raw = localStorage.getItem("launch-tracker:card-order");
      return raw ? JSON.parse(raw) : ["kpis", "shape", "dispersion", "gap", "eff", "launchspin", "table"];
    } catch { return ["kpis", "shape", "dispersion", "gap", "eff", "launchspin", "table"]; }
  });

  // Insights re-ordering
  const [insightsOrder, setInsightsOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:insights-order");
      return raw ? JSON.parse(raw) : ["distanceBox", "highlights", "warnings"];
    } catch { return ["distanceBox", "highlights", "warnings"]; }
  });
  useEffect(() => {
    try { localStorage.setItem("launch-tracker:insights-order", JSON.stringify(insightsOrder)); } catch {}
  }, [insightsOrder]);

  const [sessionNotes, setSessionNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("launch-tracker:session-notes") || "{}"); } catch { return {}; }
  });

  // Journal
  const journalKey = sessionFilter === "ALL" ? "GLOBAL" : (sessionFilter || "Unknown Session");
  const [journalHTML, setJournalHTML] = useState<string>(() => {
    try { return localStorage.getItem(`launch-tracker:journal:${journalKey}`) || ""; } catch { return ""; }
  });
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { setJournalHTML(localStorage.getItem(`launch-tracker:journal:${journalKey}`) || ""); } catch {}
  }, [journalKey]);
  useEffect(() => {
    try { localStorage.setItem(`launch-tracker:journal:${journalKey}`, journalHTML); } catch {}
  }, [journalKey, journalHTML]);

  // Measure Filters card height (for Journal default height)
  const filtersRef = useRef<HTMLDivElement>(null);
  const [filtersHeight, setFiltersHeight] = useState<number>(420);
  useEffect(() => {
    const el = filtersRef.current;
    if (!el) return;
    const update = () => setFiltersHeight(el.getBoundingClientRect().height || 420);
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    window.addEventListener("resize", update);
    update();
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragKeyRef = useRef<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("launch-tracker:shots");
      if (raw) setShots(JSON.parse(raw));
    } catch {}
  }, []);
  // Persist to localStorage
  useEffect(() => {
    try { localStorage.setItem("launch-tracker:shots", JSON.stringify(shots)); } catch {}
  }, [shots]);
  useEffect(() => {
    try { localStorage.setItem("launch-tracker:card-order", JSON.stringify(cardOrder)); } catch {}
  }, [cardOrder]);
  useEffect(() => {
    try { localStorage.setItem("launch-tracker:session-notes", JSON.stringify(sessionNotes)); } catch {}
  }, [sessionNotes]);

  // Messages with auto-dismiss
  const pushMsg = (text: string, type: Msg["type"] = "info") => {
    const id = Date.now() + Math.random();
    setMsgs((prev) => [...prev, { id, text, type }]);
    window.setTimeout(() => setMsgs((prev) => prev.filter(m => m.id !== id)), 15000);
  };
  const closeMsg = (id: number) => setMsgs((prev) => prev.filter(m => m.id !== id));

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

  // Built-in tiny sample fallback
  const builtinSample = () => {
    const id = `Sample ${new Date().toLocaleString()}`;
    return [
      { SessionId: id, Club: "Driver", ClubSpeed_mph: 85.1, BallSpeed_mph: 119.8, SmashFactor: 1.41, LaunchAngle_deg: 12.9, Backspin_rpm: 3465, CarryDistance_yds: 176, TotalDistance_yds: 193, SpinAxis_deg: -1.7, Timestamp: "2025-08-08T12:00:00Z" },
      { SessionId: id, Club: "4 Hybrid", ClubSpeed_mph: 80.1, BallSpeed_mph: 105.4, SmashFactor: 1.32, LaunchAngle_deg: 12.4, Backspin_rpm: 3391, CarryDistance_yds: 139, TotalDistance_yds: 161, SpinAxis_deg: -2.9, Timestamp: "2025-08-08T12:05:00Z" },
      { SessionId: id, Club: "5 Hybrid (5 Iron)", ClubSpeed_mph: 78.7, BallSpeed_mph: 99.3, SmashFactor: 1.26, LaunchAngle_deg: 11.8, Backspin_rpm: 3932, CarryDistance_yds: 120, TotalDistance_yds: 143, SpinAxis_deg: -7.7, Timestamp: "2025-08-08T12:08:00Z" },
      { SessionId: id, Club: "6 Iron", ClubSpeed_mph: 74.3, BallSpeed_mph: 94.8, SmashFactor: 1.27, LaunchAngle_deg: 14.6, Backspin_rpm: 3771, CarryDistance_yds: 115, TotalDistance_yds: 133, SpinAxis_deg: -0.2, Timestamp: "2025-08-08T12:11:00Z" },
      { SessionId: id, Club: "7 Iron", ClubSpeed_mph: 72.5, BallSpeed_mph: 90.0, SmashFactor: 1.24, LaunchAngle_deg: 13.9, Backspin_rpm: 4463, CarryDistance_yds: 103, TotalDistance_yds: 121, SpinAxis_deg: 1.1, Timestamp: "2025-08-08T12:14:00Z" },
      { SessionId: id, Club: "8 Iron", ClubSpeed_mph: 70.7, BallSpeed_mph: 85.3, SmashFactor: 1.20, LaunchAngle_deg: 17.5, Backspin_rpm: 4426, CarryDistance_yds: 100, TotalDistance_yds: 114, SpinAxis_deg: 0.1, Timestamp: "2025-08-08T12:17:00Z" },
      { SessionId: id, Club: "9 Iron", ClubSpeed_mph: 68.9, BallSpeed_mph: 83.8, SmashFactor: 1.22, LaunchAngle_deg: 19.8, Backspin_rpm: 4446, CarryDistance_yds: 93,  TotalDistance_yds: 110, SpinAxis_deg: 0.7, Timestamp: "2025-08-08T12:20:00Z" },
      { SessionId: id, Club: "Pitching Wedge", ClubSpeed_mph: 69.5, BallSpeed_mph: 84.1, SmashFactor: 1.21, LaunchAngle_deg: 20.1, Backspin_rpm: 5760, CarryDistance_yds: 99,  TotalDistance_yds: 109, SpinAxis_deg: 0.3, Timestamp: "2025-08-08T12:23:00Z" },
      { SessionId: id, Club: "60 (LW)", ClubSpeed_mph: 64.1, BallSpeed_mph: 63.4, SmashFactor: 0.99, LaunchAngle_deg: 27.6, Backspin_rpm: 5975, CarryDistance_yds: 60,  TotalDistance_yds: 70,  SpinAxis_deg: 4.9, Timestamp: "2025-08-08T12:26:00Z" },
    ].map(applyDerived);
  };

  // ===== Import core =====
  const processWorkbook = (wb: XLSX.WorkBook, textFromCSV: string | null, filename: string) => {
    const firstSheet = wb.SheetNames.find(n => {
      const ws = wb.Sheets[n];
      const rr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
      return rr && rr.flat().some(v => v !== null && v !== "");
    }) || wb.SheetNames[0];

    const ws = wb.Sheets[firstSheet];
    const rowsRaw: any[][] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true, header: 1 }) as any[][];
    if (!rowsRaw.length) { pushMsg("The sheet seems empty.", "warn"); return; }

    const best = findBestHeader(rowsRaw);
    const headerRow = rowsRaw[best.idx] || [];
    const nextRow   = rowsRaw[best.idx + 1] || [];
    const effectiveHeader = best.usedTwoRows
      ? headerRow.map((v, i) => [v, nextRow[i]].filter(Boolean).join(" "))
      : headerRow;

    const hdrNorms = effectiveHeader.map((h) => normalizeHeader(String(h ?? "")));
    const normIndex: (keyof Shot | undefined)[] = hdrNorms.map((key) => headerMap[key]);

    // Find/guess Club column
    let clubIdx = normIndex.findIndex((k) => k === "Club");
    if (clubIdx === -1) {
      const clubHeaderSyns = ["club", "club name", "club type", "club model", "club used", "club selection", "club id", "club #", "club number"];
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
        rowArr.forEach((cell: any, i: number) => {
          const mk = normIndex[i];
          if (!mk) return;
          obj[mk] = cell;
        });
        if (!obj.Club) continue;

        const shot: any = {};
        Object.keys(obj).forEach((k) => {
          const mk = k as keyof Shot;
          const v = obj[mk];
          if (mk === "Timestamp") shot[mk] = isoDate(v);
          else if (mk === "SpinRateType" || mk === "Club" || mk === "SessionId") {
            const val = String(v ?? "").trim(); if (val) shot[mk] = val;
          } else if (mk === "Swings") {
            const val = n(v); if (val !== undefined) shot[mk] = Math.round(val);
          } else {
            const val = n(v); if (val !== undefined) shot[mk] = val;
          }
        });

        if (!shot.SessionId) shot.SessionId = fallbackId;
        mapped.push(applyDerived(shot as Shot));
      }
    }

    const matchedCols = normIndex.filter(Boolean).length;
    const carryCountNormal = mapped.filter(s => s.CarryDistance_yds != null).length;
    const weakMapping = matchedCols < 6 || carryCountNormal < Math.max(3, Math.floor(mapped.length * 0.25));

    // Fallback parser if needed
    let finalShots: Shot[] = mapped;
    let usedFallback = false;

    if (textFromCSV && (weakMapping || mapped.length === 0)) {
      const weird = parseWeirdLaunchCSV(textFromCSV);
      if (weird) {
        const ws2 = weirdRowsToShots(weird.header, weird.dataRows as any, fallbackId).map(applyDerived);
        const carryCountWeird = ws2.filter(s => s.CarryDistance_yds != null).length;
        const preferFallback = carryCountWeird > carryCountNormal || (ws2.length && mapped.length === 0);
        if (preferFallback) {
          finalShots = ws2;
          usedFallback = true;
        }
      }
    }

    // De-dupe
    const existing = new Set(shots.map(fpOf));
    const seen = new Set<string>();
    const deduped: Shot[] = [];
    let dupCount = 0;

    for (const s of finalShots) {
      const key = fpOf(s);
      if (existing.has(key) || seen.has(key)) { dupCount++; continue; }
      seen.add(key);
      deduped.push(s);
    }

    if (deduped.length) setShots(prev => [...prev, ...deduped]);

    if (usedFallback) {
      pushMsg(
        `Imported ${deduped.length}/${finalShots.length} rows from "${filename}" via fallback parser. ${dupCount} duplicates skipped.`,
        "success"
      );
    } else if (finalShots.length) {
      pushMsg(
        `Imported ${deduped.length}/${finalShots.length} rows from "${filename}". Matched ${matchedCols} columns${best.usedTwoRows ? " (two-row header detected)" : ""}. ${dupCount} duplicates skipped.`,
        "success"
      );
    } else {
      pushMsg(`I couldn’t find usable rows. Include "ClubType/Club Name" and "Carry"/"Carry Distance" in the export.`, "warn");
    }
  };

  // File input handler
  const onFile = async (file: File) => {
    let wb: XLSX.WorkBook | null = null;
    let textFromCSV: string | null = null;

    try {
      const isCSV =
        /\.csv$/i.test(file.name) ||
        file.type === "text/csv" ||
        file.type === "application/vnd.ms-excel";

      if (isCSV) {
        textFromCSV = await file.text();
        const firstLine = (textFromCSV.split(/\r?\n/)[0] || "");
        const count = (ch: string) => (firstLine.match(new RegExp(ch, "g")) || []).length;
        const FS = count("\t") >= count(";") && count("\t") >= count(",") ? "\t" : (count(";") > count(",") ? ";" : ",");
        wb = XLSX.read(textFromCSV, { type: "string", FS });
      } else {
        const buf = await file.arrayBuffer();
        wb = XLSX.read(buf, { type: "array" });
      }
    } catch (err) {
      console.error(err);
      pushMsg("Sorry, I couldn't read that file. Is it a CSV/XLSX/XLS export?", "error");
      return;
    }

    processWorkbook(wb!, textFromCSV, file.name);
  };

  // Load sample from /public/sampledata.csv, else fallback
  const loadSample = async () => {
    try {
      const resp = await fetch("./sampledata.csv", { cache: "no-store" });
      if (!resp.ok) throw new Error("sampledata.csv not found");
      const text = await resp.text();
      const wb = XLSX.read(text, { type: "string" });
      processWorkbook(wb, text, "sampledata.csv");
    } catch {
      const sample = builtinSample();
      const existing = new Set(shots.map(fpOf));
      const deduped = sample.filter(s => !existing.has(fpOf(s)));
      setShots(prev => [...prev, ...deduped]);
      pushMsg(`Loaded built-in sample (${deduped.length}/${sample.length} new; ${sample.length - deduped.length} duplicates skipped).`, "success");
    }
  };

  /** Derived/cleanup on import */
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

  /** Outlier filter */
  const filteredOutliers = useMemo(() => {
    if (!excludeOutliers) return filtered;

    const getSmash = (s: Shot) =>
      s.SmashFactor ?? (s.ClubSpeed_mph && s.BallSpeed_mph ? s.BallSpeed_mph / s.ClubSpeed_mph : undefined);

    const carryVals = filtered.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
    const smashVals = filtered.map(getSmash).filter((x): x is number => x != null);

    const haveCarryStats = carryVals.length >= 5;
    const haveSmashStats = smashVals.length >= 5;

    const cm = haveCarryStats ? mean(carryVals) : 0;
    const cs = haveCarryStats ? stddev(carryVals) : 0;
    const sm = haveSmashStats ? mean(smashVals) : 0;
    const ss = haveSmashStats ? stddev(smashVals) : 0;

    return filtered.filter(s => {
      let ok = true;
      if (haveCarryStats && s.CarryDistance_yds != null) {
        ok = ok && s.CarryDistance_yds >= cm - 2.5 * cs && s.CarryDistance_yds <= cm + 2.5 * cs;
      }
      if (haveSmashStats) {
        const sv = getSmash(s);
        if (sv != null) ok = ok && sv >= sm - 2.5 * ss && sv <= sm + 2.5 * ss;
      }
      return ok;
    });
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
        draw: { n: draw, pct: shotsN ? (draw / shotsN) * 100 : 0 },
        straight: { n: straight, pct: shotsN ? (straight / shotsN) * 100 : 0 },
        fade: { n: fade, pct: shotsN ? (fade / shotsN) * 100 : 0 },
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

  /** Delete a session / all */
  const deleteSession = () => {
    if (sessionFilter === "ALL") return;
    const name = sessionFilter;
    const count = shots.filter(s => (s.SessionId ?? "Unknown Session") === name).length;
    if (!count) { pushMsg(`No shots found for session "${name}".`, "warn"); return; }
    const ok = window.confirm(`Delete session "${name}" and its ${count} shots? This cannot be undone.`);
    if (!ok) return;
    setShots(prev => prev.filter(s => (s.SessionId ?? "Unknown Session") !== name));
    setSelectedClubs([]);
    setSessionFilter("ALL");
    pushMsg(`Deleted session "${name}" (${count} shots).`, "success");
  };
  const deleteAll = () => {
    const ok = window.confirm("Delete ALL imported data? This cannot be undone.");
    if (!ok) return;
    setShots([]);
    setSelectedClubs([]);
    setSessionFilter("ALL");
    try { localStorage.removeItem("launch-tracker:shots"); } catch {}
    pushMsg("All data deleted.", "success");
  };

  // DnD helpers
  const onDragStart = (key: string) => (e: React.DragEvent) => { dragKeyRef.current = key; e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (key: string) => (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = (key: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragKeyRef.current; dragKeyRef.current = null;
    if (!from || from === key) return;
    setCardOrder((prev) => {
      const arr = prev.slice();
      const i = arr.indexOf(from), j = arr.indexOf(key);
      if (i === -1 || j === -1) return prev;
      arr.splice(j, 0, ...arr.splice(i, 1));
      return arr;
    });
  };

  // Insights DnD
  const onDragStartInsight = (k: string) => (e: React.DragEvent) => { dragKeyRef.current = k; e.dataTransfer.effectAllowed = "move"; };
  const onDragOverInsight  = (k: string) => (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDropInsight      = (k: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragKeyRef.current; dragKeyRef.current = null;
    if (!from || from === k) return;
    setInsightsOrder((prev) => {
      const arr = prev.slice();
      const i = arr.indexOf(from), j = arr.indexOf(k);
      if (i === -1 || j === -1) return prev;
      arr.splice(j, 0, ...arr.splice(i, 1));
      return arr;
    });
  };

  // Session notes helpers
  const selectedSessionKey = sessionFilter === "ALL" ? "" : (sessionFilter || "Unknown Session");
  const sessionNote = selectedSessionKey ? (sessionNotes[selectedSessionKey] || "") : "";
  const saveSessionNote = (val: string) => {
    if (!selectedSessionKey) return;
    setSessionNotes(prev => ({ ...prev, [selectedSessionKey]: val }));
  };

  return (
    <div style={{ minHeight: "100vh", background: T.white }}>
      {/* Header */}
      <header className="px-6 py-4" style={{ background: T.brand, color: "#fff" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-wide">Launch Tracker</h1>

          <div className="flex items-center gap-2">
            <TopTab theme={T} label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} />
            <TopTab theme={T} label="Insights" active={view === "insights"} onClick={() => setView("insights")} />
            <TopTab theme={T} label="Journal" active={view === "journal"} onClick={() => setView("journal")} />

            {/* Theme toggle (icon) */}
            <button
              onClick={() => setDark(!dark)}
              className="ml-3 p-2 rounded-lg border"
              style={{ background: "#ffffff10", borderColor: "#ffffff55" }}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
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
                   style={{ background: m.type === "error" ? "#FDECEC" : m.type === "success" ? T.greenSoft : m.type === "warn" ? T.orangeSoft : T.blueSoft, color: T.text, border: `1px solid ${T.border}` }}>
                <div style={{ whiteSpace: "pre-line" }}>{m.text}</div>
                <button onClick={() => closeMsg(m.id)} className="ml-4 px-2 py-1 text-xs rounded border" style={{ borderColor: T.border, color: T.textDim }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-12 gap-8">
        {/* LEFT: Filters + Session Notes */}
        <aside className="col-span-12 lg:col-span-3 space-y-8">
          {/* Filters */}
          <div ref={filtersRef}>
            <Card theme={T} title="Filters">
              {/* Import */}
              <div className="mb-4">
                <label className="text-sm font-medium block mb-2" style={{ color: T.text }}>Import</label>
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
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: T.brand, color: "#fff", border: `1px solid ${T.brand}` }}
                >
                  Import file
                </button>
              </div>

              {/* Session selector */}
              <div className="mb-3">
                <label className="text-sm font-medium block mb-2" style={{ color: T.text }}>Session</label>
                <div className="flex gap-2">
                  <select
                    value={sessionFilter}
                    onChange={(e) => setSessionFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: T.border, background: T.panel, color: T.text }}
                  >
                    {sessions.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    className="px-3 py-2 rounded-lg text-sm border"
                    style={{ borderColor: T.border, color: "#B91C1C", background: T.panel }}
                    onClick={deleteSession}
                    disabled={sessionFilter === "ALL"}
                    title="Delete selected session"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Clubs */}
              <div className="mb-5">
                <label className="text-sm font-medium block mb-2" style={{ color: T.text }}>Clubs</label>
                <ClubList theme={T} options={clubs} selected={selectedClubs} onChange={setSelectedClubs} palette={clubPalette} />
                <div className="mt-3 flex gap-2">
                  <button className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: T.border, color: T.brand, background: T.panel }} onClick={() => setSelectedClubs(clubs)} disabled={!clubs.length}>
                    Select all
                  </button>
                  <button className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: T.border, color: T.text, background: T.panel }} onClick={() => setSelectedClubs([])} disabled={!selectedClubs.length}>
                    Clear
                  </button>
                </div>
              </div>

              {/* Carry range */}
              <div className="mb-5">
                <label className="text-sm font-medium block mb-2" style={{ color: T.text }}>Carry Distance Range (yds)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder={carryBounds.min ? String(carryBounds.min) : "min"} value={carryMin} onChange={(e) => setCarryMin(e.target.value)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, background: T.panel, color: T.text }} />
                  <input type="number" placeholder={carryBounds.max ? String(carryBounds.max) : "max"} value={carryMax} onChange={(e) => setCarryMax(e.target.value)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, background: T.panel, color: T.text }} />
                </div>
                <div className="mt-2">
                  <button onClick={() => { setCarryMin(""); setCarryMax(""); }} className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: T.border, color: T.text, background: T.panel }}>
                    Reset range
                  </button>
                </div>
              </div>

              {/* Outliers + Dates */}
              <div className="mb-4 flex items-center justify-between">
                <label className="text-sm font-medium" style={{ color: T.text }}>Exclude outliers (2.5σ)</label>
                <input type="checkbox" checked={excludeOutliers} onChange={(e) => setExcludeOutliers(e.target.checked)} />
              </div>

              <div className="mb-6">
                <label className="text-sm font-medium block" style={{ color: T.text }}>Date range</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-2 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, background: T.panel, color: T.text }} />
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-2 py-2 rounded-lg border text-sm" style={{ borderColor: T.border, background: T.panel, color: T.text }} />
                </div>
                <div className="mt-2 flex gap-2">
                  {[
                    { label: "Last 7d", days: 7 },
                    { label: "Last 30d", days: 30 },
                    { label: "Last 90d", days: 90 },
                  ].map(({ label, days }) => (
                    <button key={label} className="px-2 py-1 text-xs rounded-md border"
                            style={{ borderColor: T.border, color: T.brand, background: T.panel }}
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
                  <button className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: T.border, color: T.text, background: T.panel }} onClick={() => { setDateFrom(""); setDateTo(""); }}>
                    Reset
                  </button>
                </div>
              </div>

              {/* Sample / Export */}
              <div className="mb-4 flex flex-wrap gap-2">
                <button onClick={loadSample} className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: T.border, color: T.brand, background: T.panel }}>
                  Load sample
                </button>
                <button onClick={() => exportCSV(filteredOutliers)} className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: T.border, color: T.brand, background: T.panel }}>
                  Export CSV
                </button>
              </div>

              {/* Delete all */}
              <div className="pt-4 border-t" style={{ borderColor: T.border }}>
                <button className="px-3 py-2 rounded-lg text-sm border w-full"
                        style={{ borderColor: T.border, color: "#B91C1C", background: T.panel }}
                        onClick={deleteAll}>
                  Delete all data
                </button>
              </div>
            </Card>
          </div>

          {/* Session Notes */}
          <Card theme={T} title="Session Notes">
            {sessionFilter === "ALL" ? (
              <div className="text-sm" style={{ color: T.textDim }}>Select a session to add notes.</div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="text-xs" style={{ color: T.textDim }}>Notes for: <b style={{ color: T.text }}>{sessionFilter}</b></div>
                <textarea
                  rows={6}
                  value={sessionNote}
                  onChange={(e) => saveSessionNote(e.target.value)}
                  placeholder="Add notes about drills, swing thoughts, weather, range balls, etc."
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: T.border, background: T.panel, color: T.text }}
                />
              </div>
            )}
          </Card>
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
              hasData={hasData}
              kpis={kpis}
              filteredOutliers={filteredOutliers}
              filtered={filtered}
              shots={shots}
              tableRows={tableRows}
              clubs={clubs}
            />
          )}

          {view === "insights" && (
            <InsightsView
              theme={T}
              tableRows={tableRows}
              filteredOutliers={filteredOutliers}
              clubs={clubs}
              insightsOrder={insightsOrder}
              onDragStart={onDragStartInsight}
              onDragOver={onDragOverInsight}
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

      <footer className="px-6 py-8 text-xs text-center" style={{ color: T.textDim }}>
        Gap chart: Carry = blue, Total = green. Shot shape: Draw &lt; -2°, Straight ±2°, Fade &gt; 2°. Data is saved locally in your browser.
      </footer>
    </div>
  );
}

/** ================= DASHBOARD CARDS ================= */
function DashboardCards(props: {
  theme: Theme;
  cardOrder: string[];
  setCardOrder: (v: string[]) => void;
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
  hasData: boolean;
  kpis: any;
  filteredOutliers: Shot[];
  filtered: Shot[];
  shots: Shot[];
  tableRows: ClubRow[];
  clubs: string[];
}) {
  const {
    theme: T, cardOrder, onDragStart, onDragOver, onDrop,
    hasData, kpis, filteredOutliers, filtered, shots, tableRows, clubs
  } = props;

  const CARDS: Record<string, { title: string; render: () => JSX.Element }> = {
    kpis: {
      title: "Key Metrics",
      render: () => (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPI theme={T} label="Avg Carry" value={fmtNum(kpis.avgCarry, 1, " yds")} color={T.brand} />
            <KPI theme={T} label="Avg Total" value={fmtNum(kpis.avgTotal, 1, " yds")} color={T.brandTint} />
            <KPI theme={T} label="Carry Consistency" value={fmtNum(kpis.sdCarry, 1, " sd")} color={T.brand} />
            <KPI theme={T} label="Avg Smash" value={fmtNum(kpis.avgSmash, 3, "")} color={T.brandTint} />
            <KPI theme={T} label="Avg Spin" value={fmtNum(kpis.avgSpin, 0, " rpm")} color={T.brand} />
            <KPI theme={T} label="Shots" value={String(kpis.shots ?? 0)} color={T.text} />
          </div>
          <div className="text-xs mt-2" style={{ color: T.textDim }}>
            Using <b>{filteredOutliers.length}</b> shots after filters (of {filtered.length} filtered, {shots.length} imported).
          </div>
        </>
      )
    },
    shape: {
      title: "Shot Shape Distribution",
      render: () => (!hasData ? <EmptyChart theme={T} /> : (
        <ShotShape theme={T} draw={kpis.shape.draw} straight={kpis.shape.straight} fade={kpis.shape.fade} />
      ))
    },
    dispersion: {
      title: "Dispersion — Driving Range View (50y to max)",
      render: () => (!hasData ? <EmptyChart theme={T} /> : (
        <div style={{ width: "100%", height: 420 }}>
          <RangeDispersion theme={T} shots={filteredOutliers} clubs={clubs} palette={clubPalette} />
        </div>
      ))
    },
    gap: {
      title: "Gap Chart — Carry vs Total by Club",
      render: () => (!hasData ? <EmptyChart theme={T} /> : (
        <div style={{ width: "100%", height: 340 }}>
          <ResponsiveContainer>
            <BarChart data={tableRows}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis dataKey="club" stroke={T.textDim} />
              <YAxis stroke={T.textDim} />
              <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text }} />
              <Legend wrapperStyle={{ color: T.text }} />
              <Bar dataKey="avgCarry" name="Carry (avg)" fill={CARRY_BAR} />
              <Bar dataKey="avgTotal" name="Total (avg)" fill={T.brand} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))
    },
    eff: {
      title: "Efficiency — Club Speed vs Ball Speed",
      render: () => (!hasData ? <EmptyChart theme={T} /> : (
        <div style={{ width: "100%", height: 340 }}>
          <ResponsiveContainer>
            <ScatterChart>
              <CartesianGrid stroke={T.border} />
              <XAxis type="number" dataKey="ClubSpeed_mph" name="Club Speed" unit=" mph" stroke={T.textDim}>
                <Label value="Club Speed (mph)" position="insideBottom" offset={-5} fill={T.textDim} />
              </XAxis>
              <YAxis type="number" dataKey="BallSpeed_mph" name="Ball Speed" unit=" mph" stroke={T.textDim}>
                <Label value="Ball Speed (mph)" angle={-90} position="insideLeft" fill={T.textDim} />
              </YAxis>
              <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text }} formatter={(v: any, n: any) => [v, n]} />
              {clubs.map((c) => (
                <Scatter key={c} name={c} data={filteredOutliers.filter(s => s.Club === c)} fill={colorForClub(c, clubs, clubPalette)} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      ))
    },
    launchspin: {
      title: "Launch vs Spin — bubble size is Carry",
      render: () => (!hasData ? <EmptyChart theme={T} /> : (
        <div style={{ width: "100%", height: 340 }}>
          <ResponsiveContainer>
            <ScatterChart>
              <CartesianGrid stroke={T.border} />
              <XAxis type="number" dataKey="LaunchAngle_deg" name="Launch Angle" unit=" °" stroke={T.textDim}>
                <Label value="Launch Angle (°)" position="insideBottom" offset={-5} fill={T.textDim} />
              </XAxis>
              <YAxis type="number" dataKey="SpinRate_rpm" name="Spin Rate" unit=" rpm" stroke={T.textDim}>
                <Label value="Spin Rate (rpm)" angle={-90} position="insideLeft" fill={T.textDim} />
              </YAxis>
              <ZAxis type="number" dataKey="CarryDistance_yds" range={[30, 400]} />
              <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text }} formatter={(v: any, n: any) => [v, n]} />
              {clubs.map((c) => (
                <Scatter key={c} name={c} data={filteredOutliers.filter(s => s.Club === c)} fill={colorForClub(c, clubs, clubPalette)} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      ))
    },
    table: {
      title: "Club Averages",
      render: () => (!hasData ? <EmptyChart theme={T} /> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" style={{ color: T.text }}>
            <thead>
              <tr className="text-left" style={{ color: T.textDim }}>
                <Th theme={T}>Club</Th><Th theme={T}>Shots</Th><Th theme={T}>Avg Carry</Th><Th theme={T}>Avg Total</Th><Th theme={T}>Carry SD</Th>
                <Th theme={T}>Avg Smash</Th><Th theme={T}>Avg Spin</Th><Th theme={T}>Avg Club Spd</Th><Th theme={T}>Avg Ball Spd</Th><Th theme={T}>Avg Launch</Th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.club} className="border-t" style={{ borderColor: T.border }}>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 inline-block rounded-full" style={{ background: colorForClub(r.club, clubs, clubPalette) }} />
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
      ))
    },
  };

  return (
    <div className="grid grid-cols-1 gap-8">
      {cardOrder.map((key) => {
        const card = CARDS[key];
        if (!card) return null;
        return (
          <div key={key}
               draggable
               onDragStart={onDragStart(key)}
               onDragOver={onDragOver(key)}
               onDrop={onDrop(key)}
               style={{ cursor: "grab" }}>
            <Card theme={T} title={card.title} dragHandle>
              {card.render()}
            </Card>
          </div>
        );
      })}
    </div>
  );
}

/** ================= INSIGHTS (reorderable) ================= */
function InsightsView({
  theme, tableRows, filteredOutliers, clubs,
  insightsOrder, onDragStart, onDragOver, onDrop
}: {
  theme: Theme;
  tableRows: ClubRow[];
  filteredOutliers: Shot[];
  clubs: string[];
  insightsOrder: string[];
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
}) {
  const T = theme;

  const longest = filteredOutliers.reduce<{ club: string; carry: number } | null>((acc, s) => {
    const c = s.CarryDistance_yds ?? -Infinity;
    if (c <= 0) return acc;
    if (!acc || c > acc.carry) return { club: s.Club, carry: c };
    return acc;
  }, null);

  const consistent = React.useMemo(() => {
    const eligible = tableRows.filter(r => r.count >= 5 && r.sdCarry > 0);
    if (!eligible.length) return null;
    return eligible.reduce((a, b) => (a.sdCarry <= b.sdCarry ? a : b));
  }, [tableRows]);

  const gappingWarnings = React.useMemo(() => {
    const sorted = [...tableRows].sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
    const bad: { a: string; b: string; gap: number }[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const gap = Math.abs(sorted[i].avgCarry - sorted[i - 1].avgCarry);
      if (gap < 12) bad.push({ a: sorted[i - 1].club, b: sorted[i].club, gap });
    }
    return bad;
  }, [tableRows]);

  const [metric, setMetric] = useState<"total" | "carry">("total");

  const CARDS: Record<string, { title: string; body: JSX.Element }> = {
    distanceBox: {
      title: `Distance Distribution by Club — ${metric === "total" ? "Total" : "Carry"} (yds)`,
      body: (
        <>
          <div className="mb-3">
            <button
              onClick={() => setMetric(metric === "total" ? "carry" : "total")}
              className="px-2 py-1 text-xs rounded-md border"
              style={{ borderColor: T.border, color: T.brand, background: T.panel }}
            >
              Switch to {metric === "total" ? "Carry" : "Total"}
            </button>
          </div>
          <DistanceBoxChart theme={T} shots={filteredOutliers} clubs={clubs} metric={metric} />
        </>
      )
    },
    highlights: {
      title: "Highlights",
      body: (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KPI theme={T} label="Longest Carry (shot)" value={longest ? `${longest.carry.toFixed(1)} yds` : "-"} color={T.brand} />
          <KPI theme={T} label="Most Consistent (club)" value={consistent ? `${consistent.club} (${consistent.sdCarry.toFixed(1)} sd)` : "-"} color={T.brandTint} />
          <KPI theme={T} label="Clubs with Tight Gap" value={`${gappingWarnings.length}`} color={T.text} />
        </div>
      )
    },
    warnings: {
      title: "Gapping Warnings (Carry Δ < 12 yds)",
      body: gappingWarnings.length === 0 ? (
        <div style={{ color: T.textDim }}>No issues detected.</div>
      ) : (
        <ul className="list-disc pl-6" style={{ color: T.text }}>
          {gappingWarnings.map((g, i) => (
            <li key={i}><b>{g.a}</b> ↔ <b>{g.b}</b> : {g.gap.toFixed(1)} yds</li>
          ))}
        </ul>
      )
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8">
      {insightsOrder.map((key) => {
        const c = CARDS[key];
        if (!c) return null;
        return (
          <div key={key}
               draggable
               onDragStart={onDragStart(key)}
               onDragOver={onDragOver(key)}
               onDrop={onDrop(key)}
               style={{ cursor: "grab" }}>
            <Card theme={T} title={c.title} dragHandle>
              {c.body}
            </Card>
          </div>
        );
      })}
    </div>
  );
}

/** ================= JOURNAL VIEW ================= */
function JournalView({
  theme, editorRef, value, onInputHTML, sessionLabel, defaultHeightPx
}: {
  theme: Theme;
  editorRef: React.RefObject<HTMLDivElement>;
  value: string;
  onInputHTML: (html: string) => void;
  sessionLabel: string;
  defaultHeightPx?: number;
}) {
  const T = theme;

  const HELP_TEXT =
    "Use the Journal to capture longer-form notes from your sessions: swing thoughts and feels vs. reals, drills and rep counts, shot patterns and misses, goals and next steps, equipment tweaks, course notes, and conditions (wind/lie/balls). Entries auto-save per session—switch sessions to keep separate journals.";

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    onInputHTML(editorRef.current?.innerHTML || "");
  };
  const onKeyUp = () => onInputHTML(editorRef.current?.innerHTML || "");
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    onInputHTML(editorRef.current?.innerHTML || "");
  };

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value, editorRef]);

  // Reserve room for help + toolbar
  const RESERVED = 160;
  const minEditorH = Math.max(420, Math.floor((defaultHeightPx || 420) - RESERVED));

  return (
    <div className="grid grid-cols-1 gap-8">
      <Card theme={T} title={`Journal — ${sessionLabel}`}>
        <div className="mb-4 text-sm rounded-lg px-4 py-3"
             style={{ background: T.blueSoft, border: `1px solid ${T.border}`, color: T.text }}>
          {HELP_TEXT}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <ToolbarBtn theme={T} label="B" onClick={() => exec("bold")} />
          <ToolbarBtn theme={T} label={<em>I</em>} onClick={() => exec("italic")} />
          <ToolbarBtn theme={T} label={<u>U</u>} onClick={() => exec("underline")} />
          <ToolbarBtn theme={T} label="H2" onClick={() => exec("formatBlock", "<h2>")} />
          <ToolbarBtn theme={T} label="H3" onClick={() => exec("formatBlock", "<h3>")} />
          <ToolbarBtn theme={T} label="• List" onClick={() => exec("insertUnorderedList")} />
          <ToolbarBtn theme={T} label="1. List" onClick={() => exec("insertOrderedList")} />
          <ToolbarBtn theme={T} label="Link" onClick={() => {
            const url = window.prompt("Enter URL");
            if (url) exec("createLink", url);
          }} />
          <ToolbarBtn theme={T} label="Clear" onClick={() => onInputHTML("")} />
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onKeyUp={onKeyUp}
          onBlur={onKeyUp}
          onPaste={onPaste}
          aria-label="Practice journal editor"
          className="rounded-lg p-4 text-sm overflow-auto resize-y"
          style={{
            background: T.panel,
            border: `1px solid ${T.border}`,
            color: T.text,
            minHeight: `${minEditorH}px`,
            resize: "vertical",
          }}
          data-placeholder="Start typing your journal here…"
        />
        {!value && (
          <div className="mt-2 text-xs" style={{ color: T.textDim }}>
            Tip: your journal auto-saves per session. Use the toolbar to format.
          </div>
        )}
      </Card>
    </div>
  );
}

/** ================= Range-style dispersion (SVG) ================= */
function RangeDispersion({ theme, shots, clubs, palette }: { theme: Theme; shots: Shot[]; clubs: string[]; palette: string[] }) {
  const T = theme;

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

  // Layout with left legend
  const LEGEND_W = 160;
  const W = 900, H = 420, PAD_T = 40, PAD_R = 40, PAD_B = 40, PAD_L = 40 + LEGEND_W;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xScale = (x: number) => PAD_L + ((x + XMAX) / (2 * XMAX)) * innerW;
  const yScale = (y: number) => {
    const clamped = Math.max(YMIN, Math.min(YMAX, y));
    return H - PAD_B - ((clamped - YMIN) / (YMAX - YMIN)) * innerH;
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
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ background: T.brandSoft, borderRadius: 12, border: `1px solid ${T.border}` }}>
      {/* Stripes */}
      {stripes.map((i) => (
        <rect key={i} x={PAD_L} y={PAD_T + (innerH / stripes.length) * i} width={innerW} height={innerH / stripes.length}
              fill={i % 2 === 0 ? T.gridStripeA : T.gridStripeB} opacity={0.9} />
      ))}

      {/* Target line */}
      <line x1={xScale(0)} y1={PAD_T - 10} x2={xScale(0)} y2={H - PAD_B + 10} stroke={T.brand} strokeDasharray="6 6" strokeWidth={2} />

      {/* Distance ticks + flags */}
      {distTicks.map((d, idx) => (
        <g key={d}>
          <line x1={PAD_L} x2={W - PAD_R} y1={yScale(d)} y2={yScale(d)} stroke={T.border} strokeDasharray="4 8" />
          <Flag theme={T} x={xScale(0)} y={yScale(d)} color={palette[idx % palette.length]} label={`${d}y`} />
        </g>
      ))}

      {/* Axis labels */}
      <text x={xScale(0) + 8} y={PAD_T - 16} fontSize={12} fill={T.textDim}>Target line</text>
      <text x={PAD_L} y={H - 8} fontSize={11} fill={T.textDim}>Left ←  Deviation (yds)  → Right</text>
      <text x={W - PAD_R - 120} y={PAD_T - 16} fontSize={11} fill={T.textDim}>Range: {YMIN}–{YMAX} yds</text>

      {/* Points by club (stable colors) */}
      {[...byClub.keys()].map((club) => {
        const color = colorForClub(club, clubs, palette);
        const ptsC = byClub.get(club)!;
        return (
          <g key={club}>
            {ptsC.map((p, i) => (
              <circle key={i} cx={xScale(p.x)} cy={yScale(p.y)} r={4} fill={color} stroke={T.white} strokeWidth={1} opacity={0.95} />
            ))}
          </g>
        );
      })}

      {/* LEFT legend */}
      <g transform={`translate(40, ${PAD_T})`}>
        <rect x={0} y={-8} width={LEGEND_W - 20} height={Math.min(innerH, clubs.length * 22)} rx={8} ry={8}
              fill={T.white} opacity={0.9} stroke={T.border} />
        {clubs.map((c, i) => (
          <g key={c} transform={`translate(10, ${i * 22})`}>
            <rect width="10" height="10" fill={colorForClub(c, clubs, palette)} rx="2" ry="2" />
            <text x={14} y={9} fontSize="12" fill={T.textDim}>{c}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function Flag({ theme, x, y, color, label }: { theme: Theme; x: number; y: number; color: string; label: string }) {
  const T = theme;
  const poleH = 22, flagW = 16, flagH = 10;
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - poleH} stroke={T.textDim} strokeWidth={2} />
      <polygon points={`${x},${y - poleH} ${x + flagW},${y - poleH + flagH / 2} ${x},${y - poleH + flagH}`} fill={color} stroke={T.text} strokeWidth={0.5} />
      <text x={x + flagW + 6} y={y - poleH + flagH / 1.2} fontSize={11} fill={T.text}>{label}</text>
    </g>
  );
}

/** ================= Shot Shape ================= */
function ShotShape({
  theme, draw, straight, fade
}: { theme: Theme; draw: { n: number; pct: number }; straight: { n: number; pct: number }; fade: { n: number; pct: number } }) {
  const T = theme;
  const Box = ({ title, pct, n, bg, color }: { title: string; pct: number; n: number; bg: string; color: string }) => (
    <div className="rounded-2xl px-6 py-6" style={{ background: bg, border: `1px solid ${T.border}` }}>
      <div className="text-2xl font-semibold" style={{ color }}>{pct.toFixed(1)}%</div>
      <div className="mt-1 text-sm" style={{ color: T.text }}>{title}</div>
      <div className="text-xs" style={{ color: T.textDim }}>{n} shots</div>
    </div>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Box title="Draw" pct={draw.pct} n={draw.n} bg={T.blueSoft} color="#4EA3FF" />
      <Box title="Straight" pct={straight.pct} n={straight.n} bg={T.greenSoft} color={T.brand} />
      <Box title="Fade" pct={fade.pct} n={fade.n} bg={T.orangeSoft} color="#F59E0B" />
    </div>
  );
}

/** ================= DistanceBoxChart (Insights) ================= */
function DistanceBoxChart({
  theme,
  shots,
  clubs,
  metric = "total"
}: {
  theme: Theme;
  shots: Shot[];
  clubs: string[];
  metric?: "total" | "carry";
}) {
  const T = theme;
  const get = (s: Shot) => metric === "total" ? s.TotalDistance_yds : s.CarryDistance_yds;

  // Build stats per club ONLY for clubs that have data, then sort by your logical order (Driver → LW)
  const rows = clubs
    .map((club) => {
      const vals = shots.filter(s => s.Club === club).map(get).filter((v): v is number => v != null);
      if (!vals.length) return null;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const q1 = quantile(vals, 0.25);
      const q3 = quantile(vals, 0.75);
      const med = quantile(vals, 0.5);
      const avg = mean(vals);
      return {
        club,
        min, max, q1, q3, median: med, mean: avg,
        rangeStart: min,
        rangeWidth: Math.max(0, max - min),
        iqrStart: q1,
        iqrWidth: Math.max(0, q3 - q1),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => orderIndex(a.club) - orderIndex(b.club)) as any[];

  if (!rows.length) {
    return <div style={{ padding: 16, color: T.textDim }}>No shots for this selection.</div>;
  }

  // Colors & marker widths
  const rangeColor   = T.border;      // whisker (min→max)
  const boxColor     = T.brand;       // Q1→Q3
  const meanStroke   = T.white;       // mean tick
  const medianStroke = T.brandTint;   // median tick
  const tickHalfW    = 7;             // half-length of the little tick

  // Compute a nice x-domain (adds padding on both ends)
  const xMin = Math.min(...rows.map(r => r.min));
  const xMax = Math.max(...rows.map(r => r.max));
  const pad  = Math.max(5, Math.round((xMax - xMin) * 0.05));
  const domain: [number, number] = [Math.max(0, xMin - pad), xMax + pad];

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart
        data={rows}
        layout="vertical"
        margin={{ top: 10, right: 16, bottom: 10, left: 16 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
        <XAxis type="number" domain={domain} stroke={T.textDim} />
        {/* interval={0} ensures every club label renders; order is exactly the array order */}
        <YAxis type="category" dataKey="club" interval={0} width={120} stroke={T.textDim} />

        <Tooltip
          contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text }}
          formatter={(v: any, n: any) => [v, n]}
        />

        {/* Min→Max “whisker”: transparent offset + visible width */}
        <Bar dataKey="rangeStart" stackId="range" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="rangeWidth" stackId="range" fill={rangeColor} barSize={6} radius={[4,4,4,4]} />

        {/* Q1→Q3 “box” on top */}
        <Bar dataKey="iqrStart" stackId="iqr" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="iqrWidth" stackId="iqr" fill={boxColor} barSize={14} radius={[6,6,6,6]} opacity={0.95} />

        {/* Median & Mean ticks aligned to the category row using ReferenceLine segments */}
        {rows.map(r => (
          <ReferenceLine
            key={`med-${r.club}`}
            segment={[
              { x: r.median - tickHalfW, y: r.club },
              { x: r.median + tickHalfW, y: r.club },
            ]}
            stroke={medianStroke}
            strokeWidth={3}
            ifOverflow="extendDomain"
          />
        ))}
        {rows.map(r => (
          <ReferenceLine
            key={`mean-${r.club}`}
            segment={[
              { x: r.mean - tickHalfW, y: r.club },
              { x: r.mean + tickHalfW, y: r.club },
            ]}
            stroke={meanStroke}
            strokeWidth={3}
            ifOverflow="extendDomain"
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}


/** ================= UI PRIMITIVES ================= */
function Card({ theme, title, children, dragHandle }: { theme: Theme; title: string; children: React.ReactNode; dragHandle?: boolean }) {
  const T = theme;
  return (
    <div className="rounded-2xl p-5 shadow" style={{ background: T.panel, border: `1px solid ${T.border}` }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold tracking-wide" style={{ color: T.brand }}>
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {dragHandle && <span title="Drag to reorder" style={{ color: T.textDim, cursor: "grab" }}>⋮⋮</span>}
          <div className="h-1 rounded-full w-24" style={{ background: `linear-gradient(90deg, ${T.brand}, ${T.brandTint})` }} />
        </div>
      </div>
      {children}
    </div>
  );
}
function KPI({ theme, label, value, color }: { theme: Theme; label: string; value: string; color: string }) {
  const T = theme;
  return (
    <div className="rounded-2xl p-3 text-sm" style={{ background: T.panel, border: `1px solid ${T.kpiBorder}`, color: T.text }}>
      <div style={{ color: T.textDim }}>{label}</div>
      <div className="mt-1 text-lg font-semibold" style={{ color }}>{value || "-"}</div>
    </div>
  );
}
function ClubList({ theme, options, selected, onChange, palette }: { theme: Theme; options: string[]; selected: string[]; onChange: (v: string[]) => void; palette: string[] }) {
  const T = theme;
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        const color = colorForClub(opt, options, palette);
        return (
          <label key={opt} className="flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer"
                 style={{ borderColor: active ? color : T.border, background: active ? (T === DARK ? "#0F172A" : "#FAFAFA") : T.panel, color: T.text }}>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 inline-block rounded-full" style={{ background: color }} />
              <span className="text-sm">{opt}</span>
            </div>
            <input type="checkbox" checked={active} onChange={() => onChange(active ? selected.filter(s => s !== opt) : [...selected, opt])} />
          </label>
        );
      })}
    </div>
  );
}
function EmptyChart({ theme }: { theme: Theme }) { return <div style={{ padding: 16, color: theme.textDim }}>No shots in this range.</div>; }
function Th({ children, theme }: { children: React.ReactNode; theme: Theme }) { return <th className="py-2 pr-4" style={{ color: theme.textDim }}>{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="py-2 pr-4">{children}</td>; }
function TopTab({ theme, label, active, onClick }: { theme: Theme; label: string; active: boolean; onClick: () => void }) {
  const T = theme;
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 rounded-lg text-sm border"
      style={{
        background: active ? "#ffffff" : "#ffffff22",
        borderColor: "#ffffff55",
        color: active ? T.brand : "#fff",
        fontWeight: active ? 600 : 500
      }}
    >
      {label}
    </button>
  );
}
function ToolbarBtn({ theme, label, onClick }: { theme: Theme; label: React.ReactNode; onClick: () => void }) {
  const T = theme;
  return (
    <button onClick={onClick} className="px-2 py-1 text-xs rounded-md border" style={{ borderColor: T.border, color: T.text, background: T.panel }}>
      {label}
    </button>
  );
}
function IconSun() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFD166" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="4" fill="#FFD166" />
      <g stroke="#fff" strokeLinecap="round">
        <line x1="12" y1="2" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22" />
        <line x1="2" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
        <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
        <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
        <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
      </g>
    </svg>
  );
}
function IconMoon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

/** ================= UTIL: numbers & CSV ================= */
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
