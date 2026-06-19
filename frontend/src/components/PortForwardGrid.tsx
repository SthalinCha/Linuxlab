import { useState, useEffect, useCallback, Fragment, useRef } from 'react'
import { api } from '../services/api'
import { useToast } from '../hooks/useToast'
import type { VirtualMachine, HostInfo } from '../types'
import PortGroupCard from './PortCard'
import PortRangeModal from './PortRangeModal'
import { StatsSkeleton, TableSkeleton } from './Skeleton'

export default function PortForwardGrid() {
  const { addToast } = useToast()
  const [vms, setVms] = useState<VirtualMachine[]>([])
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedVmIds, setSelectedVmIds] = useState<Set<number>>(new Set())
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [showRangeModal, setShowRangeModal] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setLoading(true)
    try {
      const [vmsData, hostData] = await Promise.all([
        api.vms.list(undefined, { signal }),
        api.host.get({ signal }),
      ])
      if (signal.aborted) return
      setVms(vmsData)
      setHostInfo(hostData)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      addToast('error', err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadData()
    return () => abortRef.current?.abort()
  }, [loadData])

  const totalRules = vms.reduce((s, vm) => s + (vm.ports?.length || 0), 0)
  const publishedVms = vms.filter(vm => vm.ports && vm.ports.length > 0).length
  const uniqueServices = new Set(vms.flatMap(vm => (vm.ports || []).map(p => p.service)))

  const selectedVms = vms.filter(vm => selectedVmIds.has(vm.id))

  const toggleExpand = (vmId: number) => {
    setExpandedId(prev => prev === vmId ? null : vmId)
  }

  const toggleCheckbox = (vmId: number, checked: boolean) => {
    setSelectedVmIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(vmId)
      else next.delete(vmId)
      return next
    })
  }

  const selectAll = (checked: boolean) => {
    if (checked) {
      setSelectedVmIds(new Set(vms.map(v => v.id)))
    } else {
      setSelectedVmIds(new Set())
    }
  }

  const updateVmInState = (updatedVm: VirtualMachine) => {
    setVms(prev => prev.map(v => v.id === updatedVm.id ? updatedVm : v))
  }

  const deletePort = async (vmId: number, portIndex: number) => {
    const vm = vms.find(v => v.id === vmId)
    if (!vm || !vm.ports) return
    const port = vm.ports[portIndex]
    if (!port) return

    try {
      const updated = await api.ports.remove(vmId, portIndex)
      updateVmInState(updated)
      addToast('success', `DNAT tcp  ${hostInfo?.ip_principal || '?'}:${port.host} → ${vm.ip_address || '?'}:${port.vm} eliminado de ${vm.name}`)
    } catch (err) {
      addToast('error', `Error al eliminar: ${err instanceof Error ? err.message : 'Error'}`)
    }
  }

  const filteredVms = vms.filter(vm => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      vm.name.toLowerCase().includes(s) ||
      (vm.ip_address || '').toLowerCase().includes(s) ||
      (vm.ports || []).some(p => p.service.toLowerCase().includes(s) || String(p.host).includes(s))
    )
  })

  const allSelected = vms.length > 0 && selectedVmIds.size === vms.length

  return (
    <div className="space-y-5">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-server mr-1"></i>VMs Publicadas
            </span>
            <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><i className="fas fa-server text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-slate-900">{publishedVms}</div>
          <div className="text-xs text-slate-400 mt-0.5">de {vms.length} VMs</div>
        </div>
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-route mr-1"></i>Reglas Activas
            </span>
            <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><i className="fas fa-route text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-blue-600">{totalRules}</div>
        </div>
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-list mr-1"></i>Servicios
            </span>
            <span className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600"><i className="fas fa-list text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-indigo-600">{uniqueServices.size}</div>
          <div className="text-xs text-slate-400 mt-0.5">{Array.from(uniqueServices).join(', ') || '—'}</div>
        </div>
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-shield mr-1"></i>Estado General
            </span>
            <span className={`w-8 h-8 rounded-full flex items-center justify-center ${vms.length > 0 && vms.every(v => v.current_state === 'running') ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
              <i className={`fas ${vms.length > 0 && vms.every(v => v.current_state === 'running') ? 'fa-check' : 'fa-exclamation'} text-sm`}></i>
            </span>
          </div>
          {vms.length > 0 && vms.every(v => v.current_state === 'running') ? (
            <>
              <div className="text-[1.75rem] font-bold tracking-tight text-emerald-600">Operativo</div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Todas las VMs activas
              </div>
            </>
          ) : (
            <>
              <div className="text-[1.75rem] font-bold tracking-tight text-amber-600">Atención</div>
              <div className="flex items-center gap-1.5 text-xs text-amber-600 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Hay VMs apagadas
              </div>
            </>
          )}
        </div>
      </div>

      {/* Selected VM chips bar */}
      {selectedVmIds.size > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-indigo-700">
            <i className="fas fa-check-circle" />
            <span className="font-medium">{selectedVmIds.size} VM(s) seleccionada(s):</span>
            <div className="flex flex-wrap gap-1.5 ml-2">
              {selectedVms.map(vm => (
                <span
                  key={vm.id}
                  className={`
                    inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium
                    ${vm.current_state === 'running'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-200 text-slate-500'
                    }
                  `}
                >
                  {vm.name}
                  <span className={`w-1.5 h-1.5 rounded-full ${vm.current_state === 'running' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                </span>
              ))}
            </div>
            <button
              onClick={() => setSelectedVmIds(new Set())}
              className="ml-auto text-xs text-indigo-500 hover:text-indigo-700 underline"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}

      {/* Range forward button */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <i className="fas fa-arrows-alt-h text-indigo-500" />
          Configurar Puertos por Rango
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Agrega múltiples puertos a varias VMs usando un asistente paso a paso.
          Selecciona las VMs en la tabla de abajo o usa el rango numérico dentro del asistente.
        </p>
        <button
          onClick={() => setShowRangeModal(true)}
          className="px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg
            hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
        >
          <i className="fas fa-arrows-alt-h" />
          Agregar Puertos por Rango
        </button>
      </div>

      {showRangeModal && (
        <PortRangeModal
          open={showRangeModal}
          onClose={() => setShowRangeModal(false)}
          selectedVms={selectedVms}
          allVms={vms}
          onApply={(updatedVms) => {
            updatedVms.forEach(vm => updateVmInState(vm))
            loadData()
          }}
        />
      )}

      {/* Search */}
      <div className="relative">
        <i className="fas fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por VM, IP o puerto..."
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500
            transition-all duration-150"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-4">
          <StatsSkeleton count={4} />
          <TableSkeleton rows={5} cols={6} />
        </div>
      ) : filteredVms.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-16 text-center">
          <i className="fas fa-inbox text-3xl text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">{search ? 'Sin resultados de búsqueda' : 'No hay VMs disponibles'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => selectAll(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600
                        focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                    />
                  </th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">VM</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">IP Interna</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Puertos</th>
                  <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVms.map(vm => {
                  const isExpanded = expandedId === vm.id
                  const ports = vm.ports || []

                  return (
                    <Fragment key={vm.id}>
                      <tr
                        className={`
                          transition-colors duration-100 cursor-pointer
                          ${isExpanded ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}
                        `}
                        onClick={() => toggleExpand(vm.id)}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedVmIds.has(vm.id)}
                            onChange={(e) => toggleCheckbox(vm.id, e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600
                              focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge state={vm.current_state} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800">{vm.name}</span>
                            <i className={`fas fa-chevron-down text-xs transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
                            } text-slate-400`} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs font-mono text-slate-500">{vm.ip_address || '—'}</code>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`
                            inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full
                            ${ports.length > 0
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-slate-50 text-slate-400'
                            }
                          `}>
                            {ports.length > 0 ? (
                              <><i className="fas fa-link text-[10px]" /> {ports.length}</>
                            ) : (
                              <><i className="fas fa-minus text-[10px]" /> 0</>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(vm.id) }}
                            className={`
                              text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150
                              ${isExpanded
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }
                            `}
                          >
                            {isExpanded ? 'Cerrar' : 'Ver puertos'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <div className="overflow-hidden transition-all duration-300">
                              <div className="px-4 py-4 bg-slate-50/50 border-t border-slate-100">
                                {ports.length === 0 ? (
                                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
                                    <i className="fas fa-info-circle" />
                                    Sin reglas de puerto para esta VM
                                  </div>
                                ) : (
                                  <PortGroupCard
                                    ports={ports}
                                    portIndices={ports.map((_, i) => i)}
                                    onDelete={(index) => deletePort(vm.id, index)}
                                    disabled={vm.current_state !== 'running'}
                                    hostIp={hostInfo?.ip_principal}
                                    vmIp={vm.ip_address}
                                  />
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ state }: { state: string }) {
  const isRunning = state === 'running'
  return (
    <div className="flex items-center gap-2">
      <span className={`relative w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-slate-300'}`}>
        {isRunning && (
          <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-30" />
        )}
      </span>
      <span className={`text-xs font-medium ${isRunning ? 'text-emerald-600' : 'text-slate-400'}`}>
        {isRunning ? 'Activo' : 'Inactivo'}
      </span>
    </div>
  )
}


