import clsx from 'clsx'

/**
 * GoalGrid – SVG goal face 3×3 + errado zone.
 * No bottom bar (open goal like real handball).
 * Posts flush to edges.
 *
 * Props:
 *   selected  – goal zone id: 'tl','tc','tr','ml','mc','mr','bl','bc','br' | 'errado'
 *   onSelect  – (id) => void
 *   counts    – { [id]: number } heatmap
 */

const INNER_ZONES = [
  { id: 'tl', row: 0, col: 0 },
  { id: 'tc', row: 0, col: 1 },
  { id: 'tr', row: 0, col: 2 },
  { id: 'ml', row: 1, col: 0 },
  { id: 'mc', row: 1, col: 1 },
  { id: 'mr', row: 1, col: 2 },
  { id: 'bl', row: 2, col: 0 },
  { id: 'bc', row: 2, col: 1 },
  { id: 'br', row: 2, col: 2 },
]

// viewBox: 320 × 140
// Crossbar at y=8, posts x=5 and x=315, open bottom
// Cols: 5-111 | 111-209 | 209-315  (w≈102 each)
// Rows: 8-52  | 52-96  | 96-140   (h=44 each)
const COL_X  = [6,   112, 212]
const COL_W  = [104, 98,  102]
const ROW_Y  = [9,   53,  97 ]
const ROW_H  = 42

export default function GoalGrid({ selected, onSelect, counts = {} }) {
  const maxCount = Math.max(0, ...Object.values(counts))

  const handleClick = (id) => onSelect?.(selected === id ? null : id)

  return (
    <svg
      viewBox="0 0 320 140"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', display: 'block' }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* ── Errado background (above crossbar / outside posts) ── */}
      <rect
        x="0" y="0" width="320" height="140"
        fill={selected === 'errado' ? 'rgba(100,100,100,0.25)' : 'rgba(0,0,0,0)'}
        style={{ cursor: 'pointer' }}
        onClick={() => handleClick('errado')}
      />

      {/* ── Goal interior ── */}
      <rect x="5" y="8" width="310" height="132" fill="#0d2240" />

      {/* Fine net texture */}
      {[55, 160, 265].map(x => (
        <line key={`nv${x}`} x1={x} y1="8" x2={x} y2="140"
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      {[30, 74, 118].map(y => (
        <line key={`nh${y}`} x1="5" y1={y} x2="315" y2={y}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}

      {/* ── 9 inner zones ── */}
      {INNER_ZONES.map(({ id, row, col }) => {
        const x  = COL_X[col], y  = ROW_Y[row]
        const w  = COL_W[col], h  = ROW_H
        const isSel   = selected === id
        const count   = counts[id] ?? 0
        const heat    = maxCount > 0 ? count / maxCount : 0

        return (
          <g key={id} onClick={() => handleClick(id)} style={{ cursor: 'pointer' }}>
            <rect
              x={x} y={y} width={w} height={h} rx="2"
              fill={
                isSel
                  ? 'rgba(200,168,42,0.65)'
                  : heat > 0
                    ? `rgba(239,100,97,${0.1 + heat * 0.55})`
                    : 'rgba(255,255,255,0.03)'
              }
              stroke={isSel ? '#c8a82a' : 'rgba(255,255,255,0.08)'}
              strokeWidth={isSel ? 2 : 1}
            />
            {count > 0 && (
              <text
                x={x + w / 2} y={y + h / 2 + 5}
                textAnchor="middle" fill="#fff"
                fontSize="13" fontWeight="bold"
                fontFamily="Arial,sans-serif"
                style={{ pointerEvents: 'none' }}
              >
                {count}
              </text>
            )}
          </g>
        )
      })}

      {/* ── Grid dividers (on top) ── */}
      <line x1="111" y1="8"  x2="111" y2="140" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      <line x1="210" y1="8"  x2="210" y2="140" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      <line x1="5"   y1="52" x2="315" y2="52"  stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      <line x1="5"   y1="96" x2="315" y2="96"  stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />

      {/* ── Frame: crossbar + left post + right post (NO bottom bar) ── */}
      {/* Left post stripes */}
      {Array.from({ length: 17 }, (_, i) => i).map(i => (
        <rect key={`lp${i}`} x="2" y={8 + i * 8} width="6" height="5"
          fill={i % 2 === 0 ? '#ef4444' : '#ffffff'} />
      ))}
      {/* Right post stripes */}
      {Array.from({ length: 17 }, (_, i) => i).map(i => (
        <rect key={`rp${i}`} x="312" y={8 + i * 8} width="6" height="5"
          fill={i % 2 === 0 ? '#ef4444' : '#ffffff'} />
      ))}
      {/* Crossbar stripes */}
      {Array.from({ length: 35 }, (_, i) => i).map(i => (
        <rect key={`cb${i}`} x={i * 9} y="2" width="6" height="7"
          fill={i % 2 === 0 ? '#ef4444' : '#ffffff'} />
      ))}
      {/* Crossbar line */}
      <line x1="0" y1="8" x2="320" y2="8" stroke="#ef4444" strokeWidth="6" />
      {/* Left post line */}
      <line x1="5" y1="8" x2="5" y2="140" stroke="#ef4444" strokeWidth="6" />
      {/* Right post line */}
      <line x1="315" y1="8" x2="315" y2="140" stroke="#ef4444" strokeWidth="6" />
    </svg>
  )
}
