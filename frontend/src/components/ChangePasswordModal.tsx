import { useState, useRef } from 'react'
import { api } from '../services/api'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ChangePasswordModal({ open, onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [changing, setChanging] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  if (!open) return null

  const handleChange = async () => {
    setError('')
    setSuccess('')
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Todos los campos son obligatorios')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden')
      return
    }
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres')
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setChanging(true)
    try {
      await api.auth.changePassword(currentPassword, newPassword, { signal: controller.signal })
      if (controller.signal.aborted) return
      setSuccess('Contraseña actualizada correctamente')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al cambiar contraseña')
    } finally {
      if (!controller.signal.aborted) setChanging(false)
    }
  }

  const handleClose = () => {
    setError('')
    setSuccess('')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Cambiar Contraseña</h2>

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
            <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña actual</label>
            <input type="password" value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nueva contraseña</label>
            <input type="password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Confirmar nueva contraseña</label>
            <input type="password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={handleClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50">
              Cancelar
            </button>
            <button onClick={handleChange} disabled={changing}
              className="px-4 py-2 text-sm text-white bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-50">
              {changing ? 'Cambiando...' : 'Cambiar Contraseña'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
