import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { SHOT_RESULTS, ZONES } from '@/constants'
import { CourtTopDown } from '@/components/court/CourtPanel'
import GoalGrid from '@/components/court/GoalGrid'
import { Spinner } from '@/components/ui'

function StatBlock({ label, value, sub }) {
  return (
    <div className="bg-court-surface rounded-xl p-3 flex flex-col gap-0.5">
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="text-white text-2xl font-black">{value}</p>
      {sub && <p className="text-gray-500 text-xs">{sub}</p>}
    </div>
  )
}

function GoalkeeperStats({ gkStats }) {
  if (!gkStats?.length) return (
    <p className="text-gray-500 text-sm text-center py-4">Sin datos de arquero.</p>
  )
  return (
    <div className="flex flex-col gap-3">
      {gkStats.map(gk => (
        <div key={gk.player_id} className="bg-court-surface rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-white font-bold">#{gk.number} {gk.name}</p>
              <p className="text-gray-500 text-xs">{gk.team_name}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black" style={{ color: gk.save_pct >= 35 ? '#22c55e' : '#ef6461' }}>
                {gk.save_pct ?? 0}%
              </p>
              <p className="text-xs text-gray-500">eficiencia</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <p className="text-white font-bold">{gk.total_shots_faced}</p>
              <p className="text-gray-500 text-xs">Tiros</p>
            </div>
            <div>
              <p className="text-green-400 font-bold">{gk.saves}</p>
              <p className="text-gray-500 text-xs">Atajados</p>
            </div>
            <div>
              <p className="text-red-400 font-bold">{gk.goals_conceded}</p>
              <p className="text-gray-500 text-xs">Goles</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MatchStats() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [match, setMatch] = useState(null)
  const [events, setEvents] = useState([])
  const [gkStats, setGkStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('resumen')  // resumen | arquero | jugadores | zonas

  useEffect(() => {
    const load = async () => {
      const [{ data: matchData }, { data: eventsData }, { data: gkData }] = await Promise.all([
        supabase.from('matches').select(`
          *, homeTeam:home_team_id(id,name,color), awayTeam:away_team_id(id,name,color)
        `).eq('id', id).single(),
        supabase.from('events').select('*').eq('match_id', id),
        supabase.from('v_goalkeeper_stats').select('*').eq('match_id', id),
      ])
      setMatch(matchData)
      setEvents(eventsData ?? [])
      setGkStats(gkData ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  // ── Derived stats ─────────────────────────────────────────
  const shots = events.filter(e => e.event_type === 'shot')
  const goals  = shots.filter(e => e.shot_result === 'goal')
  const saved  = shots.filter(e => e.shot_result === 'saved')
  const missed = shots.filter(e => e.shot_result === 'missed')

  // Zone heatmap
  const zoneHeatmap = shots.reduce((acc, e) => {
    if (e.zone) acc[e.zone] = (acc[e.zone] ?? 0) + 1
    return acc
  }, {})

  // Goal section heatmap
  const goalHeatmap = goals.reduce((acc, e) => {
    if (e.goal_section) acc[e.goal_section] = (acc[e.goal_section] ?? 0) + 1
    return acc
  }, {})

  // Per-zone breakdown
  const zoneStats = ZONES.map(z => ({
    ...z,
    total: shots.filter(s => s.zone === z.id).length,
    goals: shots.filter(s => s.zone === z.id && s.shot_result === 'goal').length,
  })).filter(z => z.total > 0)

  const TABS = ['resumen','arquero','jugadores','zonas']

  if (loading) return (
    <div className="flex justify-center items-center h-screen"><Spinner size={10} /></div>
  )

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-court-bg/90 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/matches')} className="text-gray-400 text-xl">‹</button>
          <div className="flex-1">
            <p className="text-white font-bold text-sm">
              {match?.homeTeam?.name} {match?.home_score} – {match?.away_score} {match?.awayTeam?.name}
            </p>
            <p className="text-gray-500 text-xs">Estadísticas del partido</p>
          </div>
          <button
            onClick={() => navigate(`/matches/${id}`)}
            className="text-brand-primary text-sm font-semibold"
          >
            ▶ Partido
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-white/10 bg-court-surface">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-xs font-semibold capitalize transition-all
              ${tab === t ? 'text-brand-secondary border-b-2 border-brand-secondary' : 'text-gray-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 px-4 py-4 flex flex-col gap-4">
        {/* ── Resumen ── */}
        {tab === 'resumen' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Tiros totales" value={shots.length} />
              <StatBlock label="Goles" value={goals.length} sub={shots.length > 0 ? `${Math.round(goals.length/shots.length*100)}% efectividad` : ''} />
              <StatBlock label="Atajados" value={saved.length} />
              <StatBlock label="Errados" value={missed.length} />
            </div>

            {/* Goal grid */}
            <div>
              <p className="text-gray-400 text-sm mb-2 font-semibold">Distribución de goles en el arco</p>
              <GoalGrid counts={goalHeatmap} size="lg" />
            </div>
          </>
        )}

        {/* ── Arquero ── */}
        {tab === 'arquero' && <GoalkeeperStats gkStats={gkStats} />}

        {/* ── Jugadores ── */}
        {tab === 'jugadores' && (
          <p className="text-gray-500 text-center py-8">
            Estadísticas por jugador — próximamente.
          </p>
        )}

        {/* ── Zonas ── */}
        {tab === 'zonas' && (
          <>
            <CourtTopDown
              heatmap={zoneHeatmap}
              showLabels
              className="mb-2"
            />
            <div className="flex flex-col gap-2">
              {zoneStats.sort((a, b) => b.total - a.total).map(z => (
                <div key={z.id} className="bg-court-surface rounded-xl p-3 flex items-center justify-between">
                  <p className="text-white font-medium text-sm">{z.label}</p>
                  <div className="flex gap-3 text-sm">
                    <span className="text-gray-400">{z.total} tiros</span>
                    <span className="text-green-400 font-bold">{z.goals} goles</span>
                    <span className="text-gray-500">
                      {z.total > 0 ? Math.round(z.goals / z.total * 100) : 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
