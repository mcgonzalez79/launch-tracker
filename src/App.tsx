import React, { useState, useEffect } from "react";
import { Theme as theme } from "./theme";
import { Card, Button, Toast } from "./components/UI";
import Filters from "./Filters";
import Dashboard from "./Dashboard";
import Insights from "./Insights";
import Journal from "./Journal";
import { Shot, parseCSVFile, parseXLSXFile } from "./utils";

export type Tab = "dashboard" | "insights" | "journal";

/* ----------------- Tab Button ----------------- */
function TabButton({
  theme,
  label,
  active,
  onClick,
}: {
  theme: typeof theme;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`px-4 py-2 rounded-t-md border-b-2 ${
        active
          ? "border-green-600 font-bold text-green-700"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
      style={{
        background: active ? theme.cardBg : theme.bg,
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/* ----------------- Main App ----------------- */
export default function App() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [cardOrder, setCardOrder] = useState<string[]>([]);
  const [excludeOutliers, setExcludeOutliers] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState<string | null>(null);

  /* Load from localStorage on mount */
  useEffect(() => {
    try {
      const stored = localStorage.getItem("shots");
      if (stored) setShots(JSON.parse(stored));
    } catch {
      console.warn("Failed to load shots from localStorage");
    }
  }, []);

  /* Save to localStorage whenever shots change */
  useEffect(() => {
    localStorage.setItem("shots", JSON.stringify(shots));
  }, [shots]);

  /* Handle file upload */
  async function handleFile(file: File) {
    try {
      let parsed: Shot[] = [];
      if (file.name.endsWith(".csv")) {
        parsed = await parseCSVFile(file);
      } else if (file.name.endsWith(".xlsx")) {
        parsed = await parseXLSXFile(file);
      }
      setShots((prev) => [...prev, ...parsed]);
      setToast(`Imported ${parsed.length} shots`);
    } catch (err) {
      console.error(err);
      setToast("Failed to parse file");
    }
  }

  async function loadSample() {
    const res = await fetch("/launch-tracker/sample.csv");
    const text = await res.text();
    const blob = new Blob([text], { type: "text/csv" });
    const file = new File([blob], "sample.csv", { type: "text/csv" });
    await handleFile(file);
  }

  function exportCSV() {
    if (shots.length === 0) return;
    const headers = Object.keys(shots[0]);
    const rows = shots.map((s) =>
      headers.map((h) => (s as any)[h] ?? "").join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shots.csv";
    a.click();
  }

  function deleteAll() {
    setShots([]);
    setToast("All data deleted");
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center"
      style={{ background: theme.bg }}
    >
      {/* centered container with max width */}
      <div className="w-full max-w-[1200px] mx-auto px-4 flex-1 flex flex-col">
        {/* Tabs */}
        <div className="flex space-x-2 border-b mb-4">
          <TabButton
            theme={theme}
            label="Dashboard"
            active={tab === "dashboard"}
            onClick={() => setTab("dashboard")}
          />
          <TabButton
            theme={theme}
            label="Insights"
            active={tab === "insights"}
            onClick={() => setTab("insights")}
          />
          <TabButton
            theme={theme}
            label="Journal"
            active={tab === "journal"}
            onClick={() => setTab("journal")}
          />
        </div>

        <div className="flex flex-1">
          {/* Left filters */}
          <div className="w-64 flex-shrink-0">
            <Filters
              shots={shots}
              setShots={setShots}
              handleFile={handleFile}
              loadSample={loadSample}
              exportCSV={exportCSV}
              deleteAll={deleteAll}
              excludeOutliers={excludeOutliers}
              setExcludeOutliers={setExcludeOutliers}
            />
          </div>

          {/* Main content */}
          <div className="flex-1 pl-4">
            {tab === "dashboard" && (
              <Dashboard
                shots={shots}
                cardOrder={cardOrder}
                setCardOrder={setCardOrder}
                theme={theme}
              />
            )}
            {tab === "insights" && (
              <Insights shots={shots} excludeOutliers={excludeOutliers} />
            )}
            {tab === "journal" && <Journal />}
          </div>
        </div>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
