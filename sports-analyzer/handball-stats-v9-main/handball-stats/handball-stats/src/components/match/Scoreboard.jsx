import { useTimer } from '@/hooks/useTimer'
import useMatchStore from '@/store/matchStore'
import clsx from 'clsx'

export default function Scoreboard({ onPressTimer }) {
  const { formatted, half } = useTimer()
  const {
    homeTeam, awayTeam,
    homeScore, awayScore,
    isRunning, isInterrupted,
  } = useMatchStore()

  return (
    <div className="flex items-center justify-between px-3 py-2
                    bg-court-surface border-b border-white/10">
      {/* Home */}
      <div className="flex flex-col items-start w-20">
        <span
          className="text-3xl font-black leading-none tabular-nums"
          style={{ color: homeTeam?.color ?? '#ef6461' }}
        >
          {homeScore}
        </span>
        <span className="text-[10px] text-gray-400 truncate max-w-[72px] mt-0.5">
          {homeTeam?.short_name ?? homeTeam?.name ?? 'Local'}
        </span>
      </div>

      {/* Centre */}
      <div className="flex flex-col items-center gap-0.5">
        <button
          onClick={onPressTimer}
          className={clsx(
            'flex items-center gap-2 px-4 py-1.5 rounded-2xl font-mono font-bold text-lg transition-all',
            isRunning
              ? 'bg-brand-primary/20 text-brand-primary'
              : 'bg-white/10 text-white',
            isInterrupted && 'animate-pulse bg-brand-secondary/20 text-brand-secondary',
          )}
        >
          <span className="text-sm">{isRunning ? '⏸' : '▶'}</span>
          <span>{formatted}</span>
        </button>
        <span className="text-[10px] text-gray-500">
          {half === 1 ? '1er Tiempo' : half === 2 ? '2do Tiempo' : `ET${half - 2}`}
        </span>
      </div>

      {/* Away */}
      <div className="flex flex-col items-end w-20">
        <span
          className="text-3xl font-black leading-none tabular-nums"
          style={{ color: awayTeam?.color ?? '#48cae4' }}
        >
          {awayScore}
        </span>
        <span className="text-[10px] text-gray-400 truncate max-w-[72px] mt-0.5 text-right">
          {awayTeam?.short_name ?? awayTeam?.name ?? 'Visitante'}
        </span>
      </div>
    </div>
  )
}
