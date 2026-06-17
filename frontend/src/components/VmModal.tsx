import { useEffect, useRef } from 'react'

interface VmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  disabled?: boolean
  icon?: string
  iconBg?: string
  iconColor?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function VmModal({
  open, title, message, confirmLabel = 'Confirmar',
  danger = false, disabled = false, icon = 'fa-info-circle',
  iconBg = 'bg-slate-100', iconColor = 'text-slate-600',
  onConfirm, onCancel,
}: VmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) confirmRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disabled) onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, disabled, onCancel])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="vm-modal-title">
      <div className="fixed inset-0 backdrop-blur-sm bg-black/40" onClick={disabled ? undefined : onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
        <div className="flex flex-col items-center text-center mb-4">
          <div className={`w-14 h-14 rounded-full ${iconBg} flex items-center justify-center mb-3`}>
            <i className={`fas ${icon} ${iconColor} text-xl`}></i>
          </div>
          <h2 id="vm-modal-title" className="text-lg font-semibold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-600 mt-2">{message}</p>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={disabled}
            className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={disabled}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
