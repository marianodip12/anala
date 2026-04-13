import { create } from 'zustand'
import { EXCLUSION_DURATION } from '@/constants'

/**
 * matchStore – Zustand store for a live match session.
 * Persists to Supabase via useMatch hook; this store drives the UI.
 */
const useMatchStore = create((set, get) => ({
  // ─── Match metadata ──────────────────────────────────────────
  matchId: null,
  homeTeam: null,
  awayTeam: null,
  half: 1,
  status: 'pending', // pending | live | finished

  // ─── Score ───────────────────────────────────────────────────
  homeScore: 0,
  awayScore: 0,

  // ─── Timer ───────────────────────────────────────────────────
  elapsedSeconds: 0,
  isRunning: false,
  timerStartedAt: null, // Date.now() when last started

  // ─── Court orientation ───────────────────────────────────────
  courtFlipped: false, // home team attacks from right side

  // ─── On-court lineups ────────────────────────────────────────
  // Array of player objects { id, number, name, position, isGoalkeeper }
  homeLineup: [],
  awayLineup: [],

  // ─── Active exclusions ───────────────────────────────────────
  // [{ id, playerId, teamId, sanctionType, endsAtSeconds, isPermanent }]
  exclusions: [],

  // ─── Event builder (multi-step UI) ───────────────────────────
  selectedTeamSide: 'home',  // 'home' | 'away'
  selectedPlayerId: null,
  selectedGoalkeeperId: null,
  selectedZone: null,
  selectedGoalSection: null,
  activePanel: 'none', // 'none' | 'sanciones' | 'ataque' | 'defensa'
  isInterrupted: false, // timer paused for event entry

  // ─── Actions ─────────────────────────────────────────────────
  initMatch(matchData) {
    set({
      matchId:        matchData.id,
      homeTeam:       matchData.homeTeam,
      awayTeam:       matchData.awayTeam,
      half:           matchData.half           ?? 1,
      status:         matchData.status         ?? 'pending',
      homeScore:      matchData.home_score     ?? 0,
      awayScore:      matchData.away_score     ?? 0,
      elapsedSeconds: matchData.elapsed_seconds ?? 0,
      courtFlipped:   matchData.court_flip     ?? false,
      isRunning:      false,
    })
  },

  setLineup(side, players) {
    set(side === 'home' ? { homeLineup: players } : { awayLineup: players })
  },

  // Timer
  startTimer() {
    set({ isRunning: true, timerStartedAt: Date.now() })
  },
  pauseTimer() {
    set({ isRunning: false, timerStartedAt: null })
  },
  tickTimer() {
    set(s => ({ elapsedSeconds: s.elapsedSeconds + 1 }))
  },

  // Interruption (pause for event entry)
  interrupt() {
    set({ isInterrupted: true, isRunning: false })
  },
  resume() {
    set({ isInterrupted: false, isRunning: true, timerStartedAt: Date.now() })
  },

  // Event builder
  selectTeamSide(side) {
    set({ selectedTeamSide: side, selectedPlayerId: null })
  },
  selectPlayer(id) {
    const state = get()
    const lineup = state.selectedTeamSide === 'home' ? state.homeLineup : state.awayLineup
    const player = lineup.find(p => p.id === id)
    // Auto-select goalkeeper
    const gk = lineup.find(p => p.isGoalkeeper && p.id !== id)
    set({
      selectedPlayerId: id,
      selectedGoalkeeperId: gk?.id ?? null,
      isInterrupted: true,
      isRunning: false,
    })
  },
  selectZone(zone) {
    set({ selectedZone: zone })
  },
  selectGoalSection(section) {
    set({ selectedGoalSection: section })
  },
  setActivePanel(panel) {
    set({ activePanel: panel })
  },
  clearEventBuilder() {
    set({
      selectedPlayerId: null,
      selectedGoalkeeperId: null,
      selectedZone: null,
      selectedGoalSection: null,
      activePanel: 'none',
    })
  },

  // Score
  addGoal(side) {
    set(s => side === 'home'
      ? { homeScore: s.homeScore + 1 }
      : { awayScore: s.awayScore + 1 }
    )
  },

  // Exclusions
  addExclusion({ id, playerId, teamId, sanctionType, isPermanent }) {
    const endsAt = isPermanent ? null : get().elapsedSeconds + EXCLUSION_DURATION
    set(s => ({
      exclusions: [
        ...s.exclusions,
        { id, playerId, teamId, sanctionType, isPermanent, endsAtSeconds: endsAt },
      ],
    }))
  },
  resolveExpiredExclusions() {
    const now = get().elapsedSeconds
    set(s => ({
      exclusions: s.exclusions.filter(
        e => e.isPermanent || e.endsAtSeconds > now
      ),
    }))
  },

  // Half management
  nextHalf() {
    set(s => ({
      half: s.half + 1,
      elapsedSeconds: 0,
      isRunning: false,
      status: s.half >= 2 ? 'finished' : 'live',
    }))
  },

  flipCourt() {
    set(s => ({ courtFlipped: !s.courtFlipped }))
  },

  reset() {
    set({
      matchId: null, homeTeam: null, awayTeam: null,
      half: 1, status: 'pending',
      homeScore: 0, awayScore: 0,
      elapsedSeconds: 0, isRunning: false, timerStartedAt: null,
      courtFlipped: false, homeLineup: [], awayLineup: [],
      exclusions: [], selectedTeamSide: 'home',
      selectedPlayerId: null, selectedGoalkeeperId: null,
      selectedZone: null, selectedGoalSection: null,
      activePanel: 'none', isInterrupted: false,
    })
  },
}))

export default useMatchStore
