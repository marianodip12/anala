import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import useMatchStore from '@/store/matchStore'

export function useMatches() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('matches')
        .select(`
          *,
          homeTeam:home_team_id ( id, name, short_name, color ),
          awayTeam:away_team_id ( id, name, short_name, color )
        `)
        .order('created_at', { ascending: false })
      setMatches(data ?? [])
      setLoading(false)
    }
    fetch()
  }, [])

  const createMatch = async ({ homeTeamId, awayTeamId, date }) => {
    const { data, error } = await supabase
      .from('matches')
      .insert({ home_team_id: homeTeamId, away_team_id: awayTeamId, date })
      .select(`
        *,
        homeTeam:home_team_id ( id, name, short_name, color ),
        awayTeam:away_team_id ( id, name, short_name, color )
      `)
      .single()
    if (error) throw error
    return data
  }

  return { matches, loading, createMatch }
}

export function useMatch(matchId) {
  const [match, setMatch] = useState(null)
  const [loading, setLoading] = useState(true)
  const store = useMatchStore()

  // Load match + lineup from Supabase
  const load = useCallback(async () => {
    if (!matchId) return
    setLoading(true)

    const [{ data: matchData }, { data: lineupData }] = await Promise.all([
      supabase.from('matches').select(`
        *,
        homeTeam:home_team_id ( id, name, short_name, color ),
        awayTeam:away_team_id ( id, name, short_name, color )
      `).eq('id', matchId).single(),
      supabase.from('lineup').select(`
        *, player:player_id ( id, number, name, position )
      `).eq('match_id', matchId).eq('is_on_court', true),
    ])

    if (matchData) {
      store.initMatch(matchData)
      setMatch(matchData)
      // Separate lineups by team
      const homeId = matchData.home_team_id
      const homePlayers = (lineupData ?? [])
        .filter(l => l.team_id === homeId)
        .map(l => ({ ...l.player, isGoalkeeper: l.is_goalkeeper }))
      const awayPlayers = (lineupData ?? [])
        .filter(l => l.team_id !== homeId)
        .map(l => ({ ...l.player, isGoalkeeper: l.is_goalkeeper }))
      store.setLineup('home', homePlayers)
      store.setLineup('away', awayPlayers)
    }
    setLoading(false)
  }, [matchId])

  useEffect(() => { load() }, [load])

  // Persist timer state to Supabase periodically (every 10 secs)
  const syncTimer = useCallback(async () => {
    const s = useMatchStore.getState()
    if (!s.matchId) return
    await supabase.from('matches').update({
      elapsed_seconds: s.elapsedSeconds,
      home_score: s.homeScore,
      away_score: s.awayScore,
      half: s.half,
      status: s.status,
    }).eq('id', s.matchId)
  }, [])

  // ─── Log an event to Supabase ────────────────────────────────
  const logEvent = async (eventData) => {
    const s = useMatchStore.getState()
    const minute = Math.floor(s.elapsedSeconds / 60)
    const secondInMin = s.elapsedSeconds % 60

    const { data, error } = await supabase.from('events').insert({
      match_id:        s.matchId,
      half:            s.half,
      minute,
      second_in_min:   secondInMin,
      elapsed_seconds: s.elapsedSeconds,
      ...eventData,
    }).select().single()

    if (error) throw error

    // Update score if goal
    if (eventData.shot_result === 'goal') {
      const side = eventData.team_id === s.homeTeam?.id ? 'home' : 'away'
      store.addGoal(side)
      await supabase.from('matches').update({
        home_score: useMatchStore.getState().homeScore,
        away_score: useMatchStore.getState().awayScore,
      }).eq('id', s.matchId)
    }

    // Handle exclusion
    if (eventData.event_type === 'sanction' && eventData.sanction_type !== 'yellow') {
      const isPermanent = ['red', 'blue'].includes(eventData.sanction_type)
      const endsAt = isPermanent ? null : s.elapsedSeconds + 120
      const { data: excl } = await supabase.from('exclusions').insert({
        match_id:           s.matchId,
        event_id:           data.id,
        player_id:          eventData.player_id,
        team_id:            eventData.team_id,
        sanction_type:      eventData.sanction_type,
        is_permanent:       isPermanent,
        started_at_seconds: s.elapsedSeconds,
        ends_at_seconds:    endsAt,
      }).select().single()

      if (!error && excl) {
        store.addExclusion({
          id:           excl.id,
          playerId:     excl.player_id,
          teamId:       excl.team_id,
          sanctionType: excl.sanction_type,
          isPermanent,
        })
      }
    }

    return data
  }

  // ─── Lineup management ───────────────────────────────────────
  const setPlayerOnCourt = async (playerId, teamId, isGoalkeeper, isOnCourt) => {
    const s = useMatchStore.getState()
    await supabase.from('lineup').upsert({
      match_id:      s.matchId,
      team_id:       teamId,
      player_id:     playerId,
      is_goalkeeper: isGoalkeeper,
      is_on_court:   isOnCourt,
      entered_at_secs: isOnCourt ? s.elapsedSeconds : undefined,
      left_at_secs:  !isOnCourt ? s.elapsedSeconds : undefined,
    }, { onConflict: 'match_id,team_id,player_id' })
  }

  return { match, loading, logEvent, syncTimer, setPlayerOnCourt, reload: load }
}
