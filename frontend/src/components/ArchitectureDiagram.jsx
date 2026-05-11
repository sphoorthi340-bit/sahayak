// ─── ARCHITECTURE DIAGRAM ────────────────────────────────
// Animated SVG: ESP32 → ESP-NOW → Base Station → USB → Laptop → WiFi → Phone
// Dark background, flowing dots along paths, clickable tooltips.

import { useState } from "react";

const NODES = [
  { id: "esp32",  x: 40,  y: 100, icon: "📡", label: "ESP32\nField Node",   tip: "Detects hazards via sensors (flood, cyclone, etc.) and transmits alerts over ESP-NOW mesh radio." },
  { id: "radio",  x: 155, y: 100, icon: "〰️", label: "ESP-NOW\nRadio",       tip: "Long-range mesh protocol — works without WiFi, towers, or internet. 480m range per hop." },
  { id: "base",   x: 270, y: 100, icon: "🖥️", label: "Base\nStation",       tip: "ESP32 base station receives all mesh alerts and forwards them over USB serial to the laptop." },
  { id: "usb",    x: 385, y: 100, icon: "🔌", label: "USB\nSerial",          tip: "Wired USB connection — zero network dependency. Transfers JSON alerts to FastAPI backend." },
  { id: "laptop", x: 500, y: 100, icon: "💻", label: "Laptop +\nGemma AI",   tip: "Runs FastAPI + Gemma 3 1B locally via Ollama. Generates role-specific instructions in 3 languages." },
  { id: "wifi",   x: 615, y: 100, icon: "📶", label: "Local\nWiFi",          tip: "Phone connects to laptop's hotspot — no internet needed. WebSocket push for instant updates." },
  { id: "phone",  x: 730, y: 100, icon: "📱", label: "Phone\n3 Views",       tip: "Samsung phone runs the React PWA. Shows Citizen, Panchayat Leader, and Responder views." },
];

const PATHS = [
  { from: "esp32",  to: "radio"  },
  { from: "radio",  to: "base"   },
  { from: "base",   to: "usb"    },
  { from: "usb",    to: "laptop" },
  { from: "laptop", to: "wifi"   },
  { from: "wifi",   to: "phone"  },
];

export default function ArchitectureDiagram() {
  const [tooltip, setTooltip] = useState(null);

  const nodeMap = {};
  NODES.forEach(n => { nodeMap[n.id] = n; });

  return (
    <div className="bg-slate-900 rounded-2xl p-4 shadow-lg overflow-hidden">
      <p className="text-xs text-slate-400 font-medium mb-3 uppercase tracking-wide">
        System Architecture
      </p>
      <div className="overflow-x-auto hazard-pills">
        <svg viewBox="0 0 780 200" className="w-full" style={{ minHeight: "160px" }}>
          <defs>
            {/* Animated dot along path */}
            <circle id="dot" r="3" fill="#22d3ee" />

            {/* Glow filter */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Connection lines with animated dots */}
          {PATHS.map((path, i) => {
            const from = nodeMap[path.from];
            const to = nodeMap[path.to];
            const x1 = from.x + 20;
            const x2 = to.x - 10;
            const y = 95;
            const pathId = `path-${i}`;

            return (
              <g key={pathId}>
                {/* Line */}
                <line
                  x1={x1} y1={y} x2={x2} y2={y}
                  stroke="#334155" strokeWidth="2" strokeDasharray="6,4"
                />
                {/* Animated dot */}
                <circle r="3" fill="#22d3ee" filter="url(#glow)">
                  <animateMotion
                    dur={`${1.5 + i * 0.2}s`}
                    repeatCount="indefinite"
                    path={`M${x1},${y} L${x2},${y}`}
                  />
                </circle>
                {/* Second dot offset */}
                <circle r="2" fill="#818cf8" opacity="0.7">
                  <animateMotion
                    dur={`${1.5 + i * 0.2}s`}
                    repeatCount="indefinite"
                    begin={`${0.7 + i * 0.1}s`}
                    path={`M${x1},${y} L${x2},${y}`}
                  />
                </circle>
              </g>
            );
          })}

          {/* Nodes */}
          {NODES.map((node) => (
            <g
              key={node.id}
              style={{ cursor: "pointer" }}
              onClick={() => setTooltip(tooltip === node.id ? null : node.id)}
            >
              {/* Node background circle */}
              <circle
                cx={node.x}
                cy={95}
                r="22"
                fill={tooltip === node.id ? "#1e3a5f" : "#1e293b"}
                stroke={tooltip === node.id ? "#38bdf8" : "#475569"}
                strokeWidth="1.5"
              />

              {/* Icon */}
              <text
                x={node.x}
                y={99}
                textAnchor="middle"
                fontSize="16"
                dominantBaseline="central"
              >
                {node.icon}
              </text>

              {/* Label (two lines) */}
              {node.label.split("\n").map((line, li) => (
                <text
                  key={li}
                  x={node.x}
                  y={135 + li * 15}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {line}
                </text>
              ))}
            </g>
          ))}

          {/* Tooltip */}
          {tooltip && (() => {
            const node = nodeMap[tooltip];
            if (!node) return null;
            // Position tooltip above node, clamped to SVG bounds
            const tipX = Math.max(120, Math.min(660, node.x));
            const tipW = 240;
            return (
              <g className="animate-fade-slide-in">
                <rect
                  x={tipX - tipW / 2}
                  y={5}
                  width={tipW}
                  height="80"
                  rx="8"
                  fill="#0f172a"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  opacity="0.95"
                />
                <foreignObject
                  x={tipX - tipW / 2 + 8}
                  y={8}
                  width={tipW - 16}
                  height="74"
                >
                  <p
                    xmlns="http://www.w3.org/1999/xhtml"
                    style={{
                      color: "#f8fafc",
                      fontSize: "11px",
                      lineHeight: "1.4",
                      fontFamily: "Inter, system-ui, sans-serif",
                      margin: 0,
                      padding: "4px 0",
                    }}
                  >
                    {node.tip}
                  </p>
                </foreignObject>
              </g>
            );
          })()}
        </svg>
      </div>
      <p className="text-center text-[12px] text-slate-500 mt-2 font-medium">Tap any node for details</p>
    </div>
  );
}
