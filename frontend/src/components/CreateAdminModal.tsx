import { useState } from 'react'
import { api } from '../services/api'

interface Props {
  open: boolean
  onClose: () => void
}

export default function CreateAdminModal({ open, onClose }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [creating, setCreating] = useState(false)

  if (!open) return null

  const handleCreate = async () => {
    setError('')
    setSuccess('')
    if (!username || !password || !fullName) {
      setError('Todos los campos son obligatorios')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    setCreating(true)
    try {
      await api.auth.register({ username, password, full_name: fullName })
      setSuccess(`Admin "${username}" creado correctamente`)
      setUsername('')
      setPassword('')
      setFullName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear admin')
    } finally {
      setCreating(false)
    }
  }

  const handleClose = () => {
    setError('')
    setSuccess('')
    setUsername('')
    setPassword('')
    setFullName('')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Agregar Administrador</h2>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded mb-4 text-sm">
            {success}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo</label>
            <input type="text" value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Usuario</label>
            <input type="text" value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña</label>
            <input type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={handleClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50">
              Cancelar
            </button>
            <button onClick={handleCreate} disabled={creating}
              className="px-4 py-2 text-sm text-white bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-50">
              {creating ? 'Creando...' : 'Crear Admin'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
