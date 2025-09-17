import React, { useMemo, useState } from "react";
import type { Theme } from "./theme";
import type { Shot, Goal } from "./utils";
import { Card } from "./components/UI";
import { isNum, mean } from "./utils";

type Props = {
  theme: Theme;
  goals: Goal[];
  shots: Shot[];
  clubs: string[];
  onAddGoal: (goal: Omit<Goal, 'id'>) => void;
  onDeleteGoal: (id: string) => void;
  goalOrder: string[];
  setGoalOrder: (order: string[]) => void;
  onDragStart: (key: string) => (e: React.DragEvent) => void;
  onDragOver: (key: string) => (e: React.DragEvent) => void;
  onDrop: (key: string) => (e: React.DragEvent) => void;
};

// --- Goal Metrics Definition ---
export const GOAL_METRICS: { key: keyof Shot, label: string, unit: string, higherIsBetter: boolean, agg: 'avg' | 'max' }[] = [
  { key: 'CarryDistance_yds', label: 'Average Carry Distance', unit: 'yds', higherIsBetter: true, agg: 'avg' },
  { key: 'TotalDistance_yds', label: 'Average Total Distance', unit: 'yds', higherIsBetter: true, agg: 'avg' },
  { key: 'CarryDistance_yds', label: 'Max Carry Distance', unit: 'yds', higherIsBetter: true, agg: 'max' },
  { key: 'TotalDistance_yds', label: 'Max Total Distance', unit: 'yds', higherIsBetter: true, agg: 'max' },
  { key: 'ClubSpeed_mph', label: 'Club Speed', unit: 'mph', higherIsBetter: true, agg: 'avg' },
  { key: 'BallSpeed_mph', label: 'Ball Speed', unit: 'mph', higherIsBetter: true, agg: 'avg' },
  { key: 'SmashFactor', label: 'Smash Factor', unit: '', higherIsBetter: true, agg: 'avg' },
  { key: 'Backspin_rpm', label: 'Backspin', unit: 'rpm', higherIsBetter: true, agg: 'avg' },
  { key: 'LaunchDirection_deg', label: 'Launch Direction', unit: '°', higherIsBetter: false, agg: 'avg' },
  { key: 'ApexHeight_yds', label: 'Apex Height', unit: 'yds', higherIsBetter: true, agg: 'avg' },
  { key: 'CarryDeviationDistance_yds', label: 'Carry Deviation', unit: 'yds', higherIsBetter: false, agg: 'avg' },
];

