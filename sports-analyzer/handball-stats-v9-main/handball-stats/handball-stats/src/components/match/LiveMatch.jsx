import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import clsx from 'clsx'

import useMatchStore from '@/store/matchStore'
import { useMatch } from '@/hooks/useMatch'

import Scoreboard from '@/components/match/Scoreboard'
import PlayerSidebar from '@/components/match/PlayerSidebar'
import LineupManager from '@/components/match/LineupManager'
import CourtPanel from '@/components/court/CourtPanel'
import { Spinner } from '@/components/ui'
import {
  SancionesPanel,
  AtaquePanel,
  DefensaPanel,
} from '@/components/match/EventPanel'

export default function LiveMatch() {
  const { id } = useParams()
  const { match, loading, logEvent, syncTimer, setPlayerOnCourt } = useMatch(id)

  const store = useMatchStore()
  const {
    isRunning, isInterrupted,
    selectedPlayerId, selectedZone, selectedGoalSection,
    activePanel, setActivePanel,
    startTimer, pauseTimer, resume,
    clearEventBuilder, selectZone, selectGoalSection,
    homeTeam, awayTeam, homeLineup, awayLineup, selectedTeamSide,
  } = store

  const [showLineup, setShowLineup] = useState(null)

  // Sync timer a Supabase cada 10s
  useEffect(() => {
    const iv = setInterval(syncTimer, 10_000)
    return () => clearInterval(iv)
  }, [syncTimer])

  const handleTimerPress = () => {
    if (isRunning) pauseTimer()
    else if (isInterrupted) resume()
    else startTimer()
  }

  const handleZoneSelect = (zone) => {
    selectZone(zone)
    if (selectedPlayerId && zone) {
      useMatchStore.getState().interrupt()
      setActivePanel('ataque')
    }
  }

  const getTeamAndGk = () => {
    const s = useMatchStore.getState()
    const team = s.selectedTeamSide === 'home' ? s.homeTeam : s.awayTeam
    const oppSide = s.selectedTeamSide === 'home' ? 'away' : 'home'
    const oppLineup = oppSide === 'home' ? s.homeLineup : s.awayLineup
    const gk = oppLineup.find(p => p.isGoalkeeper)
    return { team, gk }
  }

  const handleGol = async () => {
    if (!selectedPlayerId) return
    const s = useMatchStore.getState()
    const { team, gk } = getTeamAndGk()
    await logEvent({
      event_type: 'shot', team_id: team?.id,
      player_id: s.selectedPlayerId, goalkeeper_id: gk?.id ?? null,
      zone: s.selectedZone, goal_section: s.selectedGoalSection,
      shot_result: 'goal',
    })
    clearEventBuilder(); resume()
  }

  const handleSaved = async () => {
    if (!selectedPlayerId) return
    const s = useMatchStore.getState()
    const { team, gk } = getTeamAndGk()
    await logEvent({
      event_type: 'shot', team_id: team?.id,
      player_id: s.selectedPlayerId, goalkeeper_id: gk?.id ?? null,
      zone: s.selectedZone, goal_section: s.selectedGoalSection,
      shot_result: 'saved',
    })
    clearEventBuilder(); resume()
  }

  const handlePanelLog = async (eventData) => {
    await logEvent(eventData)
    clearEventBuilder(); resume()
  }

  const currentLineup = selectedTeamSide === 'home' ? homeLineup : awayLineup
  const currentPlayer = currentLineup.find(p => p.id === selectedPlayerId)

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen gap-3 bg-court-bg">
      <Spinner size={10} />
      <p className="text-gray-400">Cargando partido...</p>
    </div>
  )

  return (
    // Pantalla completa, sin scroll
    <div className="flex flex-col bg-court-bg overflow-hidden" style={{ height: '100dvh' }}>

      {/* ── Scoreboard ── */}
      <Scoreboard onPressTimer={handleTimerPress} />

      {/* ── Cuerpo principal: sidebar + panel central ── */}
      <div className="flex overflow-hidden" style={{ flex: 1, minHeight: 0 }}>

        {/* Sidebar jugadores */}
        <PlayerSidebar />

        {/* Panel central: cancha + bottom bar */}
        <div className="flex flex-col overflow-hidden" style={{ flex: 1, minHeight: 0 }}>

          {/* Cancha (arco + zonas) */}
          <CourtPanel
            selectedZone={selectedZone}
            onZoneSelect={handleZoneSelect}
            selectedGoalSection={selectedGoalSection}
            onGoalSectionSelect={selectGoalSection}
            isInterrupted={isInterrupted}
            showGoalButtons={!!selectedPlayerId}
            onGol={handleGol}
            onGuardarTiro={handleSaved}
          />

          {/* ── Bottom bar ── */}
          <div className="flex-shrink-0 bg-court-surface border-t border-white/10">

            {/* Info jugador + lineup links */}
            <div className="flex items-center justify-between px-3 py-1 border-b border-white/5 text-xs">
              <span className={currentPlayer ? 'text-white font-semibold' : 'text-gray-600'}>
                {currentPlayer ? `${currentPlayer.number}  ${currentPlayer.name}` : 'Seleccionar jugador'}
              </span>
              <div className="flex gap-3">
                <button onClick={() => setShowLineup('home')}
                  className="text-gray-500 hover:text-white">
                  👥 {homeTeam?.short_name ?? 'Local'} ({homeLineup.length})
                </button>
                <button onClick={() => setShowLineup('away')}
                  className="text-gray-500 hover:text-white">
                  👥 {awayTeam?.short_name ?? 'Visit.'} ({awayLineup.length})
                </button>
              </div>
            </div>

            {/* Tabs Sanciones / Ataque / Defensa */}
            <div className="grid grid-cols-3">
              {['sanciones','ataque','defensa'].map(panel => (
                <button key={panel}
                  onClick={() => setActivePanel(activePanel === panel ? 'none' : panel)}
                  className={clsx(
                    'py-2.5 text-sm font-bold capitalize transition-all',
                    'border-r last:border-r-0 border-white/10',
                    activePanel === panel
                      ? 'bg-brand-primary/25 text-brand-primary'
                      : 'text-gray-400 hover:text-white',
                  )}>
                  {panel.charAt(0).toUpperCase() + panel.slice(1)}
                </button>
              ))}
            </div>

            {/* Panel expandido */}
            {activePanel !== 'none' && (
              <div className="p-3 max-h-52 overflow-y-auto border-t border-white/10">
                {activePanel === 'sanciones' && (
                  <SancionesPanel onLog={handlePanelLog} onClose={() => setActivePanel('none')} />
                )}
                {activePanel === 'ataque' && (
                  <AtaquePanel onLog={handlePanelLog} onClose={() => setActivePanel('none')} />
                )}
                {activePanel === 'defensa' && (
                  <DefensaPanel onLog={handlePanelLog} onClose={() => setActivePanel('none')} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals lineup */}
      {showLineup === 'home' && homeTeam && (
        <LineupManager isOpen onClose={() => setShowLineup(null)} side="home" teamId={homeTeam.id}
          onSave={players => players.forEach(p => setPlayerOnCourt(p.id, homeTeam.id, p.isGoalkeeper, true))} />
      )}
      {showLineup === 'away' && awayTeam && (
        <LineupManager isOpen onClose={() => setShowLineup(null)} side="away" teamId={awayTeam.id}
          onSave={players => players.forEach(p => setPlayerOnCourt(p.id, awayTeam.id, p.isGoalkeeper, true))} />
      )}
    </div>
  )
}
