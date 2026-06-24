import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '../services/api'
import { useToast } from '../hooks/useToast'
import type { VirtualMachine, PortRangeResultItem, BulkPortEntry } from '../types'
import WizardStepper from './WizardStepper'
import VmSelector from './VmSelector'
import RuleConfigurator from './RuleConfigurator'
import PortPreview from './PortPreview'

interface Props {
  open: boolean
  onClose: () => void
  selectedVms: VirtualMachine[]
  allVms?: VirtualMachine[]
  onApply?: (updatedVms: VirtualMachine[]) => void
}

type Phase = 'config' | 'applying' | 'results' | 'error'

const STEPS = [
  { number: 1, label: 'Seleccionar VMs' },
  { number: 2, label: 'Configurar reglas' },
  { number: 3, label: 'Vista previa' },
]

export default function PortRangeModal({ open, onClose, selectedVms, allVms, onApply }: Props) {
  const { addToast } = useToast()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [phase, setPhase] = useState<Phase>('config')

  // Step 1 — VM selection
  const [vmGridIds, setVmGridIds] = useState<Set<number>>(new Set(selectedVms.map(v => v.id)))
  const [vmRangeMode, setVmRangeMode] = useState(false)
  const [fromNumber, setFromNumber] = useState(10)
  const [toNumber, setToNumber] = useState(50)

  // Step 2 — Rule config
  const [mode, setMode] = useState<'block' | 'linear'>('block')
  const [basePort, setBasePort] = useState(4010)
  const [portsPerVm, setPortsPerVm] = useState(20)
  const [guestPortStart, setGuestPortStart] = useState(4010)
  const [protocol, setProtocol] = useState<'tcp' | 'udp'>('tcp')
  const [description, setDescription] = useState('')

  // Applying / Results
  const [progress, setProgress] = useState(0)
  const [totalRules, setTotalRules] = useState(0)
  const [results, setResults] = useState<PortRangeResultItem[]>([])
  const [error, setError] = useState('')

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep(1)
      setPhase('config')
      setVmGridIds(new Set(selectedVms.map(v => v.id)))
      setVmRangeMode(false)
      setResults([])
      setError('')
      setProgress(0)
    }
  }, [open, selectedVms])

  // Focus trap
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        const el = dialogRef.current?.querySelector<HTMLElement>('input, button')
        el?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [open, step])

  // Derive selected VMs from either grid or range mode
  const selectedVmIds = vmRangeMode
    ? new Set<number>(
        (allVms || []).filter(vm => {
          const num = parseInt(vm.name.replace(/\D/g, ''), 10)
          return !isNaN(num) && num >= fromNumber && num <= toNumber
        }).map(vm => vm.id)
      )
    : vmGridIds

  const rangeModeRunningVms = vmRangeMode
    ? (allVms || []).filter(vm => {
        const num = parseInt(vm.name.replace(/\D/g, ''), 10)
        return !isNaN(num) && num >= fromNumber && num <= toNumber && vm.current_state === 'running'
      })
    : []

  // Final list of running VMs to apply rules to
  const runningVms = vmRangeMode
    ? rangeModeRunningVms
    : (allVms || []).filter(vm => selectedVmIds.has(vm.id) && vm.current_state === 'running')

  const totalPorts = mode === 'block'
    ? runningVms.length * portsPerVm
    : runningVms.length

  const canGoNext = (s: number) => {
    if (s === 1) return selectedVmIds.size > 0
    if (s === 2) return runningVms.length > 0 && basePort >= 1 && basePort <= 65535 && portsPerVm >= 1
    return true
  }

  const handleNext = () => {
    if (step === 1) {
      if (runningVms.length === 0) {
        addToast('warning', 'Ninguna VM seleccionada está activa')
        return
      }
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    }
  }

  const handleBack = () => {
    if (step > 1) setStep(s => (s - 1) as 1 | 2 | 3)
  }

  const applyAbortRef = useRef<AbortController | null>(null)

  const handleApply = async () => {
    applyAbortRef.current?.abort()
    const controller = new AbortController()
    applyAbortRef.current = controller

    setError('')
    setPhase('applying')
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
      }, { signal: controller.signal })

      if (controller.signal.aborted) return
      setResults(res.results)
      setProgress(res.total)

      const updatedVms: VirtualMachine[] = []
      let saveErrors = 0
      for (const [idx, vm] of runningVms.entries()) {
        if (controller.signal.aborted) return
        const serviceName = (description || 'CUSTOM').trim().toUpperCase()
        const ports: BulkPortEntry[] = []
        if (mode === 'block') {
          const vmBase = basePort + idx * portsPerVm
          const guestStart = guestPortStart ?? basePort
          for (let offset = 0; offset < portsPerVm; offset++) {
            ports.push({ host: vmBase + offset, vm: guestStart + offset, service: serviceName, serviceName })
          }
        } else {
          ports.push({ host: basePort + idx, vm: guestPortStart ?? basePort, service: serviceName, serviceName })
        }
        try {
          const updated = await api.vms.bulkSavePorts({ vm_id: vm.id, ports }, { signal: controller.signal })
          if (controller.signal.aborted) return
          updatedVms.push(updated)
        } catch {
          saveErrors++
        }
      }

      if (controller.signal.aborted) return
      onApply?.(updatedVms)

      setPhase('results')

      const errors = res.results.filter(r => r.status === 'error')
      if (errors.length > 0) {
        addToast('warning', `${errors.length} regla(s) con errores en iptables`)
      }
      if (saveErrors > 0) {
        addToast('warning', `${saveErrors} VM(s) con errores al guardar`)
      }
      if (errors.length === 0 && saveErrors === 0) {
        addToast('success', `${res.total} regla(s) aplicadas correctamente`)
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setPhase('error')
    }
  }

  // Keyboard: Escape to close
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && phase === 'config') onClose()
  }, [onClose, phase])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Reenvío de Puertos por Rango"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <i className="fas fa-arrows-alt-h text-indigo-500" />
            Reenvío por Rango
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Stepper */}
        {phase === 'config' && (
          <div className="px-6 border-b border-slate-100 flex-shrink-0">
            <WizardStepper steps={STEPS} current={step} />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {phase === 'config' && step === 1 && (
            <div className="space-y-4">
              {/* Range mode toggle */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Selección
                </span>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setVmRangeMode(false)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      !vmRangeMode
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <i className="fas fa-th mr-1" />
                    Grid
                  </button>
                  <button
                    type="button"
                    onClick={() => setVmRangeMode(true)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      vmRangeMode
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <i className="fas fa-arrows-left-right mr-1" />
                    Rango
                  </button>
                </div>
                {!vmRangeMode && !vmGridIds.has(selectedVms[0]?.id) && selectedVms.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setVmGridIds(new Set(selectedVms.map(v => v.id)))}
                    className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                  >
                    Restaurar selección previa ({selectedVms.length})
                  </button>
                )}
              </div>

              {vmRangeMode ? (
                /* Numeric range mode */
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                          VM desde #
                        </label>
                        <input
                          type="number"
                          value={fromNumber}
                          onChange={e => setFromNumber(Number(e.target.value))}
                          min={1}
                          max={254}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                          VM hasta #
                        </label>
                        <input
                          type="number"
                          value={toNumber}
                          onChange={e => setToNumber(Number(e.target.value))}
                          min={1}
                          max={254}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="bg-indigo-50 rounded-xl px-4 py-3 text-sm text-indigo-700">
                    <span className="font-medium">{rangeModeRunningVms.length}</span> VM(s) activas encontradas
                    <span className="text-slate-400 ml-1">
                      (vhost-{fromNumber} a vhost-{toNumber})
                    </span>
                  </div>
                  {rangeModeRunningVms.length === 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <i className="fas fa-triangle-exclamation" />
                      No se encontraron VMs activas en ese rango
                    </p>
                  )}
                </div>
              ) : (
                /* Grid mode */
                <VmSelector
                  allVms={allVms || []}
                  selectedIds={vmGridIds}
                  onSelectionChange={setVmGridIds}
                />
              )}

              {/* Offline warning */}
              {!vmRangeMode && selectedVmIds.size > 0 && runningVms.length < selectedVmIds.size && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <div className="flex items-start gap-2 text-sm text-amber-700">
                    <i className="fas fa-triangle-exclamation mt-0.5" />
                    <div>
                      <span className="font-medium">
                        {selectedVmIds.size - runningVms.length} VM(s) omitidas
                      </span>
                      {' '}por no estar activas. Solo se configurarán las VMs en ejecución.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === 'config' && step === 2 && (
            <RuleConfigurator
              mode={mode}
              basePort={basePort}
              protocol={protocol}
              portsPerVm={portsPerVm}
              guestPortStart={guestPortStart}
              description={description}
              selectedCount={runningVms.length}
              onChange={c => {
                setMode(c.mode)
                setBasePort(c.basePort)
                setProtocol(c.protocol)
                setPortsPerVm(c.portsPerVm)
                setGuestPortStart(c.guestPortStart)
                setDescription(c.description)
              }}
            />
          )}

          {phase === 'config' && step === 3 && (
            <PortPreview
              vms={runningVms}
              config={{ mode, basePort, portsPerVm, guestPortStart, protocol, description }}
            />
          )}

          {phase === 'applying' && (
            <div className="space-y-4 py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center mx-auto">
                <i className="fas fa-spinner fa-spin text-2xl text-indigo-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Aplicando reglas de reenvío...</p>
                <p className="text-xs text-slate-400 mt-1">Creando reglas DNAT en el host y guardando en la base de datos</p>
              </div>
              <div className="w-full max-w-sm mx-auto bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${totalRules > 0 ? (progress / totalRules) * 100 : 0}%` }}
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={totalRules}
                />
              </div>
              <p className="text-xs text-slate-400">{progress} de {totalRules} reglas</p>
            </div>
          )}

          {phase === 'results' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <i className="fas fa-check-circle text-lg" />
                <span className="font-medium">Completado — {results.length} regla(s) procesadas</span>
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500">VM</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Puerto Host</th>
                      <th className="px-4 py-2.5 text-center font-semibold text-slate-500 w-20">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.map((r, i) => (
                      <tr key={i} className={r.status === 'error' ? 'bg-red-50' : ''}>
                        <td className="px-4 py-2 font-medium text-slate-700">{r.vm}</td>
                        <td className="px-4 py-2 font-mono text-slate-500">{r.host_ports || '—'}</td>
                        <td className="px-4 py-2 text-center">
                          {r.status === 'ok' ? (
                            <span className="text-emerald-600 inline-flex items-center gap-1" title="OK">
                              <i className="fas fa-check-circle" />
                              <span className="text-[10px]">OK</span>
                            </span>
                          ) : (
                            <span title={r.message} className="text-red-500 inline-flex items-center gap-1">
                              <i className="fas fa-times-circle" />
                              <span className="text-[10px]">Error</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-4 py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <i className="fas fa-exclamation-circle text-2xl text-red-400" />
              </div>
              <p className="text-sm font-medium text-red-600">Error al aplicar reglas</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">{error}</p>
              <button
                onClick={() => setPhase('config')}
                className="px-5 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                <i className="fas fa-undo mr-1.5" />
                Reintentar
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/50 flex-shrink-0">
          {phase === 'config' && (
            <>
              <button
                onClick={step > 1 ? handleBack : onClose}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                  text-slate-600 hover:text-slate-800 hover:bg-slate-100"
              >
                {step > 1 ? (
                  <><i className="fas fa-chevron-left mr-1.5" /> Atrás</>
                ) : (
                  'Cancelar'
                )}
              </button>

              {step < 3 ? (
                <button
                  onClick={handleNext}
                  disabled={!canGoNext(step)}
                  className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg
                    hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors flex items-center gap-2"
                >
                  Siguiente <i className="fas fa-chevron-right text-xs" />
                </button>
              ) : (
                <button
                  onClick={handleApply}
                  disabled={runningVms.length === 0}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg
                    hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors flex items-center gap-2 shadow-sm"
                >
                  <i className="fas fa-check" />
                  Aplicar Reglas
                </button>
              )}
            </>
          )}

          {phase === 'applying' && (
            <div className="w-full text-center text-xs text-slate-400">
              Procesando... no cierres esta ventana
            </div>
          )}

          {phase === 'results' && (
            <button
              onClick={onClose}
              className="ml-auto px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg
                hover:bg-indigo-700 transition-colors"
            >
              <i className="fas fa-check mr-1.5" />
              Listo
            </button>
          )}

          {phase === 'error' && (
            <button
              onClick={onClose}
              className="ml-auto px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
