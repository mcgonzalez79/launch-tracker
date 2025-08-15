import React, { useMemo } from "react";
import { Theme } from "./theme";
import { Card, KPI, Th, Td } from "./components/UI";
import { Shot } from "./utils";
import { fmtNum, orderIndex } from "./utils";

import {
  BarChart, Bar, CartesianGrid, Legend, ResponsiveContainer, Tooltip,
  XAxis, YAxis, Scatter, ScatterChart, ZAxis, ReferenceLine, Label
} from "recharts";

/* ================== Types ================== */
export type ClubRow = {
  club: string;
  count: number;
  avgCarry: number;
  avgTotal: number;
  // Carry SD was removed by request, Face-to-Path added:
  avgSmash: number;
  avgSpin: number;
  avgCS: number;
  avgBS: number;
  avgLA: number;
  avgFaceToPath?: number;
};

export type KPIs = {
  avgCarry?: number;
  avgTotal?: number;
  sdCarry?: number; // we still show "Carry Consistency" if you keep it, else remove
  avgSmash?: number;
  avgSpin?: number;
  avgCS?: number;
  avgBS?: number;
  avgLA?: number;
  shots: number;
  shape: string; // "Draw%/Fade%/Straight%"
};

type Props = {
  theme: Theme;
  kpis: KPIs;
  clubs: string[];                 // current (filtered) clubs in order
  filteredOutliers: Shot[];        // current dataset (filters + outlier toggle)
  tableRows: ClubRow[];            // aggregated per-club rows (same filter)
  clubPalette: string[];           // consistent palette (same as Filters)
};

