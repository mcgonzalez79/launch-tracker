import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, ReferenceLine
} from "recharts";
import { Card } from "./components/UI";
import { Theme } from "./theme";
import {
  Shot, ClubRow, mean, stddev, orderIndex,
} from "./utils";

/** Props */
type InsightsProps = {
  theme: Theme;

  /** Already computed in App */
  tableRows: ClubRow[];                     // averages per club (ordered by orderIndex in App)
  filteredOutliers: Shot[];                 // respects all filters, including selected clubs
  filteredNoClubOutliers: Shot[];           // same filters, but ignores club selection (global pool)
  allClubs: string[];                       // ordered club list across dataset

  /** Reordering for cards */
  insightsOrder: string[];
  onDragStart: (key: string) => (e: React.DragEvent) => void;
  onDragOver: (key: string) => (e: React.DragEvent) => void;
  onDrop: (key: string) => (e: React.DragEvent) => void;
};

const CARRY_BAR = "#3A86FF";   // carry color in insights distance box
const TOTAL_BAR = "#00A36C";   // total color in insights distance box (green family, matches app)
const GRID_STROKE = "#E2E8F0";

/** Helper: unique clubs in a pool */
const uniqueClubs = (arr: Shot[]) => Array.from(new Set(arr.map(s => s.Club))).sort((a,b)=>orderIndex(a)-orderIndex(b));

/** Helper: get max by key */
function maxBy<T>(arr: T[], pick: (x: T) => number | undefined): T | undefined {
  let best: T | undefined = undefined;
  let bestVal = -Infinity;
  for (const item of arr) {
    const v = pick(item);
    if (v == null) continue;
    if (v > bestVal) { bestVal = v; best = item; }
  }
  return best;
}

/** Efficiency score: 0–100 (simple, stable) */
function efficiencyScore(pool: Shot[]): { score: number; tooltip: string } {
  if (!pool.length) return { score: 0, tooltip: "No shots available." };
  const carries = pool.map(s => s.CarryDistance_yds).filter((v): v is number => v != null);
  const smashs  = pool.map(s => s.SmashFactor).filter((v): v is number => v != null);

  if (!carries.length || !smashs.length) return { score: 0, tooltip: "Need carry and smash to compute efficiency." };

  const carryMean = mean(carries);
  const carrySD = stddev(carries) || 1;
  const smashMean = mean(smashs);
  const smashSD = stddev(smashs) || 1;

  // z-normalize & blend; clamp to [0,100]
  const zCarry = (carryMean - 0) / carrySD;
  const zSmash = (smashMean - 0) / smashSD;
  const blended = 50 + 20 * zCarry + 30 * zSmash;
  const score = Math.max(0, Math.min(100, Math.round(blended)));

  return {
    score,
    tooltip: "Composite of Carry and Smash (z-normalized) blended into 0–100. Higher = more efficient ball striking.",
  };
}

/** Skill bucket from average Total Distance (very rough guide) */
function skillLabelFromTotal(avgTotal: number | undefined): string {
  if (avgTotal == null || isNaN(avgTotal)) return "—";
  if (avgTotal >= 290) return "PGA Tour";
  if (avgTotal >= 260) return "Advanced";
  if (avgTotal >= 230) return "Good";
  if (avgTotal >= 200) return "Average";
  return "Beginner";
}

/** Personal Records (PR) card logic — uses GLOBAL pool to match Highlights */
function usePersonalRecords(
  globalPool: Shot[],
  selectedPool: Shot[],    // club-filtered pool (to detect which club(s) are selected)
) {
  // Determine the "active" club: exactly one club visible in the selected pool
  const selectedClubs = uniqueClubs(selectedPool);
  const activeClub = selectedClubs.length === 1 ? selectedClubs[0] : undefined;

  const clubSubset = useMemo(
    () => (activeClub ? globalPool.filter(s => s.Club === activeClub) : []),
    [globalPool, activeClub]
  );

  const prCarryShot = useMemo(
    () => maxBy(clubSubset, s => s.CarryDistance_yds),
    [clubSubset]
  );
  const prTotalShot = useMemo(
    () => maxBy(clubSubset, s => s.TotalDistance_yds),
    [clubSubset]
  );

  const prCarry = prCarryShot?.CarryDistance_yds;
  const prTotal = prTotalShot?.TotalDistance_yds;

  // Average shot direction (spin axis) across the subset — kept for completeness if you still show it elsewhere
  const spinAxes = clubSubset.map(s => s.SpinAxis_deg).filter((v): v is number => v != null);
  const avgSpinAxis = spinAxes.length ? mean(spinAxes) : undefined;

  // Skill label derived from avg total of this club subset
  const totals = clubSubset.map(s => s.TotalDistance_yds).filter((v): v is number => v != null);
  const avgTotal = totals.length ? mean(totals) : undefined;
  const skillLabel = skillLabelFromTotal(avgTotal);

  return { activeClub, prCarry, prTotal, avgSpinAxis, skillLabel };
}

