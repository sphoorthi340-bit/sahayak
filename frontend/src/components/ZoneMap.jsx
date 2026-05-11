// ─── SVG ZONE MAP ────────────────────────────────────────
// 4-zone (A/B/C/D) map for Panchayat dashboard.
// Zones highlight red when alerts come from that zone.

export default function ZoneMap({ zoneCounts = {} }) {
  const zones = [
    { id: "Mundakkai", x: 4, y: 4, w: 146, h: 96, label: "Mundakkai" },
    { id: "Chooralmala", x: 154, y: 4, w: 146, h: 96, label: "Chooralmala" },
    { id: "Attamala", x: 4, y: 104, w: 146, h: 96, label: "Attamala" },
    { id: "Noolpuzha", x: 154, y: 104, w: 146, h: 96, label: "Noolpuzha" },
  ];

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-gray-400 font-medium mb-3 uppercase tracking-wide">
        Zone Map
      </p>
      <svg
        viewBox="0 0 304 204"
        className="w-full rounded-xl overflow-hidden"
        style={{ background: "#1e293b" }}
      >
        {/* Grid lines for visual texture */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#334155" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="304" height="204" fill="url(#grid)" />

        {zones.map((zone) => {
          const count = zoneCounts[zone.id] || 0;
          const isActive = count > 0;

          return (
            <g key={zone.id}>
              {/* Zone background */}
              <rect
                x={zone.x}
                y={zone.y}
                width={zone.w}
                height={zone.h}
                rx="8"
                fill={isActive ? "#dc2626" : "#166534"}
                opacity={isActive ? 0.85 : 0.5}
                className={isActive ? "zone-alert" : ""}
                style={{ transition: "fill 0.5s ease, opacity 0.5s ease" }}
              />

              {/* Zone border */}
              <rect
                x={zone.x}
                y={zone.y}
                width={zone.w}
                height={zone.h}
                rx="8"
                fill="none"
                stroke={isActive ? "#fca5a5" : "#4ade80"}
                strokeWidth="1.5"
                opacity={0.6}
              />

              {/* Zone label */}
              <text
                x={zone.x + zone.w / 2}
                y={zone.y + zone.h / 2 - 8}
                textAnchor="middle"
                fill="white"
                fontSize="14"
                fontWeight="700"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {zone.label}
              </text>

              {/* Alert count or status */}
              <text
                x={zone.x + zone.w / 2}
                y={zone.y + zone.h / 2 + 14}
                textAnchor="middle"
                fill={isActive ? "#fecaca" : "#86efac"}
                fontSize="11"
                fontWeight="500"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {isActive ? `⚠ ${count} alert${count > 1 ? "s" : ""}` : "✓ Clear"}
              </text>

              {/* Pulse ring for active zones */}
              {isActive && (
                <circle
                  cx={zone.x + zone.w - 12}
                  cy={zone.y + 12}
                  r="5"
                  fill="#ef4444"
                  className="zone-alert"
                />
              )}
            </g>
          );
        })}

        {/* Center divider lines */}
        <line x1="152" y1="8" x2="152" y2="196" stroke="#475569" strokeWidth="1" strokeDasharray="4,4" />
        <line x1="8" y1="102" x2="296" y2="102" stroke="#475569" strokeWidth="1" strokeDasharray="4,4" />
      </svg>
    </div>
  );
}
