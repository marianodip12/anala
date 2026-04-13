import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import clsx from 'clsx'
import { useTeams, usePlayers } from '@/hooks/useTeams'
import { Button, Modal, Input, Spinner } from '@/components/ui'

// ─── Color presets ────────────────────────────────────────────
const COLORS = [
  '#ef6461','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
  '#ffffff','#6b7280',
]

// ─── Team form modal ──────────────────────────────────────────
function TeamFormModal({ isOpen, onClose, team, onSave }) {
  const [name, setName]         = useState(team?.name ?? '')
  const [shortName, setShort]   = useState(team?.short_name ?? '')
  const [color, setColor]       = useState(team?.color ?? '#ef6461')
  const [isMine, setIsMine]     = useState(team?.is_mine ?? false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const handleSave = async () => {
    if (!name.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      await onSave({ name: name.trim(), short_name: shortName.trim() || name.slice(0,3).toUpperCase(), color, is_mine: isMine })
      onClose()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={team ? 'Editar equipo' : 'Nuevo equipo'} size="md">
      <div className="flex flex-col gap-4">
        <Input label="Nombre del equipo" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Balonmano Buenos Aires" />
        <Input label="Abreviación (3 letras)" value={shortName} onChange={e => setShort(e.target.value)} placeholder="BBA" maxLength={5} />

        <div>
          <p className="text-sm text-gray-300 font-medium mb-2">Color del equipo</p>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={clsx('w-8 h-8 rounded-full border-2 transition-all', color === c ? 'border-white scale-110' : 'border-transparent')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setIsMine(!isMine)}
            className={clsx('w-10 h-6 rounded-full transition-all', isMine ? 'bg-brand-primary' : 'bg-white/20')}
          >
            <div className={clsx('w-5 h-5 bg-white rounded-full mt-0.5 transition-all shadow', isMine ? 'ml-4.5' : 'ml-0.5')} style={{ marginLeft: isMine ? '1.125rem' : '0.125rem' }} />
          </div>
          <span className="text-sm text-gray-300">Es mi equipo</span>
        </label>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} fullWidth>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving} fullWidth>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Player form modal ────────────────────────────────────────
function PlayerFormModal({ isOpen, onClose, player, onSave }) {
  const [number, setNumber]   = useState(player?.number ?? '')
  const [name, setName]       = useState(player?.name ?? '')
  const [position, setPos]    = useState(player?.position ?? 'field')
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !number) { setError('Número y nombre son obligatorios'); return }
    setSaving(true)
    try {
      await onSave({ number: parseInt(number), name: name.trim(), position })
      onClose()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={player ? 'Editar jugador' : 'Agregar jugador'} size="sm">
      <div className="flex flex-col gap-4">
        <Input label="Número" value={number} onChange={e => setNumber(e.target.value)} type="number" min="1" max="99" />
        <Input label="Nombre" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del jugador" />
        <div className="flex gap-2">
          {['field','goalkeeper'].map(pos => (
            <button
              key={pos}
              onClick={() => setPos(pos)}
              className={clsx(
                'flex-1 py-2 rounded-xl text-sm font-semibold border transition-all',
                position === pos ? 'bg-brand-primary/30 border-brand-primary text-white' : 'border-white/20 text-gray-400',
              )}
            >
              {pos === 'field' ? '🤾 Campo' : '🧤 Arquero'}
            </button>
          ))}
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} fullWidth>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving} fullWidth>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Teams List ───────────────────────────────────────────────
export function TeamsList() {
  const { teams, loading, createTeam } = useTeams()
  const [showForm, setShowForm] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky top-0 z-20 bg-court-bg/90 backdrop-blur border-b border-white/10
                      flex items-center justify-between px-4 py-3">
        <h1 className="text-white font-bold text-xl">Equipos</h1>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>+ Nuevo</Button>
      </div>

      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={8} /></div>
        ) : teams.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="text-5xl">👥</span>
            <p className="text-gray-400">Todavía no tenés equipos.<br />Creá el tuyo primero.</p>
            <Button variant="primary" onClick={() => setShowForm(true)}>Crear equipo</Button>
          </div>
        ) : (
          teams.map(team => (
            <button
              key={team.id}
              onClick={() => navigate(`/teams/${team.id}`)}
              className="w-full bg-court-surface rounded-2xl p-4 flex items-center gap-4
                         border border-white/10 hover:border-white/25 transition-all active:scale-[0.99]"
            >
              <div className="w-10 h-10 rounded-full flex-shrink-0"
                   style={{ backgroundColor: team.color }} />
              <div className="flex-1 text-left">
                <p className="text-white font-bold">{team.name}</p>
                <p className="text-gray-500 text-sm">{team.short_name}</p>
              </div>
              {team.is_mine && (
                <span className="text-xs bg-brand-primary/20 text-brand-primary border border-brand-primary/30 px-2 py-0.5 rounded-full">
                  Mi equipo
                </span>
              )}
              <span className="text-gray-600">›</span>
            </button>
          ))
        )}
      </div>

      <TeamFormModal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSave={createTeam}
      />
    </div>
  )
}

