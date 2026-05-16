// NodeHealthBar — Village Heartbeat Display
// Shows active/lost nodes from /nodes/status

import { useState, useEffect, useCallback } from "react";

export default function NodeHealthBar() {
  const [nodes, setNodes] = useState([]);

  const fetchNodes = useCallback(async () => {
    try {
      const r = await fetch("/nodes/status");
      if (r.ok) { const d = await r.json(); setNodes(d.nodes || []); }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchNodes();
    const id = setInterval(fetchNodes, 15000);
    return () => clearInterval(id);
  }, [fetchNodes]);

  const active = nodes.filter(n => n.status === "active").length;
  const lost   = nodes.filter(n => n.status === "lost").length;
  const total  = nodes.length;

  if (total === 0) return null;

  const health = lost === 0 ? "GOOD" : lost <= 1 ? "DEGRADED" : "CRITICAL";
  const healthColor = { GOOD: "text-green-600", DEGRADED: "text-yellow-600", CRITICAL: "text-red-600" }[health];

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-gray-800 text-sm flex items-center gap-2">
          <span>📡</span> Mesh Heartbeat
        </p>
        <span className={`text-xs font-bold ${healthColor}`}>
          {health}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-green-50 rounded-xl p-2 text-center">
          <p className="text-xl font-black text-green-600">{active}</p>
          <p className="text-[10px] text-green-500 font-medium">ACTIVE</p>
        </div>
        <div className="bg-red-50 rounded-xl p-2 text-center">
          <p className="text-xl font-black text-red-500">{lost}</p>
          <p className="text-[10px] text-red-400 font-medium">LOST</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-2 text-center">
          <p className="text-xl font-black text-gray-700">{total}</p>
          <p className="text-[10px] text-gray-400 font-medium">TOTAL</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
        {nodes.map(n => (
          <div key={n.node_id} className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${n.status === "active" ? "bg-green-500" : "bg-red-400"}`} />
            <span className="font-medium text-gray-700 truncate flex-1">{n.node_id}</span>
            <span className="text-gray-400">🔋{n.battery_pct}%</span>
            <span className="text-gray-400">RSSI {n.rssi}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
