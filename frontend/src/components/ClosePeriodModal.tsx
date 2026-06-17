import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  periodCode: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ClosePeriodModal({ open, periodCode, onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) confirmRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  const titleId = 'close-period-modal-title'
  const descId = 'close-period-modal-desc'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} aria-label="Cerrar" />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <i className="fas fa-lock text-amber-600"></i>
          </div>
          <h2 id={titleId} className="text-lg font-semibold text-slate-800">Cerrar Período {periodCode}</h2>
        </div>
        <p id={descId} className="text-sm text-slate-600 mb-4">
          Al cerrar el período se liberarán <strong>todas las asignaciones activas</strong>.
          Las VMs quedarán disponibles para el próximo período.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <i className="fas fa-triangle-exclamation mt-0.5"></i>
            <span>Esta acción no se puede deshacer. Los estudiantes perderán acceso a sus VMs asignadas.</span>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded hover:bg-slate-200">
            Cancelar
          </button>
          <button ref={confirmRef} onClick={onConfirm}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded hover:bg-red-700">
            Cerrar Período
          </button>
        </div>
      </div>
    </div>
  )
}
