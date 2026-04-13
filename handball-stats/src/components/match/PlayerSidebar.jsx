import { useMemo } from 'react'
import clsx from 'clsx'
import useMatchStore from '@/store/matchStore'

export default function PlayerSidebar() {
  const {
    selectedTeamSide, homeLineup, awayLineup,
    selectedPlayerId, selectPlayer,
    exclusions, elapsedSeconds,
    homeTeam, awayTeam,
  } = useMatchStore()

  const lineup = selectedTeamSide === 'home' ? homeLineup : awayLineup
  const team   = selectedTeamSide === 'home' ? homeTeam   : awayTeam

  const exclusionMap = useMemo(() => {
    const map = {}
    exclusions.forEach(e => { map[e.playerId] = e })
    return map
  }, [exclusions])

  const toggleSide = () => {
    const next = selectedTeamSide === 'home' ? 'away' : 'home'
    useMatchStore.getState().selectTeamSide(next)
  }

  return (
    <div className="flex flex-col bg-court-surface/60 border-r border-white/10"
         style={{ width: 52 }}>

      {/* Team colour bar + switch */}
      <button
        onClick={toggleSide}
        className="flex flex-col items-center py-2 gap-1 border-b border-white/10
                   hover:bg-white/5 transition-colors"
        title="Cambiar equipo"
      >
        <div className="w-5 h-5 rounded-full"
             style={{ backgroundColor: team?.color ?? '#ef6461' }} />
        <span className="text-[9px] text-gray-500">⇄</span>
      </button>

      {/* Players */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1 py-1.5 px-1">
        {lineup.map(player => {
          const excl = exclusionMap[player.id]
          const remaining = excl && !excl.isPermanent
            ? Math.max(0, excl.endsAtSeconds - elapsedSeconds)
            : null
          const isSelected = selectedPlayerId === player.id

          return (
            <button
              key={player.id}
              onClick={() => !excl?.isPermanent && selectPlayer(player.id)}
              disabled={excl?.isPermanent}
              className={clsx(
                'relative flex flex-col items-center justify-center rounded-lg py-1.5 transition-all',
                'border text-xs font-bold leading-tight w-full',
                isSelected
                  ? 'bg-yellow-500/30 border-yellow-400 text-yellow-200'
                  : excl?.isPermanent
                    ? 'bg-red-900/20 border-red-800/30 text-red-500 opacity-50 cursor-not-allowed'
                    : excl
                      ? 'bg-blue-900/30 border-blue-600/40 text-blue-300'
                      : 'bg-white/5 border-white/10 text-white hover:bg-white/10',
              )}
              title={`${player.number} ${player.name}`}
            >
              <span className="text-base font-black">{player.number}</span>

              {player.isGoalkeeper && (
                <span className="text-[8px] text-gray-500 leading-none">ARQ</span>
              )}

              {remaining !== null && (
                <span className="text-[9px] text-blue-300 font-mono leading-none mt-0.5">
                  {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
                </span>
              )}

              {excl?.isPermanent && (
                <span className="absolute -top-1 -right-1 text-[7px] bg-red-600
                                  rounded-full w-3 h-3 flex items-center justify-center">
                  ✕
                </span>
              )}
            </button>
          )
        })}

        {lineup.length === 0 && (
          <p className="text-[9px] text-gray-600 text-center mt-3 leading-tight px-0.5">
            Sin<br/>jugadores
          </p>
        )}
      </div>
    </div>
  )
}