/* ================== Component ================== */
export default function DashboardView({
  theme, kpis, clubs, filteredOutliers, tableRows, clubPalette
}: Props) {

  // Gap chart bar colors (two-color scheme)
  const CARRY_BAR = theme.brand;
  const TOTAL_BAR = theme.accent2; // distinct from carry

  // Build dispersion helper: find Y max to place 50-yd lines
  const dispersionYMax = useMemo(() => {
    const ys = filteredOutliers.map(s => s.CarryDistance_yds ?? 0);
    return ys.length ? Math.max(...ys, 50) : 200;
  }, [filteredOutliers]);

  const dispersionTargets = useMemo(() => {
    const max = Math.ceil(dispersionYMax / 50) * 50;
    const marks: number[] = [];
    for (let y = 50; y <= max; y += 50) marks.push(y);
    return marks;
  }, [dispersionYMax]);

  // Efficiency uses the filtered clubs directly (colors are matched by index here)
  return (
    <div className="grid grid-cols-12 gap-6">
      {/* KPI grid */}
      <section className="col-span-12">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KPI label="Avg Carry" value={fmtNum(kpis.avgCarry, 1, " yds")} color={theme.brand} />
          <KPI label="Avg Total" value={fmtNum(kpis.avgTotal, 1, " yds")} color={theme.accent2} />
          <KPI label="Carry Consistency" value={fmtNum(kpis.sdCarry, 1, " sd")} color={theme.accent1} />
          <KPI label="Avg Smash" value={fmtNum(kpis.avgSmash, 3, "")} color={theme.accent3} />
          <KPI label="Avg Spin" value={fmtNum(kpis.avgSpin, 0, " rpm")} color={theme.brandTint} />
          <KPI label="Shape (D/F/S)" value={kpis.shape} color={theme.muted} />

          {/* Speeds explicitly set to green as requested */}
          <KPI label="Avg Club Speed" value={fmtNum(kpis.avgCS, 1, " mph")} color={theme.brand} />
          <KPI label="Avg Ball Speed" value={fmtNum(kpis.avgBS, 1, " mph")} color={theme.brand} />
          <KPI label="Avg Launch" value={fmtNum(kpis.avgLA, 1, " °")} color={theme.accent1} />
          <KPI label="Shots" value={String(kpis.shots ?? 0)} color={theme.muted} />
        </div>
      </section>

      {/* Gap chart */}
      <section className="col-span-12">
        <Card theme={theme} title="Gap Chart — Carry vs Total by Club">
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={tableRows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
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
        </Card>
      </section>

      {/* Efficiency scatter */}
      <section className="col-span-12">
        <Card theme={theme} title="Efficiency — Club Speed vs Ball Speed (label: Smash)">
          <div style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 48, left: 64 }}>
                <CartesianGrid />
                <XAxis
                  type="number"
                  dataKey="ClubSpeed_mph"
                  name="Club Speed"
                  unit=" mph"
                  domain={[50, 'dataMax + 5']}   // start at 50 mph
                  tickMargin={10}
                >
                  <Label value="Club Speed (mph)" position="insideBottom" offset={-10} />
                </XAxis>
                <YAxis
                  type="number"
                  dataKey="BallSpeed_mph"
                  name="Ball Speed"
                  unit=" mph"
                  tickMargin={10}
                >
                  <Label value="Ball Speed (mph)" angle={-90} position="insideLeft" offset={-10} />
                </YAxis>

                <Tooltip formatter={(v: any, n: any) => [v, n]} />

                {/* Legend ABOVE plot with reserved height to avoid overlap */}
                <Legend
                  layout="horizontal"
                  verticalAlign="top"
                  align="center"
                  iconType="circle"
                  height={40}
                  wrapperStyle={{ paddingBottom: 4 }}
                />

                {clubs.map((c, i) => (
                  <Scatter
                    key={c}
                    name={c}
                    data={filteredOutliers.filter(s => s.Club === c)}
                    fill={clubPalette[i % clubPalette.length]}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      {/* Launch vs Spin bubble */}
      <section className="col-span-12">
        <Card theme={theme} title="Launch vs Spin — bubble size is Carry">
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 36, left: 56 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="LaunchAngle_deg" name="Launch Angle" unit=" °" tickMargin={10}>
                  <Label value="Launch Angle (°)" position="insideBottom" offset={-10} />
                </XAxis>
                <YAxis type="number" dataKey="SpinRate_rpm" name="Spin Rate" unit=" rpm" tickMargin={10}>
                  <Label value="Spin Rate (rpm)" angle={-90} position="insideLeft" offset={-10} />
                </YAxis>
                <ZAxis type="number" dataKey="CarryDistance_yds" range={[30, 380]} />
                <Tooltip formatter={(v: any, n: any) => [v, n]} />
                <Legend />
                {clubs.map((c, i) => (
                  <Scatter key={c} name={c} data={filteredOutliers.filter(s => s.Club === c)} fill={clubPalette[i % clubPalette.length]} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      {/* Dispersion */}
      <section className="col-span-12">
        <Card theme={theme} title="Dispersion — X: Deviation (yds), Y: Carry (yds)">
          <div style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 44, right: 16, bottom: 36, left: 56 }}>
                {/* Legend across the TOP, outside the plot area (reserved height) */}
                <Legend
                  layout="horizontal"
                  verticalAlign="top"
                  align="center"
                  iconType="circle"
                  height={36}
                  wrapperStyle={{ paddingBottom: 4 }}
                />

                <CartesianGrid />

                <XAxis
                  type="number"
                  dataKey="CarryDeviationDistance_yds"
                  name="Carry Deviation"
                  unit=" yds"
                  tickMargin={10}
                >
                  <Label value="Deviation Left (–) / Right (+) [yds]" position="insideBottom" offset={-10} />
                </XAxis>

                <YAxis
                  type="number"
                  dataKey="CarryDistance_yds"
                  name="Carry Distance"
                  unit=" yds"
                  domain={[50, 'dataMax + 10']}  // start at 50 yds low end
                  tickMargin={10}
                >
                  <Label value="Carry (yds)" angle={-90} position="insideLeft" offset={-10} />
                </YAxis>

                {/* Centerline */}
                <ReferenceLine x={0} stroke={theme.muted} />

                {/* 50-yard target lines */}
                {dispersionTargets.map((y) => (
                  <ReferenceLine key={y} y={y} stroke={theme.brandSoft} strokeDasharray="4 4" />
                ))}

                <Tooltip formatter={(v: any, n: any) => [v, n]} />

                {clubs.map((c, i) => (
                  <Scatter
                    key={c}
                    name={c}
                    data={filteredOutliers.filter(s => s.Club === c)}
                    fill={clubPalette[i % clubPalette.length]}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      {/* Club Averages table */}
      <section className="col-span-12">
        <Card theme={theme} title="Club Averages">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left">
                  <Th>Club</Th>
                  <Th>Shots</Th>
                  <Th>Avg Carry</Th>
                  <Th>Avg Total</Th>
                  <Th>Avg Smash</Th>
                  <Th>Avg Spin</Th>
                  <Th>Avg Club Spd</Th>
                  <Th>Avg Ball Spd</Th>
                  <Th>Avg Launch</Th>
                  <Th>Face-to-Path</Th>
                </tr>
              </thead>
              <tbody>
                {[...tableRows].sort((a, b) => orderIndex(a.club) - orderIndex(b.club)).map((r, idx) => {
                  return (
                    <tr key={r.club} className="border-t">
                      <Td>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-3 h-3 inline-block rounded-full"
                            style={{ background: clubPalette[idx % clubPalette.length] }}
                          />
                          {r.club}
                        </span>
                      </Td>
                      <Td>{r.count}</Td>
                      <Td>{r.avgCarry.toFixed(1)}</Td>
                      <Td>{r.avgTotal.toFixed(1)}</Td>
                      <Td>{r.avgSmash.toFixed(3)}</Td>
                      <Td>{Math.round(r.avgSpin)}</Td>
                      <Td>{r.avgCS.toFixed(1)}</Td>
                      <Td>{r.avgBS.toFixed(1)}</Td>
                      <Td>{r.avgLA.toFixed(1)}</Td>
                      <Td>{r.avgFaceToPath !== undefined ? r.avgFaceToPath.toFixed(2) : "-"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
