import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import clsx from 'clsx'

import useMatchStore from '@/store/matchStore'
import { useMatch } from '@/hooks/useMatch'

import Scoreboard from '@/components/match/Scoreboard'
import PlayerSidebar from '@/components/match/PlayerSidebar'
import LineupManager from '@/components/match/LineupManager'
import CourtPanel from '@/components/court/CourtPanel'
import { Modal, Button, Spinner } from '@/components/ui'
import {
  SancionesPanel,
  AtaquePanel,
  DefensaPanel,
  ShotResultPanel,
} from '@/components/match/EventPanel'

export default function LiveMatch() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { match, loading, logEvent, syncTimer, setPlayerOnCourt } = useMatch(id)

  const store = useMatchStore()
  const {
    isRunning, isInterrupted,
    selectedPlayerId, selectedZone, selectedGoalSection,
    activePanel, setActivePanel,
    startTimer, pauseTimer, resume,
    clearEventBuilder, selectZone, selectGoalSection,
    homeTeam, awayTeam, homeLineup, awayLineup,
    homeScore, awayScore,
  } = store

  const [showLineup, setShowLineup] = useState(null)

  // Periodic sync
  useEffect(() => {
    const iv = setInterval(syncTimer, 10_000)
    return () => clearInterval(iv)
  }, [syncTimer])

  const handleTimerPress = () => {
    if (isRunning) pauseTimer()
    else if (isInterrupted) resume()
    else startTimer()
  }

  // Zone clicked on court
  const handleZoneSelect = (zone) => {
    selectZone(zone)
    // Auto-open ataque panel if player selected
    if (selectedPlayerId && zone && zone !== 'outside') {
      setActivePanel('ataque')
    }
  }

  // Goal section clicked
  const handleGoalSectionSelect = (section) => {
    selectGoalSection(section)
  }

  // Quick log: Gol
  const handleQuickGol = async () => {
    if (!selectedPlayerId) return
    const s = useMatchStore.getState()
    const team = s.selectedTeamSide === 'home' ? s.homeTeam : s.awayTeam
    const oppSide = s.selectedTeamSide === 'home' ? 'away' : 'home'
    const oppLineup = oppSide === 'home' ? s.homeLineup : s.awayLineup
    const gk = oppLineup.find(p => p.isGoalkeeper)
    await logEvent({
      event_type: 'shot',
      team_id: team?.id,
      player_id: s.selectedPlayerId,
      goalkeeper_id: gk?.id ?? null,
      zone: s.selectedZone,
      goal_section: s.selectedGoalSection,
      shot_result: 'goal',
    })
    clearEventBuilder()
    resume()
  }

  // Quick log: Guardar el tiro (saved)
  const handleQuickSaved = async () => {
    if (!selectedPlayerId) return
    const s = useMatchStore.getState()
    const team = s.selectedTeamSide === 'home' ? s.homeTeam : s.awayTeam
    const oppSide = s.selectedTeamSide === 'home' ? 'away' : 'home'
    const oppLineup = oppSide === 'home' ? s.homeLineup : s.awayLineup
    const gk = oppLineup.find(p => p.isGoalkeeper)
    await logEvent({
      event_type: 'shot',
      team_id: team?.id,
      player_id: s.selectedPlayerId,
      goalkeeper_id: gk?.id ?? null,
      zone: s.selectedZone,
      goal_section: s.selectedGoalSection,
      shot_result: 'saved',
    })
    clearEventBuilder()
    resume()
  }

  const handlePanelLog = async (eventData) => {
    await logEvent(eventData)
    clearEventBuilder()
    resume()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 bg-court-bg">
        <Spinner size={10} />
        <p className="text-gray-400">Cargando partido...</p>
      </div>
    )
  }

  const showGoalButtons = !!selectedPlayerId

  return (
    <div className="flex flex-col h-screen bg-court-bg overflow-hidden">

      {/* ── Scoreboard ── */}
      <Scoreboard onPressTimer={handleTimerPress} />

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Player sidebar */}
        <PlayerSidebar />

        {/* Main court area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <CourtPanel
            selectedZone={selectedZone}
            onZoneSelect={handleZoneSelect}
            selectedGoalSection={selectedGoalSection}
            onGoalSectionSelect={handleGoalSectionSelect}
            isInterrupted={isInterrupted}
            showGoalButtons={showGoalButtons}
            onGol={handleQuickGol}
            onGuardarTiro={handleQuickSaved}
          />

          {/* ── Bottom bar ── */}
          <div className="bg-court-surface border-t border-white/10 flex-shrink-0">

            {/* Player name + lineup links */}
            <div className="flex items-center justify-between px-3 py-1 border-b border-white/5 text-xs">
              {selectedPlayerId ? (() => {
                const lineup = store.selectedTeamSide === 'home' ? homeLineup : awayLineup
                const p = lineup.find(pl => pl.id === selectedPlayerId)
                return (
                  <span className="text-white font-semibold">
                    {p ? `${p.number}  ${p.name}` : ''}
                  </span>
                )
              })() : <span className="text-gray-600">Seleccionar jugador</span>}

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

            {/* Sanciones / Ataque / Defensa tabs */}
            <div className="grid grid-cols-3">
              {['sanciones','ataque','defensa'].map(panel => (
                <button key={panel}
                  onClick={() => setActivePanel(activePanel === panel ? 'none' : panel)}
                  className={clsx(
                    'py-3 text-sm font-bold capitalize transition-all border-r last:border-r-0 border-white/10',
                    activePanel === panel
                      ? 'bg-brand-primary/25 text-brand-primary'
                      : 'text-gray-400 hover:text-white',
                  )}
                >
                  {panel.charAt(0).toUpperCase() + panel.slice(1)}
                </button>
              ))}
            </div>

            {/* Expanded panel content */}
            {activePanel !== 'none' && (
              <div className="p-3 max-h-56 overflow-y-auto border-t border-white/10">
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

      {/* ── Lineup modals ── */}
      {showLineup === 'home' && homeTeam && (
        <LineupManager isOpen onClose={() => setShowLineup(null)} side="home" teamId={homeTeam.id}
          onSave={(players) => players.forEach(p => setPlayerOnCourt(p.id, homeTeam.id, p.isGoalkeeper, true))} />
      )}
      {showLineup === 'away' && awayTeam && (
        <LineupManager isOpen onClose={() => setShowLineup(null)} side="away" teamId={awayTeam.id}
          onSave={(players) => players.forEach(p => setPlayerOnCourt(p.id, awayTeam.id, p.isGoalkeeper, true))} />
      )}
    </div>
  )
}
