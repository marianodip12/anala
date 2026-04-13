import { useNavigate } from 'react-router-dom'
import { useMatches } from '@/hooks/useMatch'
import { useTeams } from '@/hooks/useTeams'
import { Button } from '@/components/ui'

export default function Home() {
  const navigate = useNavigate()
  const { matches } = useMatches()
  const { teams } = useTeams()

  const liveMatch = matches.find(m => m.status === 'live')
  const recentMatches = matches.slice(0, 3)

  return (
    <div className="flex flex-col min-h-screen px-4 py-6 gap-6">
      {/* Logo / brand */}
      <div className="flex flex-col items-center gap-1 pt-4">
        <span className="text-5xl">🤾</span>
        <h1 className="text-white font-black text-2xl tracking-tight">HandballStats</h1>
        <p className="text-gray-500 text-sm">Estadísticas en tiempo real</p>
      </div>

      {/* Live match banner */}
      {liveMatch && (
        <button
          onClick={() => navigate(`/matches/${liveMatch.id}`)}
          className="bg-green-900/30 border border-green-500/40 rounded-2xl p-4
                     flex items-center justify-between animate-pulse"
        >
          <div>
            <p className="text-green-400 text-xs font-bold mb-1">🔴 EN VIVO</p>
            <p className="text-white font-bold">
              {liveMatch.homeTeam?.name} {liveMatch.home_score} – {liveMatch.away_score} {liveMatch.awayTeam?.name}
            </p>
          </div>
          <span className="text-green-400 text-2xl">›</span>
        </button>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate('/matches')}
          className="bg-court-surface rounded-2xl p-5 flex flex-col items-center gap-2
                     border border-white/10 hover:border-white/25 transition-all active:scale-95"
        >
          <span className="text-3xl">🤾</span>
          <p className="text-white font-semibold">Partidos</p>
          <p className="text-gray-500 text-xs">{matches.length} total</p>
        </button>
        <button
          onClick={() => navigate('/teams')}
          className="bg-court-surface rounded-2xl p-5 flex flex-col items-center gap-2
                     border border-white/10 hover:border-white/25 transition-all active:scale-95"
        >
          <span className="text-3xl">👥</span>
          <p className="text-white font-semibold">Equipos</p>
          <p className="text-gray-500 text-xs">{teams.length} registrados</p>
        </button>
      </div>

      {/* Recent matches */}
      {recentMatches.length > 0 && (
        <div>
          <p className="text-gray-400 text-sm font-semibold mb-3">Últimos partidos</p>
          <div className="flex flex-col gap-2">
            {recentMatches.map(m => (
              <button
                key={m.id}
                onClick={() => navigate(`/matches/${m.id}/stats`)}
                className="bg-court-surface rounded-xl px-4 py-3 flex items-center justify-between
                           border border-white/10 hover:border-white/20 transition-all"
              >
                <p className="text-white text-sm font-medium">
                  {m.homeTeam?.name} vs {m.awayTeam?.name}
                </p>
                <p className="text-white font-black tabular-nums">
                  {m.home_score}–{m.away_score}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
