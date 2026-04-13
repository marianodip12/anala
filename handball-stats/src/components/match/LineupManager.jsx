import { useState } from 'react'
import clsx from 'clsx'
import { Modal, Button } from '@/components/ui'
import { usePlayers } from '@/hooks/useTeams'
import useMatchStore from '@/store/matchStore'
import { MAX_ON_COURT } from '@/constants'

/**
 * LineupManager
 * Modal to toggle players on/off court for a given team side.
 * Enforces: max 7 on court, max 1 goalkeeper.
 */
export default function LineupManager({ isOpen, onClose, side, teamId, onSave }) {
  const { players, loading } = usePlayers(teamId)
  const { homeLineup, awayLineup, setLineup } = useMatchStore()

  const lineup = side === 'home' ? homeLineup : awayLineup
  const onCourtIds = new Set(lineup.map(p => p.id))
  const goalkeeperOnCourt = lineup.find(p => p.isGoalkeeper)

  const [pending, setPending] = useState(() => new Map(
    lineup.map(p => [p.id, { onCourt: true, isGoalkeeper: p.isGoalkeeper }])
  ))

  const toggle = (player) => {
    setPending(prev => {
      const next = new Map(prev)
      const current = next.get(player.id) ?? { onCourt: false, isGoalkeeper: false }

      if (current.onCourt) {
        // Remove from court
        next.set(player.id, { ...current, onCourt: false })
      } else {
        // Check limits
        const onCourtCount = [...next.values()].filter(v => v.onCourt).length
        if (onCourtCount >= MAX_ON_COURT) return prev // limit reached
        next.set(player.id, { ...current, onCourt: true })
      }
      return next
    })
  }

  const setGoalkeeper = (player) => {
    setPending(prev => {
      const next = new Map(prev)
      // Unset previous GK
      for (const [id, val] of next) {
        if (val.isGoalkeeper) next.set(id, { ...val, isGoalkeeper: false })
      }
      const current = next.get(player.id) ?? { onCourt: true, isGoalkeeper: false }
      next.set(player.id, { ...current, isGoalkeeper: true, onCourt: true })
      return next
    })
  }

  const handleSave = () => {
    const newLineup = players
      .filter(p => pending.get(p.id)?.onCourt)
      .map(p => ({
        ...p,
        isGoalkeeper: pending.get(p.id)?.isGoalkeeper ?? false,
      }))
    setLineup(side, newLineup)
    onSave?.(newLineup)
    onClose()
  }

  const onCourtCount = [...pending.values()].filter(v => v.onCourt).length
  const pendingGk = [...pending.entries()].find(([, v]) => v.isGoalkeeper && v.onCourt)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Jugadores en cancha – ${side === 'home' ? 'Local' : 'Visitante'}`} size="md">
      {loading ? (
        <p className="text-gray-400 text-center py-8">Cargando...</p>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3 text-center">
            {onCourtCount}/{MAX_ON_COURT} en cancha
            {pendingGk ? ` · ARQ: #${players.find(p => p.id === pendingGk[0])?.number}` : ' · Sin arquero'}
          </p>

          <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto">
            {players.map(player => {
              const state = pending.get(player.id) ?? { onCourt: false, isGoalkeeper: false }
              const isOnCourt = state.onCourt
              const isGk = state.isGoalkeeper

              return (
                <div
                  key={player.id}
                  className={clsx(
                    'flex items-center gap-3 p-3 rounded-xl border transition-all',
                    isOnCourt
                      ? 'bg-white/10 border-white/30'
                      : 'bg-white/5 border-white/10 opacity-60',
                  )}
                >
                  {/* Number + name */}
                  <button onClick={() => toggle(player)} className="flex items-center gap-3 flex-1 text-left">
                    <span className={clsx(
                      'w-9 h-9 rounded-full flex items-center justify-center text-sm font-black',
                      isOnCourt ? 'bg-brand-primary text-white' : 'bg-white/10 text-gray-400',
                    )}>
                      {player.number}
                    </span>
                    <div>
                      <p className="text-white font-semibold text-sm">{player.name}</p>
                      <p className="text-gray-500 text-xs">{player.position === 'goalkeeper' ? 'Arquero' : 'Jugador de campo'}</p>
                    </div>
                  </button>

                  {/* GK toggle (only if on court) */}
                  {isOnCourt && (
                    <button
                      onClick={() => setGoalkeeper(player)}
                      className={clsx(
                        'text-xs px-2 py-1 rounded-lg border transition-all font-bold',
                        isGk
                          ? 'bg-brand-secondary/30 border-brand-secondary text-brand-secondary'
                          : 'bg-white/5 border-white/10 text-gray-500',
                      )}
                    >
                      ARQ
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex gap-2">
            <Button variant="ghost" onClick={onClose} fullWidth>Cancelar</Button>
            <Button variant="primary" onClick={handleSave} fullWidth>Confirmar</Button>
          </div>
        </>
      )}
    </Modal>
  )
}
