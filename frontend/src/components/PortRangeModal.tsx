import { useState } from 'react'
import { api } from '../services/api'
import { useToast } from '../hooks/useToast'
import type { VirtualMachine, PortRangeResultItem } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  selectedVms: VirtualMachine[]
}

type Step = 'config' | 'applying' | 'results' | 'error'

export default function PortRangeModal({ open, onClose, selectedVms }: Props) {
  const { addToast } = useToast()

  const [mode, setMode] = useState<'block' | 'linear'>('block')
  const [basePort, setBasePort] = useState(4010)
  const [portsPerVm, setPortsPerVm] = useState(20)
  const [guestPortStart, setGuestPortStart] = useState(4010)
  const [protocol, setProtocol] = useState<'tcp' | 'udp'>('tcp')
  const [description, setDescription] = useState('')
  const [step, setStep] = useState<Step>('config')
  const [progress, setProgress] = useState(0)
  const [totalRules, setTotalRules] = useState(0)
  const [results, setResults] = useState<PortRangeResultItem[]>([])
  const [error, setError] = useState('')

  if (!open) return null

  const runningVms = selectedVms.filter(vm => vm.current_state === 'running')
  const totalPorts = mode === 'block'
    ? runningVms.length * portsPerVm
    : runningVms.length

  const handleApply = async () => {
    setError('')
    setStep('applying')
    setProgress(0)
    setTotalRules(totalPorts)

    try {
      const res = await api.host.forwardRange({
        vms: runningVms.map(vm => ({
          id: vm.id,
          name: vm.name,
          ip: vm.ip_address || `192.168.122.${vm.name.replace(/\D/g, '')}`,
        })),
        mode,
        base_port: basePort,
        ports_per_vm: portsPerVm,
        guest_port_start: mode === 'block' ? guestPortStart : undefined,
        protocol,
        description: description || undefined,
      })

      setResults(res.results)
      setProgress(res.total)
      setStep('results')

      const errors = res.results.filter(r => r.status === 'error')
      if (errors.length > 0) {
        addToast('warning', `${errors.length} regla(s) con errores`)
      } else {
        addToast('success', `${res.total} regla(s) aplicadas correctamente`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setStep('error')
    }
  }

  const renderConfig = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Modo de Reenvío
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setMode('block')}
            className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
              mode === 'block'
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            <i className="fas fa-layer-group mr-2" />
            Bloque por VM
            <div className="text-xs font-normal mt-1 text-slate-400">Múltiples puertos x VM</div>
          </button>
          <button
            type="button"
            onClick={() => setMode('linear')}
            className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
              mode === 'linear'
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            <i className="fas fa-grip-lines mr-2" />
            Lineal
            <div className="text-xs font-normal mt-1 text-slate-400">1 puerto x VM</div>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          VMs Seleccionadas
        </label>
        <div className="bg-indigo-50 rounded-lg px-3 py-2 text-sm text-indigo-700">
          <span className="font-medium">{runningVms.length}</span> VM(s) activas
          <span className="text-slate-400 mx-1">·</span>
          {runningVms.map(vm => vm.name).join(', ')}
        </div>
        {selectedVms.length !== runningVms.length && (
          <p className="text-xs text-amber-600 mt-1">
            <i className="fas fa-exclamation-triangle mr-1" />
            {selectedVms.length - runningVms.length} VM(s) omitidas por no estar activas
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Puerto Base
          </label>
          <input
            type="number"
            value={basePort}
            onChange={e => setBasePort(Number(e.target.value))}
            min={1}
            max={65535}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Protocolo
          </label>
          <select
            value={protocol}
            onChange={e => setProtocol(e.target.value as 'tcp' | 'udp')}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 bg-white"
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </select>
        </div>
      </div>

      {mode === 'block' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Puertos por VM
            </label>
            <input
              type="number"
              value={portsPerVm}
              onChange={e => setPortsPerVm(Number(e.target.value))}
              min={1}
              max={1000}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Puerto Invitado Inicio
            </label>
            <input
              type="number"
              value={guestPortStart}
              onChange={e => setGuestPortStart(Number(e.target.value))}
              min={1}
              max={65535}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Descripción <span className="font-normal normal-case text-slate-400">(opcional)</span>
        </label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Ej: Laboratorio redes semestre 2025-I"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
        />
      </div>

      <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500 flex items-center gap-2">
        <i className="fas fa-calculator" />
        Total: <strong>{totalPorts}</strong> regla(s) para {runningVms.length} VM(s)
        {mode === 'block' && <span> ({portsPerVm} c/u)</span>}
      </div>
    </div>
  )

  const renderApplying = () => (
    <div className="space-y-4 py-6 text-center">
      <i className="fas fa-spinner fa-spin text-3xl text-indigo-500 mb-2" />
      <p className="text-sm text-slate-600">Aplicando reglas de reenvío...</p>
      <div className="w-full bg-slate-100 rounded-full h-2.5">
        <div
          className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300"
          style={{ width: `${totalRules > 0 ? (progress / totalRules) * 100 : 0}%` }}
        />
      </div>
      <p className="text-xs text-slate-400">{progress} de {totalRules} reglas</p>
    </div>
  )

  const renderResults = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-emerald-600 mb-1">
        <i className="fas fa-check-circle" />
        <span className="font-medium">Completado — {results.length} regla(s) procesadas</span>
      </div>
      <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-3 py-2 text-left font-semibold text-slate-500">VM</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Puerto Host</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-500">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((r, i) => (
              <tr key={i} className={r.status === 'error' ? 'bg-red-50' : ''}>
                <td className="px-3 py-1.5 text-slate-700">{r.vm}</td>
                <td className="px-3 py-1.5 font-mono text-slate-600">{r.host_ports || '—'}</td>
                <td className="px-3 py-1.5 text-center">
                  {r.status === 'ok' ? (
                    <span className="text-emerald-600"><i className="fas fa-check-circle" /></span>
                  ) : (
                    <span title={r.message} className="text-red-500"><i className="fas fa-times-circle" /></span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderError = () => (
    <div className="space-y-3 py-4 text-center">
      <i className="fas fa-exclamation-circle text-3xl text-red-400 mb-2" />
      <p className="text-sm text-red-600 font-medium">Error al aplicar reglas</p>
      <p className="text-xs text-slate-500">{error}</p>
      <button
        onClick={() => setStep('config')}
        className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
      >
        Reintentar
      </button>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Reenvío de Puertos por Rango"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <i className="fas fa-arrows-alt-h text-indigo-500" />
            Reenvío por Rango
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="px-5 py-4">
          {step === 'config' && renderConfig()}
          {step === 'applying' && renderApplying()}
          {step === 'results' && renderResults()}
          {step === 'error' && renderError()}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100"
          >
            Cerrar
          </button>
          {step === 'config' && (
            <button
              onClick={handleApply}
              disabled={runningVms.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <i className="fas fa-play" />
              Aplicar Reglas
            </button>
          )}
          {step === 'results' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              Listo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