// ─── Team Detail ──────────────────────────────────────────────
export function TeamDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { teams, updateTeam, deleteTeam } = useTeams()
  const { players, loading, addPlayer, updatePlayer, removePlayer } = usePlayers(id)

  const team = teams.find(t => t.id === id)
  const [showEditTeam, setShowEditTeam]     = useState(false)
  const [showAddPlayer, setShowAddPlayer]   = useState(false)
  const [editingPlayer, setEditingPlayer]   = useState(null)

  const handleDeleteTeam = async () => {
    if (!confirm(`¿Eliminar ${team?.name}? Esto borrará todos sus jugadores.`)) return
    await deleteTeam(id)
    navigate('/teams')
  }

  if (!team) return <div className="p-4 text-gray-400">Equipo no encontrado.</div>

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-court-bg/90 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/teams')} className="text-gray-400 text-xl">‹</button>
          <div className="w-8 h-8 rounded-full" style={{ backgroundColor: team.color }} />
          <h1 className="text-white font-bold text-lg flex-1 truncate">{team.name}</h1>
          <button onClick={() => setShowEditTeam(true)} className="text-gray-400 text-sm">✏️</button>
        </div>
      </div>

      {/* Players */}
      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-gray-400 text-sm">{players.length} jugadores</p>
          <Button variant="primary" size="sm" onClick={() => setShowAddPlayer(true)}>+ Jugador</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Spinner size={6} /></div>
        ) : players.length === 0 ? (
          <p className="text-center text-gray-500 py-8">Sin jugadores. Agregá el primero.</p>
        ) : (
          players.map(player => (
            <div
              key={player.id}
              className="bg-court-surface rounded-xl p-3 flex items-center gap-3 border border-white/10"
            >
              <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center
                               text-white font-black text-sm flex-shrink-0">
                {player.number}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">{player.name}</p>
                <p className="text-gray-500 text-xs">
                  {player.position === 'goalkeeper' ? '🧤 Arquero' : '🤾 Campo'}
                </p>
              </div>
              <button onClick={() => setEditingPlayer(player)} className="text-gray-500 px-2">✏️</button>
              <button onClick={() => removePlayer(player.id)} className="text-red-500/70 px-2">🗑</button>
            </div>
          ))
        )}

        {/* Danger zone */}
        <div className="mt-6 pt-4 border-t border-white/10">
          <Button variant="danger" size="sm" onClick={handleDeleteTeam}>Eliminar equipo</Button>
        </div>
      </div>

      {/* Modals */}
      <TeamFormModal
        isOpen={showEditTeam}
        onClose={() => setShowEditTeam(false)}
        team={team}
        onSave={(data) => updateTeam(id, data)}
      />
      <PlayerFormModal
        isOpen={showAddPlayer}
        onClose={() => setShowAddPlayer(false)}
        onSave={addPlayer}
      />
      {editingPlayer && (
        <PlayerFormModal
          isOpen
          onClose={() => setEditingPlayer(null)}
          player={editingPlayer}
          onSave={(data) => updatePlayer(editingPlayer.id, data)}
        />
      )}
    </div>
  )
}
