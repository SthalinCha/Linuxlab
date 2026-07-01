import { useState, useEffect, useRef, type FormEvent } from 'react'
import LoadingButton from './LoadingButton'

interface Props {
  open: boolean
  student?: { id: number; full_name: string; email: string } | null
  onSave: (data: { full_name: string; email: string }) => Promise<void>
  onCancel: () => void
  saving?: boolean
}

export default function StudentFormModal({ open, student, onSave, onCancel, saving }: Props) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const isEdit = !!student

  useEffect(() => {
    if (open) {
      setFullName(student?.full_name || '')
      setEmail(student?.email || '')
      setError(null)
      setTimeout(() => nameRef.current?.focus(), 50)
    }
  }, [open, student])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, saving, onCancel])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const name = fullName.trim()
    const emailVal = email.trim()

    if (!name) {
      setError('El nombre del estudiante es obligatorio')
      return
    }
    if (!emailVal) {
      setError('El correo electrónico es obligatorio')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      setError('El correo electrónico no tiene un formato válido')
      return
    }

    await onSave({ full_name: name, email: emailVal })
  }

  if (!open) return null

  const titleId = 'student-form-modal-title'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="fixed inset-0 bg-black/40" onClick={saving ? undefined : onCancel} aria-label="Cerrar" />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <i className="fas fa-user-graduate text-indigo-600"></i>
          </div>
          <h2 id={titleId} className="text-lg font-semibold text-slate-800">
            {isEdit ? 'Editar Estudiante' : 'Nuevo Estudiante'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              <i className="fas fa-user mr-1"></i>Nombre Completo
            </label>
            <input
              ref={nameRef}
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej: Juan Pérez"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition-all"
              disabled={saving}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              <i className="fas fa-envelope mr-1"></i>Correo Electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ej: juan@example.com"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition-all"
              disabled={saving || isEdit}
              autoComplete="off"
            />
            {isEdit && (
              <p className="text-[0.65rem] text-slate-400 mt-1">No es posible cambiar el correo electrónico después de crear el estudiante.</p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <i className="fas fa-circle-exclamation mt-0.5 text-xs"></i>
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} disabled={saving}
              className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              Cancelar
            </button>
            <LoadingButton type="submit" variant="primary" loading={saving} loadingText={isEdit ? 'Guardando...' : 'Creando...'}>
              {isEdit ? 'Guardar Cambios' : 'Crear Estudiante'}
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  )
}
