import clsx from 'clsx'
import { SANCTION_TYPES, ATTACK_ACTIONS, DEFENSE_ACTIONS, SHOT_RESULTS } from '@/constants'
import useMatchStore from '@/store/matchStore'
import GoalGrid from '@/components/court/GoalGrid'

// ─── Pill action button ───────────────────────────────────────
function ActionPill({ label, color, isPositive, isSelected, onClick }) {
  const bg = isSelected
    ? 'ring-2 ring-white'
    : isPositive === true
      ? 'bg-emerald-500/20 border-emerald-500/50'
      : isPositive === false
        ? 'bg-red-500/20 border-red-500/50'
        : 'bg-white/10 border-white/20'

  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center justify-between gap-2 px-4 py-2.5 rounded-2xl border',
        'text-sm font-semibold text-white transition-all active:scale-95',
        bg,
      )}
      style={isSelected ? { backgroundColor: color + '40', borderColor: color } : {}}
    >
      <span>{label}</span>
    </button>
  )
}

// ─── Panel: Sanciones ────────────────────────────────────────
export function SancionesPanel({ onLog, onClose }) {
  const { selectedPlayerId, homeLineup, awayLineup, selectedTeamSide } = useMatchStore()
  const lineup = selectedTeamSide === 'home' ? homeLineup : awayLineup
  const player = lineup.find(p => p.id === selectedPlayerId)

  const handleSanction = (type) => {
    if (!selectedPlayerId) return
    const team = selectedTeamSide === 'home'
      ? useMatchStore.getState().homeTeam
      : useMatchStore.getState().awayTeam

    onLog({
      event_type: 'sanction',
      team_id: team?.id,
      player_id: selectedPlayerId,
      sanction_type: type.id,
    })
    onClose()
  }

  return (
    <div className="flex flex-col gap-3">
      {player && (
        <p className="text-xs text-gray-400 text-center">
          Jugador: <span className="text-white font-bold">#{player.number} {player.name}</span>
        </p>
      )}
      {SANCTION_TYPES.map(type => (
        <button
          key={type.id}
          onClick={() => handleSanction(type)}
          disabled={!selectedPlayerId}
          className={clsx(
            'flex items-center gap-3 px-4 py-3 rounded-2xl border font-semibold transition-all active:scale-95',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
          style={{ backgroundColor: type.color + '25', borderColor: type.color + '60', color: type.color }}
        >
          <span className="w-4 h-4 rounded-full border-2 inline-block flex-shrink-0"
                style={{ backgroundColor: type.color, borderColor: type.color }} />
          {type.label}
          {type.permanent && <span className="ml-auto text-xs opacity-70">Permanente</span>}
        </button>
      ))}
    </div>
  )
}

// ─── Panel: Ataque ────────────────────────────────────────────
export function AtaquePanel({ onLog, onClose }) {
  const { selectedPlayerId, homeLineup, awayLineup, selectedTeamSide } = useMatchStore()
  const lineup = selectedTeamSide === 'home' ? homeLineup : awayLineup
  const player = lineup.find(p => p.id === selectedPlayerId)

  const handleAttack = (action) => {
    if (!selectedPlayerId) return
    const team = selectedTeamSide === 'home'
      ? useMatchStore.getState().homeTeam
      : useMatchStore.getState().awayTeam

    onLog({
      event_type: 'shot',
      team_id: team?.id,
      player_id: selectedPlayerId,
      attack_action: action.id,
      shot_result: action.id === 'goal_with_shot' ? 'goal' : 'missed',
      zone: useMatchStore.getState().selectedZone,
      goal_section: useMatchStore.getState().selectedGoalSection,
    })
    onClose()
  }

  return (
    <div className="flex flex-col gap-3">
      {player && (
        <p className="text-xs text-gray-400 text-center">
          Jugador: <span className="text-white font-bold">#{player.number} {player.name}</span>
        </p>
      )}
      {ATTACK_ACTIONS.map(action => (
        <ActionPill
          key={action.id}
          label={action.label}
          isPositive={action.isPositive}
          onClick={() => handleAttack(action)}
        />
      ))}
    </div>
  )
}

// ─── Panel: Defensa ───────────────────────────────────────────
export function DefensaPanel({ onLog, onClose }) {
  const { selectedGoalkeeperId, homeLineup, awayLineup, selectedTeamSide } = useMatchStore()

  // Goalkeeper belongs to the OPPOSING team
  const oppSide = selectedTeamSide === 'home' ? 'away' : 'home'
  const oppLineup = oppSide === 'home' ? homeLineup : awayLineup
  const gk = oppLineup.find(p => p.isGoalkeeper)

  const handleDefense = (action) => {
    const team = oppSide === 'home'
      ? useMatchStore.getState().homeTeam
      : useMatchStore.getState().awayTeam

    onLog({
      event_type: 'defense',
      team_id: team?.id,
      goalkeeper_id: gk?.id ?? selectedGoalkeeperId,
      defense_action: action.id,
    })
    onClose()
  }

  return (
    <div className="flex flex-col gap-3">
      {gk && (
        <p className="text-xs text-gray-400 text-center">
          Arquero rival: <span className="text-white font-bold">#{gk.number} {gk.name}</span>
        </p>
      )}
      {DEFENSE_ACTIONS.map(action => (
        <ActionPill
          key={action.id}
          label={action.label}
          isPositive={action.isPositive}
          onClick={() => handleDefense(action)}
        />
      ))}
    </div>
  )
}

// ─── Shot Result Selector ─────────────────────────────────────
export function ShotResultPanel({ onSelect, onClose }) {
  const store = useMatchStore()
  const { selectedZone, selectedGoalSection, selectGoalSection } = store

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-400 text-center">¿Resultado del tiro?</p>

      {/* Goal grid */}
      <div className="px-4">
        <p className="text-xs text-gray-500 mb-1.5 text-center">Seleccionar zona del arco</p>
        <GoalGrid
          selected={selectedGoalSection}
          onSelect={selectGoalSection}
          size="md"
        />
      </div>

      {/* Result pills */}
      <div className="grid grid-cols-2 gap-2 mt-1">
        {Object.entries(SHOT_RESULTS).map(([key, val]) => (
          <button
            key={key}
            onClick={() => { onSelect(key); onClose() }}
            className="py-2.5 rounded-xl font-semibold text-sm border transition-all active:scale-95"
            style={{ backgroundColor: val.color + '25', borderColor: val.color + '60', color: val.color }}
          >
            {val.label}
          </button>
        ))}
      </div>
    </div>
  )
}
