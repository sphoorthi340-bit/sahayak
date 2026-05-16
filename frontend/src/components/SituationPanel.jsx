// SituationPanel — AI Village Voice
// Calls /situation and displays Gemma's village-wide situational analysis

import { useState, useEffect, useCallback } from "react";

const SEV_COLOR = {
  critical: "text-red-600 bg-red-50 border-red-200",
  high:     "text-orange-600 bg-orange-50 border-orange-200",
  medium:   "text-yellow-600 bg-yellow-50 border-yellow-200",
  low:      "text-green-600 bg-green-50 border-green-200",
  none:     "text-gray-500 bg-gray-50 border-gray-200",
};

export default function SituationPanel() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);

  const fetch_situation = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/situation?limit=50");
      if (r.ok) { setData(await r.json()); setLastFetch(new Date()); }
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch_situation();
    const id = setInterval(fetch_situation, 60000); // refresh every 60s
    return () => clearInterval(id);
  }, [fetch_situation]);

  const sevClass = SEV_COLOR[data?.max_severity] || SEV_COLOR.none;

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <p className="font-bold text-sm text-white">AI Village Voice</p>
          <span className="text-[10px] bg-blue-500 px-2 py-0.5 rounded-full font-bold uppercase">Gemma 4</span>
        </div>
        <button
          onClick={fetch_situation}
          disabled={loading}
          className="text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-40"
        >
          {loading ? "Analysing..." : "↺ Refresh"}
        </button>
      </div>

      {loading && !data && (
        <div className="flex items-center gap-2 py-4 text-slate-400 text-sm">
          <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
          Gemma is reading the mesh...
        </div>
      )}

      {data && (
        <>
          {/* Severity badge */}
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold mb-3 ${sevClass}`}>
            {data.max_severity?.toUpperCase() || "NO"} SEVERITY · {data.alert_count} alerts
          </div>

          {/* AI analysis text */}
          <p className="text-slate-200 text-sm leading-relaxed mb-3 whitespace-pre-line">
            {data.analysis}
          </p>

          {/* Type breakdown pills */}
          {data.type_breakdown && Object.keys(data.type_breakdown).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(data.type_breakdown)
                .sort(([,a],[,b]) => b - a)
                .map(([type, count]) => (
                  <span key={type} className="text-[11px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-medium">
                    {type}: {count}
                  </span>
                ))}
            </div>
          )}

          {lastFetch && (
            <p className="text-[10px] text-slate-500 mt-2">
              Last analysis: {lastFetch.toLocaleTimeString()}
            </p>
          )}
        </>
      )}
    </div>
  );
}
