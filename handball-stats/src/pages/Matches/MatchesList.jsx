import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import clsx from 'clsx'

import { useMatches } from '@/hooks/useMatch'
import { useTeams } from '@/hooks/useTeams'
import { Button, Modal, Select, Spinner } from '@/components/ui'

const STATUS_LABELS = {
  pending:  { label: 'Pendiente', color: '#6b7280' },
  live:     { label: 'En curso',  color: '#22c55e' },
  finished: { label: 'Finalizado',color: '#3b82f6' },
}

function MatchCard({ match, onClick }) {
  const st = STATUS_LABELS[match.status] ?? STATUS_LABELS.pending
  const date = format(new Date(match.date), "d MMM yyyy · HH:mm", { locale: es })

  return (
    <button
      onClick={onClick}
      className="w-full bg-court-surface rounded-2xl p-4 flex flex-col gap-3
                 border border-white/10 hover:border-white/25 transition-all active:scale-[0.99]"
    >
      {/* Header: status + date */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold" style={{ color: st.color }}>{st.label}</span>
        <span className="text-gray-500">{date}</span>
      </div>

      {/* Teams + score */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-start gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0"
                 style={{ backgroundColor: match.homeTeam?.color ?? '#ef6461' }} />
            <span className="text-white font-bold truncate">{match.homeTeam?.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0"
                 style={{ backgroundColor: match.awayTeam?.color ?? '#48cae4' }} />
            <span className="text-white font-bold truncate">{match.awayTeam?.name}</span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-3xl font-black text-white tabular-nums">
            {match.home_score} – {match.away_score}
          </span>
        </div>
      </div>
    </button>
  )
}

function NewMatchModal({ isOpen, onClose, onCreated }) {
  const { teams } = useTeams()
  const { createMatch } = useMatches()
  const [homeId, setHomeId] = useState('')
  const [awayId, setAwayId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const teamOptions = teams.map(t => ({ value: t.id, label: t.name }))

  const handleCreate = async () => {
    if (!homeId || !awayId) { setError('Seleccioná ambos equipos'); return }
    if (homeId === awayId) { setError('No pueden ser el mismo equipo'); return }
    setSaving(true)
    try {
      const match = await createMatch({ homeTeamId: homeId, awayTeamId: awayId, date: new Date().toISOString() })
      onCreated(match)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo partido" size="md">
      <div className="flex flex-col gap-4">
        <Select
          label="Equipo local"
          options={teamOptions}
          value={homeId}
          onChange={setHomeId}
          placeholder="Seleccionar local..."
        />
        <Select
          label="Equipo visitante"
          options={teamOptions}
          value={awayId}
          onChange={setAwayId}
          placeholder="Seleccionar visitante..."
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} fullWidth>Cancelar</Button>
          <Button variant="primary" onClick={handleCreate} disabled={saving} fullWidth>
            {saving ? 'Creando...' : 'Crear partido'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function MatchesList() {
  const { matches, loading } = useMatches()
  const navigate = useNavigate()
  const [showNew, setShowNew] = useState(false)

  const handleCreated = (match) => {
    setShowNew(false)
    navigate(`/matches/${match.id}`)
  }

  const openMatch = (match) => {
    navigate(`/matches/${match.id}`)
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-court-bg/90 backdrop-blur border-b border-white/10
                      flex items-center justify-between px-4 py-3">
        <h1 className="text-white font-bold text-xl">Partidos</h1>
        <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
          + Nuevo
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={8} /></div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="text-5xl">🤾</span>
            <p className="text-gray-400">No hay partidos aún.<br />Creá tu primer partido.</p>
            <Button variant="primary" onClick={() => setShowNew(true)}>Nuevo partido</Button>
          </div>
        ) : (
          matches.map(match => (
            <MatchCard key={match.id} match={match} onClick={() => openMatch(match)} />
          ))
        )}
      </div>

      <NewMatchModal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}
