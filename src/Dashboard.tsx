import React, { useMemo } from "react";
import { Theme } from "./theme";
import { Shot, ClubRow } from "./utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, ReferenceLine, Label
} from "recharts";

type Props = {
  theme: Theme;
  clubs: string[];
  tableRows: ClubRow[];
  filteredOutliers: Shot[];
  clubColorOf: (club: string) => string;
};

export default function DashboardView({
  theme, clubs, tableRows, filteredOutliers, clubColorOf
}: Props) {

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

    const mean = (a: number[]) => a.reduce((p, c) => p + c, 0) / a.length || 0;
    const sd = (a: number[]) => {
      if (a.length < 2) return 0;
      const m = mean(a);
      return Math.sqrt(a.reduce((acc, v) => acc + (v - m) ** 2, 0) / a.length);
    };

    const draw = filteredOutliers.filter(s => (s.SpinAxis_deg ?? 0) < -2).length;
    const fade = filteredOutliers.filter(s => (s.SpinAxis_deg ?? 0) > 2).length;
    const shotsN = filteredOutliers.length;
    const straight = shotsN - draw - fade;
    const pct = (n: number) => (shotsN ? `${Math.round((n / shotsN) * 100)}%` : "0%");

    return {
      avgCarry: carry.length ? mean(carry) : undefined,
      avgTotal: total.length ? mean(total) : undefined,
      sdCarry: carry.length ? sd(carry) : undefined,
      avgSmash: smash.length ? mean(smash) : undefined,
      avgSpin: spin.length ? mean(spin) : undefined,
      avgCS: cs.length ? mean(cs) : undefined,
      avgBS: bs.length ? mean(bs) : undefined,
      avgLA: la.length ? mean(la) : undefined,
      shape: `${pct(draw)}/${pct(fade)}/${pct(straight)}`,
      shots: shotsN,
    };
  }, [filteredOutliers]);

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* KPIs */}
      <div className="col-span-12">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KPI label="Avg Carry" value={fmtNum(kpis.avgCarry, 1, " yds")} color={theme.kpiCarry} />
          <KPI label="Avg Total" value={fmtNum(kpis.avgTotal, 1, " yds")} color={theme.kpiTotal} />
          <KPI label="Carry Consistency" value={fmtNum(kpis.sdCarry, 1, " sd")} color={theme.kpiSmash} />
          <KPI label="Avg Smash" value={fmtNum(kpis.avgSmash, 3, "")} color={theme.kpiSmash} />
          <KPI label="Avg Spin" value={fmtNum(kpis.avgSpin, 0, " rpm")} color={theme.kpiSpin} />
          <KPI label="Shape (D/F/S)" value={kpis.shape} color={theme.kpiNeutral} />
          <KPI label="Avg Club Speed" value={fmtNum(kpis.avgCS, 1, " mph")} color={theme.kpiCarry} />
          <KPI label="Avg Ball Speed" value={fmtNum(kpis.avgBS, 1, " mph")} color={theme.kpiTotal} />
          <KPI label="Avg Launch" value={fmtNum(kpis.avgLA, 1, " °")} color={theme.kpiSmash} />
          <KPI label="Shots" value={String(kpis.shots ?? 0)} color={theme.kpiNeutral} />
        </div>
      </div>

      {/* Gap chart */}
      <Card title="Gap Chart — Carry vs Total by Club" theme={theme} className="col-span-12">
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={tableRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="club" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgCarry" name="Carry (avg)" fill={theme.kpiCarry} />
              <Bar dataKey="avgTotal" name="Total (avg)" fill={theme.kpiTotal} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Efficiency scatter */}
      <Card title="Efficiency — Club Speed vs Ball Speed (per club)" theme={theme} className="col-span-12">
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
              <Legend />
              {clubs.map((c) => (
                <Scatter key={c} name={c} data={filteredOutliers.filter(s => s.Club === c)} fill={clubColorOf(c)} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Launch vs Spin bubble */}
      <Card title="Launch vs Spin — bubble size is Carry" theme={theme} className="col-span-12">
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
              <Legend />
              {clubs.map((c) => (
                <Scatter key={c} name={c} data={filteredOutliers.filter(s => s.Club === c)} fill={clubColorOf(c)} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Dispersion */}
      <Card title="Dispersion — X: Deviation (yds), Y: Carry (yds)" theme={theme} className="col-span-12">
        <div style={{ width: "100%", height: 340 }}>
          <ResponsiveContainer>
            <ScatterChart>
              <CartesianGrid />
              <XAxis type="number" dataKey="CarryDeviationDistance_yds" name="Carry Deviation" unit=" yds" domain={["auto", "auto"]}>
                <Label value="Deviation Left (–) / Right (+) [yds]" position="insideBottom" offset={-5} />
              </XAxis>
              <YAxis type="number" dataKey="CarryDistance_yds" name="Carry Distance" unit=" yds" domain={[50, "auto"]}>
                <Label value="Carry (yds)" angle={-90} position="insideLeft" />
              </YAxis>

              {/* Flags / 50-yd bands */}
              <ReferenceLine y={50} stroke={theme.grid} />
              <ReferenceLine y={100} stroke={theme.grid} />
              <ReferenceLine y={150} stroke={theme.grid} />
              <ReferenceLine y={200} stroke={theme.grid} />
              <ReferenceLine y={250} stroke={theme.grid} />
              <ReferenceLine y={300} stroke={theme.grid} />
              <ReferenceLine x={0} stroke={theme.textDim} />

              <Tooltip formatter={(v: any, n: any) => [v, n]} />
              <Legend />
              {clubs.map((c) => (
                <Scatter key={c} name={c} data={filteredOutliers.filter(s => s.Club === c)} fill={clubColorOf(c)} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Club Averages table */}
      <Card title="Club Averages" theme={theme} className="col-span-12">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: "#64748b" }}>
                <Th>Club</Th>
                <Th>Shots</Th>
                <Th>Avg Carry</Th>
                <Th>Avg Total</Th>
                <Th>Carry SD</Th>
                <Th>Avg Smash</Th>
                <Th>Avg Spin</Th>
                <Th>Avg Club Spd</Th>
                <Th>Avg Ball Spd</Th>
                <Th>Avg Launch</Th>
                <Th>Face-to-Path</Th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, idx) => {
                const prev = idx > 0 ? tableRows[idx - 1] : undefined;
                const warnGap = prev ? Math.abs(r.avgCarry - prev.avgCarry) < 12 : false;
                return (
                  <tr key={r.club} className="border-t" style={{ borderColor: theme.border }}>
                    <Td>
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-3 inline-block rounded-full" style={{ background: clubColorOf(r.club) }} />
                        {r.club}
                      </span>
                    </Td>
                    <Td>{r.count}</Td>
                    <Td style={{ color: warnGap ? "#EF476F" as const : undefined }}>{r.avgCarry.toFixed(1)}</Td>
                    <Td>{r.avgTotal.toFixed(1)}</Td>
                    <Td>{((r as any).sdCarry ?? 0).toFixed ? (r as any).sdCarry.toFixed(1) : (r as any).sdCarry || "0.0"}</Td>
                    <Td>{r.avgSmash.toFixed(3)}</Td>
                    <Td>{Math.round(r.avgSpin)}</Td>
                    <Td>{r.avgCS.toFixed(1)}</Td>
                    <Td>{r.avgBS.toFixed(1)}</Td>
                    <Td>{r.avgLA.toFixed(1)}</Td>
                    <Td>{(r as any).avgF2P !== undefined ? (r as any).avgF2P.toFixed(2) : "-"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ---------- UI bits ---------- */
function Card({
  theme, title, className, children
}: { theme: Theme; title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl p-4 shadow ${className || ""}`} style={{ background: theme.cardBg }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-wide" style={{ color: theme.text }}>{title}</h2>
        <div className="h-1 rounded-full w-24" style={{ background: `linear-gradient(90deg, ${theme.kpiCarry}, ${theme.kpiTotal})` }} />
      </div>
      {children}
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl p-3 shadow text-sm" style={{ background: "#ffffff" }}>
      <div style={{ color: "#64748b" }}>{label}</div>
      <div className="mt-1 text-lg font-semibold" style={{ color }}>{value || "-"}</div>
    </div>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th className="py-2 pr-4" style={style}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td className="py-2 pr-4" style={style}>{children}</td>;
}

/* Helpers */
function fmtNum(v: number | undefined, fixed: number, suffix: string) {
  return v === undefined ? "-" : `${v.toFixed(fixed)}${suffix}`;
}
