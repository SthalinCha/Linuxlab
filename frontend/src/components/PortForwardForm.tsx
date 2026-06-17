import { useState } from 'react'

interface PortForwardFormProps {
  selectedCount: number
  hasOfflineSelected: boolean
  onAdd: (service: string, port: number) => void
}

export default function PortForwardForm({
  selectedCount,
  hasOfflineSelected,
  onAdd,
}: PortForwardFormProps) {
  const [service, setService] = useState('')
  const [vmPort, setVmPort] = useState('')
  const [touched, setTouched] = useState({ service: false, port: false })

  const portNum = parseInt(vmPort, 10)
  const serviceError = touched.service && service.trim().length > 0 && service.trim().length > 20
  const portError = touched.port && vmPort.length > 0 && (isNaN(portNum) || portNum < 1 || portNum > 65535)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = service.trim()
    const portNum = parseInt(vmPort, 10)

    if (!trimmed) return
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) return
    if (selectedCount === 0) return

    onAdd(trimmed.slice(0, 20), portNum)
    setService('')
    setVmPort('')
    setTouched({ service: false, port: false })
  }

  const canSubmit = service.trim().length > 0
    && service.trim().length <= 20
    && vmPort.length > 0
    && !isNaN(portNum)
    && portNum >= 1
    && portNum <= 65535
    && selectedCount > 0

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[140px]">
        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          <i className="fas fa-tag mr-1.5 text-slate-400" />
          Servicio
        </label>
        <input
          type="text"
          value={service}
          onChange={(e) => setService(e.target.value)}
          onBlur={() => setTouched(prev => ({ ...prev, service: true }))}
          placeholder="Ej: SSH, HTTP, MySQL"
          disabled={selectedCount === 0}
          className={`
            w-full px-3 py-2 text-sm rounded-lg border transition-all duration-150
            ${selectedCount === 0
              ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
              : serviceError
                ? 'border-red-300 bg-red-50 text-red-800 focus:border-red-500 focus:ring-red-200'
                : 'bg-white text-slate-800 border-slate-300 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
            }
          `}
        />
        {serviceError && (
          <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
            <i className="fas fa-exclamation-circle" /> Máximo 20 caracteres
          </p>
        )}
      </div>

      <div className="w-28">
        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          <i className="fas fa-plug mr-1.5 text-slate-400" />
          Puerto VM
        </label>
        <input
          type="number"
          min={1}
          max={65535}
          value={vmPort}
          onChange={(e) => setVmPort(e.target.value)}
          onBlur={() => setTouched(prev => ({ ...prev, port: true }))}
          placeholder="Ej: 22"
          disabled={selectedCount === 0}
          className={`
            w-full px-3 py-2 text-sm rounded-lg border transition-all duration-150
            ${selectedCount === 0
              ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
              : portError
                ? 'border-red-300 bg-red-50 text-red-800 focus:border-red-500 focus:ring-red-200'
                : 'bg-white text-slate-800 border-slate-300 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
            }
          `}
        />
        {portError && (
          <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
            <i className="fas fa-exclamation-circle" /> Puerto debe ser 1–65535
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className={`
          px-5 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all duration-150
          ${canSubmit
            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow'
            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }
        `}
      >
        <i className="fas fa-plus" />
        Agregar
        {selectedCount > 0 && (
          <span className="ml-0.5 text-xs opacity-75">({selectedCount})</span>
        )}
      </button>

      {selectedCount === 0 && (
        <p className="w-full text-xs text-amber-600 flex items-center gap-1.5 mt-1">
          <i className="fas fa-info-circle" />
          Marca una o más VMs con el checkbox para agregar reglas
        </p>
      )}

      {hasOfflineSelected && (
        <p className="w-full text-xs text-red-500 flex items-center gap-1.5 mt-1">
          <i className="fas fa-triangle-exclamation" />
          Hay VMs inactivas seleccionadas — las reglas solo se aplicarán a las VMs activas
        </p>
      )}
    </form>
  )
}
