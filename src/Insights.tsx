import React, { useMemo } from "react";
import { Theme } from "./theme";
import { Card } from "./components/UI";
import { Shot, ClubRow, mean, stddev, orderIndex } from "./utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label, ReferenceLine,
} from "recharts";

type Props = {
  theme: Theme;

  /** Per-club averages for the current dashboard pool */
  tableRows: ClubRow[];

  /** Pool that IGNORES club selection (but respects date/outlier filters) */
  filteredNoClubOutliers: Shot[];

  /** Full list of clubs (ordered by bag order helper) */
  allClubs: string[];

  /** Currently selected clubs (from Filters) */
  selectedClubs: string[];

  /** Insights card ordering + DnD handlers (mirrors Dashboard) */
  insightsOrder: string[];
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
};

const GAP_TIGHT_YDS = 12;     // shows "tight gap" warnings
const GAP_BIG_YDS = 25;       // shows "big gap" opportunities

export default function InsightsView(props: Props) {
  const {
    theme: T,
    tableRows,
    filteredNoClubOutliers,
    allClubs,
    selectedClubs,
    insightsOrder,
    onDragStart,
    onDragOver,
    onDrop,
  } = props;

  /** ========== Derived data (GLOBAL, ignores club selection) ========== */

  const perClubGlobal: ClubRow[] = useMemo(() => {
    // Build per-club aggregates from the pool that ignores club selection
    const by = new Map<string, number[]>();
    const totals = new Map<string, number[]>();
    const carries = new Map<string, number[]>();

    filteredNoClubOutliers.forEach((s) => {
      if (!by.has(s.Club)) by.set(s.Club, []);
      if (!totals.has(s.Club)) totals.set(s.Club, []);
      if (!carries.has(s.Club)) carries.set(s.Club, []);
      if (s.SmashFactor != null) by.get(s.Club)!.push(s.SmashFactor);
      if (s.TotalDistance_yds != null) totals.get(s.Club)!.push(s.TotalDistance_yds);
      if (s.CarryDistance_yds != null) carries.get(s.Club)!.push(s.CarryDistance_yds);
    });

    const rows: ClubRow[] = [];
    const clubsSeen = new Set<string>(filteredNoClubOutliers.map(s => s.Club));
    Array.from(clubsSeen).forEach((club) => {
      const pool = filteredNoClubOutliers.filter(s => s.Club === club);
      const carryVals = pool.map(s => s.CarryDistance_yds!).filter((x): x is number => x != null);
      const totalVals = pool.map(s => s.TotalDistance_yds!).filter((x): x is number => x != null);
      const smashVals = pool.map(s => s.SmashFactor!).filter((x): x is number => x != null);
      const spinVals  = pool.map(s => s.SpinRate_rpm!).filter((x): x is number => x != null);
      const csVals    = pool.map(s => s.ClubSpeed_mph!).filter((x): x is number => x != null);
      const bsVals    = pool.map(s => s.BallSpeed_mph!).filter((x): x is number => x != null);
      const laVals    = pool.map(s => s.LaunchAngle_deg!).filter((x): x is number => x != null);

      rows.push({
        club,
        count: pool.length,
        avgCarry: carryVals.length ? mean(carryVals) : 0,
        avgTotal: totalVals.length ? mean(totalVals) : 0,
        sdCarry: carryVals.length ? carryStd(carryVals) : 0,
        avgSmash: smashVals.length ? mean(smashVals) : 0,
        avgSpin:  spinVals.length ? mean(spinVals) : 0,
        avgCS:    csVals.length ? mean(csVals) : 0,
        avgBS:    bsVals.length ? mean(bsVals) : 0,
        avgLA:    laVals.length ? mean(laVals) : 0,
        avgF2P: 0, // not needed here
      });
    });

    return rows.sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
  }, [filteredNoClubOutliers]);

  const longestCarryShot = useMemo(() => {
    let best: Shot | undefined;
    for (const s of filteredNoClubOutliers) {
      if (s.CarryDistance_yds == null) continue;
      if (!best || (s.CarryDistance_yds > (best.CarryDistance_yds ?? -Infinity))) best = s;
    }
    return best;
  }, [filteredNoClubOutliers]);

  const mostConsistentClub = useMemo(() => {
    let bestClub: string | undefined;
    let bestSd = Infinity;
    perClubGlobal.forEach((r) => {
      // use sdCarry already computed above (population stdev)
      if (r.count >= 3 && r.sdCarry < bestSd) {
        bestSd = r.sdCarry;
        bestClub = r.club;
      }
    });
    return bestClub ? { club: bestClub, sd: bestSd } : undefined;
  }, [perClubGlobal]);

  // Simple 0-100 efficiency: normalized smash and carry per mph (tunable)
  const efficiencyScore = useMemo(() => {
    const pool = filteredNoClubOutliers;
    const smash = pool.map(s => s.SmashFactor).filter((x): x is number => x != null);
    const cs = pool.map(s => s.ClubSpeed_mph).filter((x): x is number => x != null);
    const carry = pool.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
    if (!smash.length || !cs.length || !carry.length) return 0;

    const smashAvg = mean(smash);                   // typical 1.3–1.5
    const carryPerMPH = mean(carry) / mean(cs);     // yards per mph
    // scale to 0..100 with soft caps
    const sPart = Math.min(1, Math.max(0, (smashAvg - 1.1) / 0.5));
    const cPart = Math.min(1, Math.max(0, (carryPerMPH - 1.2) / 1.0));
    return Math.round(100 * (0.6 * sPart + 0.4 * cPart));
  }, [filteredNoClubOutliers]);

  /** ========== Personal Records (tied to selected club, but same pool rules) ========== */
  const pr = useMemo(() => {
    // Use the same "global but no club filter" pool,
    // then filter to the SINGLE selected club (if one is picked).
    let clubForPR: string | undefined = undefined;
    if (selectedClubs.length === 1) clubForPR = selectedClubs[0];
    else if (longestCarryShot) clubForPR = longestCarryShot.Club;

    const pool = clubForPR
      ? filteredNoClubOutliers.filter(s => s.Club === clubForPR)
      : filteredNoClubOutliers;

    let prCarry = -Infinity, prCarryClub = "—";
    let prTotal = -Infinity, prTotalClub = "—";
    pool.forEach(s => {
      if (s.CarryDistance_yds != null && s.CarryDistance_yds > prCarry) {
        prCarry = s.CarryDistance_yds; prCarryClub = s.Club;
      }
      if (s.TotalDistance_yds != null && s.TotalDistance_yds > prTotal) {
        prTotal = s.TotalDistance_yds; prTotalClub = s.Club;
      }
    });

    return {
      club: clubForPR,
      carry: prCarry === -Infinity ? undefined : prCarry,
      carryClub: prCarryClub,
      total: prTotal === -Infinity ? undefined : prTotal,
      totalClub: prTotalClub,
    };
  }, [selectedClubs, filteredNoClubOutliers, longestCarryShot]);

  /** ========== Gapping warnings (global, ignores club selection) ========== */
  const gapWarnings = useMemo(() => {
    const rows = perClubGlobal.filter(r => r.count >= 3);
    const tight: { from: string; to: string; gap: number }[] = [];
    const big: { from: string; to: string; gap: number }[] = [];
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1], curr = rows[i];
      const gap = Math.abs(curr.avgCarry - prev.avgCarry);
      if (gap < GAP_TIGHT_YDS) tight.push({ from: prev.club, to: curr.club, gap });
      if (gap > GAP_BIG_YDS) big.push({ from: prev.club, to: curr.club, gap });
    }
    return { tight, big };
  }, [perClubGlobal]);

  /** ========== Distance Distribution (uses current dashboard tableRows) ========== */
  const distData = useMemo(() => {
    // Ensure clubs appear in defined bag order
    const map = new Map(tableRows.map(r => [r.club, r]));
    return [...map.values()].sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
  }, [tableRows]);

  /** ========== Render helpers ========== */

  const renderHighlights = () => {
    return (
      <Card title="Highlights (All Clubs)">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><div className="text-slate-500 text-xs">Longest Carry</div>
            <div className="text-lg font-semibold">
              {longestCarryShot ? `${longestCarryShot.CarryDistance_yds?.toFixed(1)} yds (${longestCarryShot.Club})` : "—"}
            </div>
          </div>
          <div><div className="text-slate-500 text-xs">Most Consistent Club</div>
            <div className="text-lg font-semibold">
              {mostConsistentClub ? `${mostConsistentClub.club} (σ ${mostConsistentClub.sd.toFixed(1)} yds)` : "—"}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-xs">Efficiency Score</div>
            <div className="text-lg font-semibold" title="Blended 0–100 score weighting Smash Factor and carry per mph (60/40). Tunable heuristic.">
              {efficiencyScore}
            </div>
          </div>
        </div>
      </Card>
    );
  };

  const renderGapping = () => {
    return (
      <Card title="Gapping Warnings (All Clubs)">
        <div className="text-sm">
          <div className="mb-2"><b>Big gaps &gt; {GAP_BIG_YDS} yds:</b> {gapWarnings.big.length || "None"}</div>
          {gapWarnings.big.map((g, i) => (
            <div key={`bg${i}`} className="text-slate-700">• {g.from} → {g.to}: {g.gap.toFixed(1)} yds</div>
          ))}
          <div className="mt-4 mb-2"><b>Tight gaps &lt; {GAP_TIGHT_YDS} yds:</b> {gapWarnings.tight.length || "None"}</div>
          {gapWarnings.tight.map((g, i) => (
            <div key={`tg${i}`} className="text-slate-700">• {g.from} → {g.to}: {g.gap.toFixed(1)} yds</div>
          ))}
        </div>
      </Card>
    );
  };

  const renderPR = () => {
    return (
      <Card title={`Personal Records${pr.club ? ` — ${pr.club}` : ""}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-slate-500 text-xs">PR Carry</div>
            <div className="text-lg font-semibold">
              {pr.carry != null ? `${pr.carry.toFixed(1)} yds (${pr.carryClub})` : "—"}
            </div>
          </div>
          <div><div className="text-slate-500 text-xs">PR Total</div>
            <div className="text-lg font-semibold">
              {pr.total != null ? `${pr.total.toFixed(1)} yds (${pr.totalClub})` : "—"}
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-slate-500 text-xs">Note</div>
            <div className="text-sm">
              PRs use the same timeframe/outlier settings as Highlights and ignore club selection (except to focus on one club).
            </div>
          </div>
        </div>
      </Card>
    );
  };

  const renderDistance = () => {
    return (
      <Card title="Distance Distribution by Club">
        <div style={{ width: "100%", height: 340 }}>
          <ResponsiveContainer>
            <BarChart data={distData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="club" />
              <YAxis />
              <Tooltip formatter={(v: any, n: any) => [typeof v === "number" ? v.toFixed(n === "avgSmash" ? 3 : 1) : v, n === "avgCarry" ? "Avg Carry" : n === "avgTotal" ? "Avg Total" : n]} />
              <Legend />
              <Bar dataKey="avgCarry" name="Avg Carry (yds)" fill={T.blue} />
              <Bar dataKey="avgTotal" name="Avg Total (yds)" fill={T.green} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    );
  };

  /** ========== Card registry (draggable wrappers) ========== */
  const renderByKey = (k: string) => {
    switch (k) {
      case "highlights":     return renderHighlights();
      case "warnings":       return renderGapping();
      case "personalRecords":return renderPR();
      case "distanceBox":    return renderDistance();
      // case "progress":    // (reserved for your progress-over-time card)
      // case "weaknesses":  // (reserved for weaknesses analysis)
      default:
        return <Card title="(empty)" />;
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      {insightsOrder.map((key) => (
        <div
          key={key}
          className={key === "distanceBox" ? "col-span-12" : "col-span-12 md:col-span-6"}
          draggable
          onDragStart={onDragStart(key)}
          onDragOver={onDragOver(key)}
          onDrop={onDrop(key)}
          style={{ cursor: "move" }}
          aria-label={`Drag to reorder ${key}`}
        >
          {renderByKey(key)}
        </div>
      ))}
    </div>
  );
}

/* ===== helpers ===== */
function carryStd(vals: number[]) {
  if (vals.length < 2) return 0;
  return stddev(vals);
}
