interface Props {
  mode: 'block' | 'linear'
  basePort: number
  protocol: 'tcp' | 'udp'
  portsPerVm: number
  guestPortStart: number
  description: string
  selectedCount: number
  onChange: (config: {
    mode: 'block' | 'linear'
    basePort: number
    protocol: 'tcp' | 'udp'
    portsPerVm: number
    guestPortStart: number
    description: string
  }) => void
}

export default function RuleConfigurator({
  mode, basePort, protocol, portsPerVm, guestPortStart, description, selectedCount, onChange,
}: Props) {
  const totalPorts = mode === 'block'
    ? selectedCount * portsPerVm
    : selectedCount

  const update = (patch: Partial<Parameters<Props['onChange']>[0]>) => {
    onChange({ mode, basePort, protocol, portsPerVm, guestPortStart, description, ...patch })
  }

  return (
    <div className="space-y-5">
      {/* Mode selector with visual examples */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Modo de asignación
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => update({ mode: 'block' })}
            className={`
              relative p-4 rounded-xl border-2 text-left transition-all duration-150
              ${mode === 'block'
                ? 'border-indigo-500 bg-indigo-50/60 shadow-sm shadow-indigo-100'
                : 'border-slate-200 bg-white hover:border-slate-300'
              }
            `}
          >
            {mode === 'block' && (
              <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center">
                <i className="fas fa-check text-[10px] text-white" />
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                mode === 'block' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
              }`}>
                <i className="fas fa-layer-group" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800">Varios puertos por VM</div>
                <div className="text-xs text-slate-500 mt-1">
                  Cada VM recibe el mismo bloque de puertos consecutivos
                </div>
                <div className="mt-2.5 space-y-1">
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-400">VM 1:</span>
                    <span className="text-indigo-600 font-medium">{basePort}–{basePort + portsPerVm - 1}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-400">VM 2:</span>
                    <span className="text-indigo-600 font-medium">{basePort + portsPerVm}–{basePort + portsPerVm * 2 - 1}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-400">VM 3:</span>
                    <span className="text-indigo-600 font-medium">{basePort + portsPerVm * 2}–{basePort + portsPerVm * 3 - 1}</span>
                  </div>
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => update({ mode: 'linear' })}
            className={`
              relative p-4 rounded-xl border-2 text-left transition-all duration-150
              ${mode === 'linear'
                ? 'border-indigo-500 bg-indigo-50/60 shadow-sm shadow-indigo-100'
                : 'border-slate-200 bg-white hover:border-slate-300'
              }
            `}
          >
            {mode === 'linear' && (
              <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center">
                <i className="fas fa-check text-[10px] text-white" />
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                mode === 'linear' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
              }`}>
                <i className="fas fa-grip-lines" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800">Un puerto por VM</div>
                <div className="text-xs text-slate-500 mt-1">
                  Cada VM recibe un puerto único y consecutivo
                </div>
                <div className="mt-2.5 space-y-1">
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-400">VM 1:</span>
                    <span className="text-indigo-600 font-medium">{basePort}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-400">VM 2:</span>
                    <span className="text-indigo-600 font-medium">{basePort + 1}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-400">VM 3:</span>
                    <span className="text-indigo-600 font-medium">{basePort + 2}</span>
                  </div>
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Config fields */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Puerto Base
          </label>
          <input
            type="number"
            value={basePort}
            onChange={e => update({ basePort: Number(e.target.value) })}
            min={1}
            max={65535}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Protocolo
          </label>
          <select
            value={protocol}
            onChange={e => update({ protocol: e.target.value as 'tcp' | 'udp' })}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 bg-white"
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Puertos por VM
            {mode === 'linear' && (
              <span className="font-normal normal-case text-slate-400"> —</span>
            )}
          </label>
          <input
            type="number"
            value={mode === 'linear' ? 1 : portsPerVm}
            onChange={e => update({ portsPerVm: Number(e.target.value) })}
            min={1}
            max={1000}
            disabled={mode === 'linear'}
            className={`w-full px-3 py-2 text-sm border rounded-lg
              focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500
              ${mode === 'linear'
                ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                : 'border-slate-200 bg-white'
              }`}
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Puerto Invitado
          </label>
          <input
            type="number"
            value={guestPortStart}
            onChange={e => update({ guestPortStart: Number(e.target.value) })}
            min={1}
            max={65535}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
          />
          <p className="mt-0.5 text-[10px] text-slate-400">Puerto dentro de la VM</p>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Descripción <span className="font-normal normal-case text-slate-400">(opcional)</span>
        </label>
        <input
          type="text"
          value={description}
          onChange={e => update({ description: e.target.value })}
          placeholder="Ej: Laboratorio redes semestre 2025-I"
          maxLength={100}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
        />
      </div>

      {/* Mini summary */}
      <div className="bg-slate-50 rounded-lg px-4 py-2.5 flex items-center gap-3 text-xs text-slate-500">
        <i className="fas fa-calculator text-indigo-400" />
        <span>
          <strong className="text-slate-700">{totalPorts}</strong> regla(s) para{' '}
          <strong className="text-slate-700">{selectedCount}</strong> VM(s)
          {mode === 'block' && <> · <span className="text-slate-400">{portsPerVm} c/u</span></>}
        </span>
        <span className="ml-auto text-[10px] font-mono text-slate-400">
          {protocol.toUpperCase()} · host:{basePort} → guest:{guestPortStart}
        </span>
      </div>
    </div>
  )
}
