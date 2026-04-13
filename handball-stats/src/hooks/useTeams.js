import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useTeams() {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchTeams = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setTeams(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTeams() }, [fetchTeams])

  const createTeam = async (teamData) => {
    const { data, error } = await supabase
      .from('teams')
      .insert(teamData)
      .select()
      .single()
    if (error) throw error
    setTeams(prev => [data, ...prev])
    return data
  }

  const updateTeam = async (id, updates) => {
    const { data, error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    setTeams(prev => prev.map(t => t.id === id ? data : t))
    return data
  }

  const deleteTeam = async (id) => {
    const { error } = await supabase.from('teams').delete().eq('id', id)
    if (error) throw error
    setTeams(prev => prev.filter(t => t.id !== id))
  }

  return { teams, loading, error, refetch: fetchTeams, createTeam, updateTeam, deleteTeam }
}

export function usePlayers(teamId) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchPlayers = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('team_id', teamId)
      .order('number')
    setPlayers(data ?? [])
    setLoading(false)
  }, [teamId])

  useEffect(() => { fetchPlayers() }, [fetchPlayers])

  const addPlayer = async (playerData) => {
    const { data, error } = await supabase
      .from('players')
      .insert({ ...playerData, team_id: teamId })
      .select()
      .single()
    if (error) throw error
    setPlayers(prev => [...prev, data].sort((a, b) => a.number - b.number))
    return data
  }

  const updatePlayer = async (id, updates) => {
    const { data, error } = await supabase
      .from('players')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    setPlayers(prev => prev.map(p => p.id === id ? data : p))
    return data
  }

  const removePlayer = async (id) => {
    const { error } = await supabase.from('players').delete().eq('id', id)
    if (error) throw error
    setPlayers(prev => prev.filter(p => p.id !== id))
  }

  return { players, loading, refetch: fetchPlayers, addPlayer, updatePlayer, removePlayer }
}
