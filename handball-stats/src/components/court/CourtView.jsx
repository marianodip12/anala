/**
 * CourtView – SVG handball half-court, 8 selectable zones + 7m badge.
 *
 * Zones:
 *   extreme_left   – Ext. Izq. (inner, beside 6m area)
 *   lateral_left   – Lat. Izq. (area → 9m arc)
 *   center_above   – Centro (area → 9m arc)
 *   lateral_right  – Lat. Der. (area → 9m arc)
 *   extreme_right  – Ext. Der. (inner, beside 6m area)
 *   near_left      – Cerca Izq. (below 9m arc)
 *   near_center    – Pivote (below 9m arc)
 *   near_right     – Cerca Der. (below 9m arc)
 *   7m             – 7m badge
 */

function zFill(id, selected, heatmap, maxHeat) {
  if (selected === id) return 'rgba(200,168,42,0.75)'
  const heat = maxHeat > 0 ? (heatmap[id] ?? 0) / maxHeat : 0
  if (heat > 0) return `rgba(239,100,97,${0.1 + heat * 0.5})`
  return 'transparent'
}

export default function CourtView({
  selectedZone,
  onZoneSelect,
  heatmap = {},
  className = '',
}) {
  const maxHeat = Math.max(0, ...Object.values(heatmap))
  const click   = (id) => onZoneSelect?.(selectedZone === id ? null : id)
  const f       = (id) => zFill(id, selectedZone, heatmap, maxHeat)
  const sel     = (id) => selectedZone === id

  return (
    <div className={`relative w-full h-full select-none ${className}`}>
      <svg
        viewBox="0 0 360 300"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          <clipPath id="cp-aL"><path d="M 65 0 L 148 0 L 148 174 Q 106 158 65 132 Z"/></clipPath>
          <clipPath id="cp-aC"><path d="M 148 0 L 212 0 L 212 174 L 148 174 Z"/></clipPath>
          <clipPath id="cp-aR"><path d="M 212 0 L 295 0 L 295 132 Q 254 158 212 174 Z"/></clipPath>
          <clipPath id="cp-bL"><path d="M 65 132 Q 106 158 148 174 L 148 300 L 65 300 Z"/></clipPath>
          <clipPath id="cp-bC"><path d="M 148 174 L 212 174 L 212 300 L 148 300 Z"/></clipPath>
          <clipPath id="cp-bR"><path d="M 212 174 Q 254 158 295 132 L 295 300 L 212 300 Z"/></clipPath>
        </defs>

        {/* Background */}
        <rect width="360" height="300" fill="#0b1a2e" />

        {/* ── Zone fills ── */}

        {/* Zone 1 – Extremo Izq */}
        <rect onClick={() => click('extreme_left')} style={{ cursor: 'pointer' }}
          x="0" y="0" width="65" height="117"
          fill={f('extreme_left')}
          stroke={sel('extreme_left') ? '#c8a82a' : 'transparent'} strokeWidth="2" />

        {/* Zone 2 – Lateral Izq (above 9m) */}
        <rect onClick={() => click('lateral_left')} style={{ cursor: 'pointer' }}
          x="65" y="0" width="83" height="300" clipPath="url(#cp-aL)"
          fill={f('lateral_left')}
          stroke={sel('lateral_left') ? '#c8a82a' : 'transparent'} strokeWidth="2" />

        {/* Zone 3 – Centro (above 9m) */}
        <rect onClick={() => click('center_above')} style={{ cursor: 'pointer' }}
          x="148" y="0" width="64" height="300" clipPath="url(#cp-aC)"
          fill={f('center_above')}
          stroke={sel('center_above') ? '#c8a82a' : 'transparent'} strokeWidth="2" />

        {/* Zone 4 – Lateral Der (above 9m) */}
        <rect onClick={() => click('lateral_right')} style={{ cursor: 'pointer' }}
          x="212" y="0" width="83" height="300" clipPath="url(#cp-aR)"
          fill={f('lateral_right')}
          stroke={sel('lateral_right') ? '#c8a82a' : 'transparent'} strokeWidth="2" />

        {/* Zone 5 – Extremo Der */}
        <rect onClick={() => click('extreme_right')} style={{ cursor: 'pointer' }}
          x="295" y="0" width="65" height="117"
          fill={f('extreme_right')}
          stroke={sel('extreme_right') ? '#c8a82a' : 'transparent'} strokeWidth="2" />

        {/* Zone 7 – Cerca Izq (below 9m) */}
        <rect onClick={() => click('near_left')} style={{ cursor: 'pointer' }}
          x="65" y="0" width="83" height="300" clipPath="url(#cp-bL)"
          fill={f('near_left')}
          stroke={sel('near_left') ? '#c8a82a' : 'transparent'} strokeWidth="2" />

        {/* Zone 8 – Pivote (below 9m) */}
        <rect onClick={() => click('near_center')} style={{ cursor: 'pointer' }}
          x="148" y="0" width="64" height="300" clipPath="url(#cp-bC)"
          fill={f('near_center')}
          stroke={sel('near_center') ? '#c8a82a' : 'transparent'} strokeWidth="2" />

        {/* Zone 9 – Cerca Der (below 9m) */}
        <rect onClick={() => click('near_right')} style={{ cursor: 'pointer' }}
          x="212" y="0" width="83" height="300" clipPath="url(#cp-bR)"
          fill={f('near_right')}
          stroke={sel('near_right') ? '#c8a82a' : 'transparent'} strokeWidth="2" />

        {/* ── Court lines (on top of fills) ── */}

        {/* Blue 6m area */}
        <path d="M 0 0 Q 180 210 360 0 L 360 -2 L 0 -2 Z" fill="#1a3d7a" opacity="0.85" />
        {/* 6m arc */}
        <path d="M 0 0 Q 180 210 360 0" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        {/* 9m dashed arc */}
        <path d="M 0 65 Q 180 290 360 65"
          fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="10,7" />

        {/* Vertical dividers starting from arc */}
        <line x1="65"  y1="62"  x2="65"  y2="300" stroke="#ffffff" strokeWidth="1.5" opacity="0.45" />
        <line x1="148" y1="102" x2="148" y2="300" stroke="#ffffff" strokeWidth="1.5" opacity="0.45" />
        <line x1="212" y1="102" x2="212" y2="300" stroke="#ffffff" strokeWidth="1.5" opacity="0.45" />
        <line x1="295" y1="62"  x2="295" y2="300" stroke="#ffffff" strokeWidth="1.5" opacity="0.45" />

        {/* Heatmap counts */}
        {maxHeat > 0 && Object.entries({
          extreme_left:  { x: 32,  y: 80  },
          lateral_left:  { x: 106, y: 80  },
          center_above:  { x: 180, y: 65  },
          lateral_right: { x: 254, y: 80  },
          extreme_right: { x: 328, y: 80  },
          near_left:     { x: 106, y: 210 },
          near_center:   { x: 180, y: 240 },
          near_right:    { x: 254, y: 210 },
        }).map(([id, { x, y }]) => {
          const v = heatmap[id]
          if (!v) return null
          return (
            <text key={`h-${id}`} x={x} y={y} textAnchor="middle"
              fill="#fff" fontSize="16" fontWeight="bold" fontFamily="Arial,sans-serif"
              style={{ pointerEvents: 'none' }}>
              {v}
            </text>
          )
        })}

        {/* ── 7m badge ── */}
        <g onClick={() => click('7m')} style={{ cursor: 'pointer' }}>
          <rect x="148" y="125" width="64" height="24" rx="12"
            fill={sel('7m') ? '#c8a82a' : '#ffffff'} />
          <text x="180" y="141" textAnchor="middle"
            fill={sel('7m') ? '#fff' : '#0b1a2e'}
            fontFamily="Arial,sans-serif" fontSize="12" fontWeight="800"
            style={{ pointerEvents: 'none' }}>
            7m
          </text>
        </g>
      </svg>
    </div>
  )
}