export default function GoalsView({ theme: T, goals, shots, clubs, onAddGoal, onDeleteGoal, goalOrder, onDragStart, onDragOver, onDrop }: Props) {
  const [isModalOpen, setModalOpen] = useState(false);

  const processedGoals = useMemo(() => {
    const goalMap = new Map(goals.map(g => [g.id, g]));
    return goalOrder
      .map(id => goalMap.get(id))
      .filter((g): g is Goal => !!g)
      .map(goal => {
        const relevantShots = shots.filter(s => {
          const value = s[goal.metric];
          return isNum(value) && (goal.club === 'All Clubs' || s.Club === goal.club);
        });

        const metricDef = GOAL_METRICS.find(m => m.key === goal.metric);
        if (!metricDef || relevantShots.length === 0) {
          return { ...goal, currentValue: goal.startValue, progress: 0 };
        }
        
        const values = relevantShots.map(s => metricDef.higherIsBetter ? (s[goal.metric] as number) : Math.abs(s[goal.metric] as number));
        const currentValue = metricDef.agg === 'max' ? Math.max(...values) : mean(values);
        
        let progress = 0;
        if (metricDef.higherIsBetter) {
          progress = ((currentValue - goal.startValue) / (goal.target - goal.startValue)) * 100;
        } else { // Lower is better
          progress = ((goal.startValue - currentValue) / (goal.startValue - goal.target)) * 100;
        }
        
        return { ...goal, currentValue, progress: Math.max(0, Math.min(progress, 100)) };
      });
  }, [goals, shots, goalOrder]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        {processedGoals.map(goal => (
          <div key={goal.id} draggable onDragStart={onDragStart(goal.id)} onDragOver={onDragOver(goal.id)} onDrop={onDrop(goal.id)}>
            <GoalCard goal={goal} theme={T} onDelete={() => onDeleteGoal(goal.id)} />
          </div>
        ))}
      </div>
      <button
        onClick={() => setModalOpen(true)}
        className="w-full p-4 rounded-xl border-2 border-dashed flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        style={{ borderColor: T.border, color: T.textDim }}
      >
        + Add New Goal
      </button>

      {isModalOpen && (
        <AddGoalModal
          theme={T}
          clubs={clubs}
          shots={shots}
          onClose={() => setModalOpen(false)}
          onAddGoal={(newGoal) => {
            onAddGoal(newGoal);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function GoalCard({ goal, theme: T, onDelete }: { goal: any, theme: Theme, onDelete: () => void }) {
  const metricDef = GOAL_METRICS.find(m => m.key === goal.metric);

  return (
    <Card title={goal.title} theme={T} right={<button onClick={onDelete} className="text-xs text-red-500 hover:text-red-400">Delete</button>}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Current: <strong>{goal.currentValue.toFixed(2)}{metricDef?.unit}</strong></span>
          <span>Target: <strong>{goal.target}{metricDef?.unit}</strong></span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
          <div
            className="h-4 rounded-full transition-all duration-500"
            style={{ width: `${goal.progress}%`, backgroundColor: T.brand }}
          ></div>
        </div>
        <div className="text-right text-xs" style={{color: T.textDim}}>Progress: {goal.progress.toFixed(2)}%</div>
      </div>
    </Card>
  );
}

function AddGoalModal({ theme: T, clubs, shots, onClose, onAddGoal }: { theme: Theme, clubs: string[], shots: Shot[], onClose: () => void, onAddGoal: (g: Omit<Goal, 'id'>) => void }) {
  const [title, setTitle] = useState("");
  const [metricKey, setMetricKey] = useState(GOAL_METRICS[0].key);
  const [agg, setAgg] = useState(GOAL_METRICS[0].agg);
  const [club, setClub] = useState("All Clubs");
  const [target, setTarget] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const metricDef = GOAL_METRICS.find(m => m.key === metricKey && m.agg === agg);
    if (!title || !target || !metricDef) return;

    const relevantShots = shots.filter(s => {
      const value = s[metricKey];
      return isNum(value) && (club === 'All Clubs' || s.Club === club);
    });
    
    const values = relevantShots.map(s => metricDef.higherIsBetter ? (s[metricKey] as number) : Math.abs(s[metricKey] as number));
    let startValue = 0;
    if (values.length > 0) {
      startValue = metricDef.agg === 'max' ? Math.max(...values) : mean(values);
    } else if (!metricDef.higherIsBetter) {
      // For "lower is better" goals with no data, start high
      startValue = metricDef.key.includes('Deviation') ? 50 : 10;
    }
    
    onAddGoal({
      title,
      metric: metricKey,
      club,
      target: Number(target),
      startValue,
    });
  };

  const availableMetrics = GOAL_METRICS.filter(m => m.key === metricKey);
  const selectedMetric = GOAL_METRICS.find(m => m.key === metricKey && m.agg === agg);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border shadow-lg overflow-hidden" style={{ background: T.panel, borderColor: T.border }} onClick={e => e.stopPropagation()}>
        <header className="p-4" style={{ borderBottom: `1px solid ${T.border}`}}>
          <h3 className="text-lg font-semibold">Add a New Goal</h3>
        </header>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Goal title (e.g., Driving Distance)" className="w-full p-2 rounded-md border" style={{ background: T.bg, color: T.text, borderColor: T.border }} required />
          <select value={metricKey} onChange={e => { setMetricKey(e.target.value as keyof Shot); setAgg('avg'); }} className="w-full p-2 rounded-md border" style={{ background: T.bg, color: T.text, borderColor: T.border }}>
            {Array.from(new Set(GOAL_METRICS.map(m => m.key))).map(key => {
              const metric = GOAL_METRICS.find(m => m.key === key)!;
              return <option key={key} value={key}>{metric.label.replace('Average ', '').replace('Max ', '')}</option>
            })}
          </select>
          {availableMetrics.length > 1 && (
             <select value={agg} onChange={e => setAgg(e.target.value as 'avg' | 'max')} className="w-full p-2 rounded-md border" style={{ background: T.bg, color: T.text, borderColor: T.border }}>
              {availableMetrics.map(m => <option key={m.agg} value={m.agg}>{m.agg === 'avg' ? 'Average' : 'Maximum'}</option>)}
            </select>
          )}
          <select value={club} onChange={e => setClub(e.target.value)} className="w-full p-2 rounded-md border" style={{ background: T.bg, color: T.text, borderColor: T.border }}>
            <option value="All Clubs">All Clubs</option>
            {clubs.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} placeholder={`Target (${selectedMetric?.unit || ''})`} className="w-full p-2 rounded-md border" style={{ background: T.bg, color: T.text, borderColor: T.border }} required />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border" style={{background: T.panelAlt, borderColor: T.border}}>Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-md border" style={{background: T.brand, color: T.white, borderColor: T.brand}}>Add Goal</button>
          </div>
        </form>
      </div>
    </div>
  );
}