export default function InsightsView(props: InsightsProps) {
  const {
    theme,
    tableRows,
    filteredOutliers,          // respects current club selection
    filteredNoClubOutliers,    // GLOBAL — used by Highlights (and now PR logic)
    allClubs,
    insightsOrder,
    onDragStart, onDragOver, onDrop,
  } = props;

  /* -------------------------
     Highlights (GLOBAL pool)
  --------------------------*/
  const globalPool = filteredNoClubOutliers;

  const longestCarryShot = useMemo(
    () => maxBy(globalPool, s => s.CarryDistance_yds),
    [globalPool]
  );
  const mostConsistentClub = useMemo(() => {
    // lowest carry SD among clubs with >= 5 shots
    const groups = new Map<string, number[]>();
    globalPool.forEach(s => {
      if (s.CarryDistance_yds == null) return;
      if (!groups.has(s.Club)) groups.set(s.Club, []);
      groups.get(s.Club)!.push(s.CarryDistance_yds);
    });
    let bestClub: string | undefined;
    let bestSD = Infinity;
    for (const [club, carries] of groups.entries()) {
      if (carries.length < 5) continue;
      const sd = stddev(carries);
      if (sd < bestSD) { bestSD = sd; bestClub = club; }
    }
    return { club: bestClub, sd: isFinite(bestSD) ? bestSD : undefined };
  }, [globalPool]);

  const eff = useMemo(() => efficiencyScore(globalPool), [globalPool]);

  /* --------------------------------------------
     Personal Records — now using GLOBAL pool too
     (filtered by the single active club)
  ---------------------------------------------*/
  const { activeClub, prCarry, prTotal, avgSpinAxis, skillLabel } =
    usePersonalRecords(globalPool, filteredOutliers);

  /* -----------------------------
     Distance distribution (bars)
  ------------------------------*/
  const distanceRows = useMemo(() => {
    // Keep club order consistent (Driver … LW)
    const ordered = [...tableRows].sort((a,b)=>orderIndex(a.club)-orderIndex(b.club));
    return ordered.map(r => ({
      club: r.club,
      avgCarry: Number.isFinite(r.avgCarry) ? r.avgCarry : 0,
      avgTotal: Number.isFinite(r.avgTotal) ? r.avgTotal : 0,
    }));
  }, [tableRows]);

  /* ---------------------
     Gapping Warnings
  ----------------------*/
  const gapWarnings = useMemo(() => {
    const warnings: string[] = [];
    const rows = [...tableRows].sort((a,b)=>orderIndex(a.club)-orderIndex(b.club));
    for (let i=1;i<rows.length;i++){
      const prev = rows[i-1], cur = rows[i];
      if (!prev.avgCarry || !cur.avgCarry) continue;
      const gap = Math.abs(prev.avgCarry - cur.avgCarry);
      if (gap < 10) warnings.push(`${prev.club} ↔ ${cur.club} gap is tight (${gap.toFixed(1)} yds)`);
      if (gap > 25) warnings.push(`${prev.club} ↔ ${cur.club} gap is wide (${gap.toFixed(1)} yds)`);
    }
    const tightCount = warnings.filter(w => /tight/.test(w)).length;
    return { warnings, tightCount };
  }, [tableRows]);

  /* ----------------------
     Progress (line chart)
  -----------------------*/
  // Use selected pool to show progress of the currently visible club(s).
  // If single club is active, we draw that club’s trend; else show global average carry trend.
  const progressData = useMemo(() => {
    const pool = filteredOutliers.length ? filteredOutliers : globalPool;
    // group by day
    const byDay = new Map<string, number[]>();
    pool.forEach(s => {
      const t = s.Timestamp ? new Date(s.Timestamp) : null;
      const key = t ? t.toISOString().slice(0,10) : "Unknown";
      if (!byDay.has(key)) byDay.set(key, []);
      if (s.CarryDistance_yds != null) byDay.get(key)!.push(s.CarryDistance_yds);
    });
    const rows = Array.from(byDay.entries()).map(([day, vals]) => ({
      day, avgCarry: vals.length ? mean(vals) : 0
    })).sort((a,b)=>a.day.localeCompare(b.day));
    return rows;
  }, [filteredOutliers, globalPool]);

  /* -------------
     Card Render
  --------------*/
  const renderCard = (key: string) => {
    switch (key) {
      case "distanceBox":
        return (
          <Card key={key} title="Distance Distribution (Avg Carry vs Total)">
            <div style={{ width: "100%", height: 340 }}>
              <ResponsiveContainer>
                <BarChart data={distanceRows} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="club" width={110} />
                  <Tooltip formatter={(v: any, name: any) => [v, name === "avgCarry" ? "Carry (avg)" : "Total (avg)"]} />
                  <Legend />
                  <Bar dataKey="avgCarry" name="Carry (avg)" fill={CARRY_BAR} />
                  <Bar dataKey="avgTotal" name="Total (avg)" fill={TOTAL_BAR} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );

      case "highlights":
        return (
          <Card key={key} title="Highlights (All Data)">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-slate-500">Longest Carry</div>
                <div className="mt-1 text-lg font-semibold" style={{ color: theme.brand }}>
                  {longestCarryShot?.CarryDistance_yds != null
                    ? `${longestCarryShot.CarryDistance_yds.toFixed(1)} yds (${longestCarryShot.Club})`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Most Consistent Club</div>
                <div className="mt-1 text-lg font-semibold">
                  {mostConsistentClub.club
                    ? `${mostConsistentClub.club} (SD ${mostConsistentClub.sd!.toFixed(1)} yds)`
                    : "—"}
                </div>
              </div>
              <div title={eff.tooltip}>
                <div className="text-slate-500">Efficiency Score</div>
                <div className="mt-1 text-lg font-semibold">{eff.score}/100</div>
              </div>
            </div>
          </Card>
        );

      case "personalRecords": {
        // Uses GLOBAL pool filtered to the active (single) club, so it matches Highlights logic.
        return (
          <Card key={key} title="Personal Records (per Selected Club)">
            {activeClub ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-slate-500">PR Carry</div>
                  <div className="mt-1 text-lg font-semibold" style={{ color: "#EF476F" }}>
                    {prCarry != null ? `${prCarry.toFixed(1)} yds` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">PR Total</div>
                  <div className="mt-1 text-lg font-semibold" style={{ color: "#3A86FF" }}>
                    {prTotal != null ? `${prTotal.toFixed(1)} yds` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Skill (Totals)</div>
                  <div className="mt-1 text-lg font-semibold" style={{ color: theme.brand }}>
                    {skillLabel}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-600">
                Select a single club in Filters to see PRs for that club.
              </div>
            )}
          </Card>
        );
      }

      case "warnings":
        return (
          <Card key={key} title="Gapping Warnings">
            <ul className="list-disc pl-5 text-sm space-y-1">
              {gapWarnings.warnings.length ? gapWarnings.warnings.map((w, i) => <li key={i}>{w}</li>) : <li>No gapping warnings.</li>}
            </ul>
            {gapWarnings.tightCount > 0 && (
              <div className="mt-3 text-xs text-slate-500">
                Clubs with a tight gap: {gapWarnings.tightCount}
              </div>
            )}
          </Card>
        );

      case "progress":
        return (
          <Card key={key} title="Club Progress (Avg Carry over Time)">
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={progressData} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Line dataKey="avgCarry" name="Avg Carry" type="monotone" dot={false} stroke={CARRY_BAR} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );

      case "weaknesses": {
        // Simple heuristic: highest average spin or largest left/right bias across clubs
        const byClub = new Map<string, Shot[]>();
        globalPool.forEach(s => {
          if (!byClub.has(s.Club)) byClub.set(s.Club, []);
          byClub.get(s.Club)!.push(s);
        });
        let highSpinClub: string | undefined;
        let highSpinVal = -Infinity;
        let biasClub: string | undefined;
        let biasVal = 0;
        for (const [club, arr] of byClub.entries()) {
          const spins = arr.map(s => s.SpinRate_rpm).filter((v): v is number => v != null);
          const devs = arr.map(s => s.CarryDeviationDistance_yds).filter((v): v is number => v != null);
          const avgSpin = spins.length ? mean(spins) : 0;
          const avgBias = devs.length ? mean(devs) : 0;
          if (avgSpin > highSpinVal) { highSpinVal = avgSpin; highSpinClub = club; }
          if (Math.abs(avgBias) > Math.abs(biasVal)) { biasVal = avgBias; biasClub = club; }
        }
        return (
          <Card key={key} title="Biggest Weakness (Heuristic)">
            <div className="text-sm space-y-2">
              <div>Highest avg spin: <strong>{highSpinClub ?? "—"}</strong> ({isFinite(highSpinVal) ? Math.round(highSpinVal) : "—"} rpm)</div>
              <div>Largest directional bias: <strong>{biasClub ?? "—"}</strong> ({isFinite(biasVal) ? biasVal.toFixed(1) : "—"} yds)</div>
              <div className="text-xs text-slate-500">Heuristic only — consider sampling size & context.</div>
            </div>
          </Card>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      {insightsOrder.map((key) => (
        <div
          key={key}
          draggable
          onDragStart={onDragStart(key)}
          onDragOver={onDragOver(key)}
          onDrop={onDrop(key)}
          className={
            key === "distanceBox" || key === "progress"
              ? "col-span-12"
              : "col-span-12 md:col-span-6"
          }
        >
          {renderCard(key)}
        </div>
      ))}
    </div>
  );
}
