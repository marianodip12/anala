import GoalGrid from './GoalGrid'
import CourtView from './CourtView'

/**
 * CourtPanel
 *
 * Layout:
 *   ~35%  → GoalGrid (arco 3×3, sin barra inferior)
 *   ~65%  → CourtView (cancha top-down 8 zonas + 7m)
 *
 * Flujo:
 *   1. Usuario selecciona zona de cancha  → selectedZone
 *   2. Usuario selecciona zona del arco   → selectedGoalSection
 *   3. Ambas seleccionadas                → aparece overlay resultado
 *      - zona dentro del arco (tl…br)    → Gol | Atajado  → llama onGol / onGuardarTiro
 *      - zona fuera del arco ('errado')  → Errado         → llama onErrado (o onGuardarTiro)
 *   4. Se limpia la selección
 */

const ZONE_NAMES = {
  extreme_left:  'Ext. Izq.',
  lateral_left:  'Lat. Izq.',
  center_above:  'Centro',
  lateral_right: 'Lat. Der.',
  extreme_right: 'Ext. Der.',
  near_left:     'Cerca Izq.',
  near_center:   'Pivote',
  near_right:    'Cerca Der.',
  '7m':          '7m',
}

const GOAL_NAMES = {
  tl: 'Arr. Izq.', tc: 'Arr. Centro', tr: 'Arr. Der.',
  ml: 'Med. Izq.', mc: 'Med. Centro', mr: 'Med. Der.',
  bl: 'Abj. Izq.', bc: 'Abj. Centro', br: 'Abj. Der.',
  errado: 'Fuera del arco',
}

// ── Result Overlay ─────────────────────────────────────────────
function ResultOverlay({ courtZone, goalSection, onGol, onSaved, onErrado, onCancel }) {
  if (!courtZone || !goalSection) return null

  const isErrado  = goalSection === 'errado'
  const zoneName  = ZONE_NAMES[courtZone]   ?? courtZone
  const goalName  = GOAL_NAMES[goalSection] ?? goalSection

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="flex flex-col gap-3 rounded-2xl p-6"
        style={{ background: '#132a4e', minWidth: 220, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
      >
        <p className="text-center text-xs text-gray-400 font-semibold mb-1">
          {zoneName} → {goalName}
        </p>

        {isErrado ? (
          <button
            onClick={onErrado}
            className="py-3 rounded-xl font-bold text-base text-white transition-transform active:scale-95"
            style={{ background: '#666' }}
          >
            ✕ Errado
          </button>
        ) : (
          <>
            <button
              onClick={onGol}
              className="py-3 rounded-xl font-bold text-base text-white transition-transform active:scale-95"
              style={{ background: '#e8453c' }}
            >
              ⚽ Gol
            </button>
            <button
              onClick={onSaved}
              className="py-3 rounded-xl font-bold text-base text-white transition-transform active:scale-95"
              style={{ background: '#2ecfb0' }}
            >
              🧤 Atajado
            </button>
          </>
        )}

        <button
          onClick={onCancel}
          className="py-2 rounded-xl text-sm font-semibold text-gray-400 transition-transform active:scale-95"
          style={{ background: '#1a3a60' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Main export ─────────────────────────────────────────────────
export default function CourtPanel({
  // Zone selection
  selectedZone,
  onZoneSelect,
  selectedGoalSection,
  onGoalSectionSelect,
  // Layout
  isInterrupted,
  showGoalButtons,      // kept for backward compat (unused in new flow)
  heatmap = {},
  // Result callbacks (same as LiveMatch.jsx)
  onGol,
  onGuardarTiro,
  onErrado,             // optional: called when shot is outside goal
}) {
  const bothSelected = selectedZone && selectedGoalSection

  const handleGol = () => {
    onGol?.()
    // onGol already calls clearEventBuilder in LiveMatch
  }

  const handleSaved = () => {
    onGuardarTiro?.()
  }

  const handleErrado = () => {
    // If no dedicated errado handler, fall back to saved
    if (onErrado) onErrado()
    else onGuardarTiro?.()
  }

  const handleCancel = () => {
    onGoalSectionSelect?.(null)
  }

  return (
    <div className="flex flex-col w-full overflow-hidden" style={{ flex: 1, minHeight: 0 }}>

      {/* ── ARCO: 35% height ── */}
      <div style={{ flex: '0 0 35%', minHeight: 0, overflow: 'hidden' }}
           className="px-2 pt-2">
        <GoalGrid
          selected={selectedGoalSection}
          onSelect={onGoalSectionSelect}
          counts={heatmap?.goal ?? {}}
        />
      </div>

      {/* ── BANNER interrupción ── */}
      {isInterrupted && (
        <div className="flex-shrink-0 h-7 flex items-center justify-center
                        bg-cyan-500/20 border-y border-cyan-500/40">
          <p className="text-cyan-400 text-[11px] font-bold tracking-widest uppercase">
            Interrupción de juego
          </p>
        </div>
      )}

      {/* ── CANCHA: resto del espacio (~65%) ── */}
      <div style={{ flex: 1, minHeight: 0 }} className="overflow-hidden">
        <CourtView
          selectedZone={selectedZone}
          onZoneSelect={onZoneSelect}
          heatmap={heatmap?.court ?? {}}
        />
      </div>

      {/* ── OVERLAY resultado (aparece cuando ambas zonas están seleccionadas) ── */}
      {bothSelected && (
        <ResultOverlay
          courtZone={selectedZone}
          goalSection={selectedGoalSection}
          onGol={handleGol}
          onSaved={handleSaved}
          onErrado={handleErrado}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}

// Named exports for MatchStats and other consumers
export { CourtView }
export { CourtView as CourtTopDown }
