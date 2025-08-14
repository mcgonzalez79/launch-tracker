import React, { useMemo } from "react";
import { Theme } from "./theme";
import { Card } from "./components/UI";
import { Shot, ClubRow, mean, stddev, orderIndex } from "./utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label
} from "recharts";

type Props = {
  theme: Theme;

  /** Per-club averages for the current dashboard pool (respects club selection) */
  tableRows: ClubRow[];

  /** Pool that IGNORES club selection (but respects date/outlier filters) */
  filteredNoClubOutliers: Shot[];

  /** Full list of clubs */
  allClubs: string[];

  /** Currently selected clubs (from Filters) */
  selectedClubs: string[];

  /** Card ordering + DnD handlers (mirrors Dashboard) */
  insightsOrder: string[];
  onDragStart: (k: string) => (e: React.DragEvent) => void;
  onDragOver: (k: string) => (e: React.DragEvent) => void;
  onDrop: (k: string) => (e: React.DragEvent) => void;
};

const GAP_TIGHT_YDS = 12;
const GAP_BIG_YDS = 25;

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

  /** ========== GLOBAL aggregates (ignore club selection) ========== */

  // Local type only for Insights (includes sdCarry, which is NOT on ClubRow)
  type ClubAgg = ClubRow & { sdCarry: number };

  const rowsWithSd: ClubAgg[] = useMemo(() => {
    const byClub = new Map<string, Shot[]>();
    filteredNoClubOutliers.forEach((s) => {
      if (!byClub.has(s.Club)) byClub.set(s.Club, []);
      byClub.get(s.Club)!.push(s);
    });

    const rows: ClubAgg[] = [];
    for (const [club, arr] of byClub.entries()) {
      const grab = (sel: (s: Shot) => number | undefined) =>
        arr.map(sel).filter((x): x is number => x !== undefined);

      const carry = grab(s => s.CarryDistance_yds);
      const total = grab(s => s.TotalDistance_yds);
      const smash = grab(s => s.SmashFactor);
      const spin  = grab(s => s.SpinRate_rpm);
      const cs    = grab(s => s.ClubSpeed_mph);
      const bs    = grab(s => s.BallSpeed_mph);
      const la    = grab(s => s.LaunchAngle_deg);
      const f2p   = grab(s => (s.ClubFace_deg != null && s.ClubPath_deg != null ? s.ClubFace_deg - s.ClubPath_deg : undefined));

      const avg = (vals: number[]) => (vals.length ? mean(vals) : 0);

      rows.push({
        club,
        count: arr.length,
        avgCarry: avg(carry),
        avgTotal: avg(total),
        avgSmash: avg(smash),
        avgSpin:  avg(spin),
        avgCS:    avg(cs),
        avgBS:    avg(bs),
        avgLA:    avg(la),
        avgF2P:   avg(f2p),
        sdCarry:  carry.length >= 2 ? stddev(carry) : 0,
      });
    }

    return rows.sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
  }, [filteredNoClubOutliers]);

  const longestCarryShot = useMemo(() => {
    let best: Shot | undefined;
    for (const s of filteredNoClubOutliers) {
      const c = s.CarryDistance_yds;
      if (c == null) continue;
      if (!best || c > (best.CarryDistance_yds ?? -Infinity)) best = s;
    }
    return best;
  }, [filteredNoClubOutliers]);

  const mostConsistentClub = useMemo(() => {
    let best: { club: string; sd: number } | undefined;
    for (const r of rowsWithSd) {
      if (r.count >= 3 && (best == null || r.sdCarry < best.sd)) {
        best = { club: r.club, sd: r.sdCarry };
      }
    }
    return best;
  }, [rowsWithSd]);

  // Simple 0–100 efficiency (smash + carry per mph)
  const efficiencyScore = useMemo(() => {
    const pool = filteredNoClubOutliers;
    const smash = pool.map(s => s.SmashFactor).filter((x): x is number => x != null);
    const cs    = pool.map(s => s.ClubSpeed_mph).filter((x): x is number => x != null);
    const carry = pool.map(s => s.CarryDistance_yds).filter((x): x is number => x != null);
    if (!smash.length || !cs.length || !carry.length) return 0;

    const smashAvg = mean(smash);
    const carryPerMPH = mean(carry) / mean(cs);

    const sPart = Math.min(1, Math.max(0, (smashAvg - 1.1) / 0.5));
    const cPart = Math.min(1, Math.max(0, (carryPerMPH - 1.2) / 1.0));
    return Math.round(100 * (0.6 * sPart + 0.4 * cPart));
  }, [filteredNoClubOutliers]);

  /** ========== Personal Records (consistent with Highlights) ========== */
  const pr = useMemo(() => {
    let clubForPR: string | undefined;
    if (selectedClubs.length === 1) clubForPR = selectedClubs[0];
    else if (longestCarryShot) clubForPR = longestCarryShot.Club;

    const pool = clubForPR
      ? filteredNoClubOutliers.filter(s => s.Club === clubForPR)
      : filteredNoClubOutliers;

    let prCarry = -Infinity, prCarryClub = "—";
    let prTotal = -Infinity, prTotalClub = "—";
    for (const s of pool) {
      const c = s.CarryDistance_yds; const t = s.TotalDistance_yds;
      if (c != null && c > prCarry) { prCarry = c; prCarryClub = s.Club; }
      if (t != null && t > prTotal) { prTotal = t; prTotalClub = s.Club; }
    }

    return {
      club: clubForPR,
      carry: prCarry === -Infinity ? undefined : prCarry,
      carryClub: prCarryClub,
      total: prTotal === -Infinity ? undefined : prTotal,
      totalClub: prTotalClub,
    };
  }, [selectedClubs, filteredNoClubOutliers, longestCarryShot]);

  /** ========== Gapping warnings (global) ========== */
  const gapWarnings = useMemo(() => {
    const rows = rowsWithSd.filter(r => r.count >= 3);
    const tight: { from: string; to: string; gap: number }[] = [];
    const big: { from: string; to: string; gap: number }[] = [];
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1], curr = rows[i];
      const gap = Math.abs(curr.avgCarry - prev.avgCarry);
      if (gap < GAP_TIGHT_YDS) tight.push({ from: prev.club, to: curr.club, gap });
      if (gap > GAP_BIG_YDS) big.push({ from: prev.club, to: curr.club, gap });
    }
    return { tight, big };
  }, [rowsWithSd]);

  /** ========== Distance Distribution (uses current dashboard rows) ========== */
  const distData = useMemo(() => {
    const map = new Map(tableRows.map(r => [r.club, r]));
    return [...map.values()].sort((a, b) => orderIndex(a.club) - orderIndex(b.club));
  }, [tableRows]);

  /** ========== Renderers ========== */

  const renderHighlights = () => (
    <Card theme={T} title="Highlights (All Clubs)">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-slate-500 text-xs">Longest Carry</div>
          <div className="text-lg font-semibold">
            {longestCarryShot
              ? `${longestCarryShot.CarryDistance_yds?.toFixed(1)} yds (${longestCarryShot.Club})`
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500 text-xs">Most Consistent Club</div>
          <div className="text-lg font-semibold">
            {mostConsistentClub
              ? `${mostConsistentClub.club} (σ ${mostConsistentClub.sd.toFixed(1)} yds)`
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500 text-xs">Efficiency Score</div>
          <div
            className="text-lg font-semibold"
            title="Blended 0–100 score weighting Smash Factor and Carry-per-MPH (60/40)."
          >
            {efficiencyScore}
          </div>
        </div>
      </div>
    </Card>
  );

  const renderGapping = () => (
    <Card theme={T} title="Gapping Warnings (All Clubs)">
      <div className="text-sm">
        <div className="mb-2">
          <b>Big gaps &gt; {GAP_BIG_YDS} yds:</b> {gapWarnings.big.length || "None"}
        </div>
        {gapWarnings.big.map((g, i) => (
          <div key={`bg${i}`} className="text-slate-700">• {g.from} → {g.to}: {g.gap.toFixed(1)} yds</div>
        ))}
        <div className="mt-4 mb-2">
          <b>Tight gaps &lt; {GAP_TIGHT_YDS} yds:</b> {gapWarnings.tight.length || "None"}
        </div>
        {gapWarnings.tight.map((g, i) => (
          <div key={`tg${i}`} className="text-slate-700">• {g.from} → {g.to}: {g.gap.toFixed(1)} yds</div>
        ))}
      </div>
    </Card>
  );

  const renderPR = () => (
    <Card theme={T} title={`Personal Records${pr.club ? ` — ${pr.club}` : ""}`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-slate-500 text-xs">PR Carry</div>
          <div className="text-lg font-semibold">
            {pr.carry != null ? `${pr.carry.toFixed(1)} yds (${pr.carryClub})` : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500 text-xs">PR Total</div>
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

  const renderDistance = () => (
    <Card theme={T} title="Distance Distribution by Club">
      <div style={{ width: "100%", height: 340 }}>
        <ResponsiveContainer>
          <BarChart data={distData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="club" />
            <YAxis />
            <Tooltip
              formatter={(v: any, n: any) => [
                typeof v === "number" ? v.toFixed(n === "avgSmash" ? 3 : 1) : v,
                n === "avgCarry" ? "Avg Carry" : n === "avgTotal" ? "Avg Total" : n
              ]}
            />
            <Legend />
            {/* Two fixed colors to avoid missing Theme tokens */}
            <Bar dataKey="avgCarry" name="Avg Carry (yds)" fill="#3A86FF" />
            <Bar dataKey="avgTotal" name="Avg Total (yds)" fill="#2ECC71" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );

  /** Registry */
  const renderByKey = (k: string) => {
    switch (k) {
      case "highlights":      return renderHighlights();
      case "warnings":        return renderGapping();
      case "personalRecords": return renderPR();
      case "distanceBox":     return renderDistance();
      // case "progress":
      // case "weaknesses":
      default:
        return (
          <Card theme={T} title="(empty)">
            <div className="text-sm text-slate-500">Coming soon</div>
          </Card>
        );
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
