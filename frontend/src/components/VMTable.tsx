import type { VMDisplay } from '../types'
import IconButton from './IconButton'
import { TableSkeleton } from './Skeleton'

interface Props {
  filteredVms: VMDisplay[]
  selectedIds: Set<number>
  loading: boolean
  error: string | null
  barColor: (pct: number) => string
  openMenu: number | null
  onToggleSelect: (id: number) => void
  onToggleSelectAll: () => void
  onAction: (id: number, action: string) => void
  onDelete: (id: number) => void
  onDestroy: (id: number) => void
  onRecreate: (id: number) => void
  onTerminal: (id: number, name: string) => void
  onMenuOpen: (id: number | null) => void
}

export default function VMTable({
  filteredVms, selectedIds, loading, error, barColor, openMenu,
  onToggleSelect, onToggleSelectAll, onAction, onDelete, onDestroy,
  onRecreate, onTerminal, onMenuOpen,
}: Props) {
  if (loading) {
    return <TableSkeleton rows={5} cols={6} />
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 text-red-500 py-16 bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <i className="fas fa-exclamation-triangle"></i>
        {error}
      </div>
    )
  }

  if (filteredVms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-slate-400 py-16 bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <i className="fas fa-microchip text-3xl"></i>
        <span>No hay máquinas virtuales</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3.5 w-10">
                <input
                  type="checkbox"
                  checked={filteredVms.length > 0 && selectedIds.size === filteredVms.length}
                  onChange={onToggleSelectAll}
                  className="rounded border-slate-300"
                />
              </th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">IP</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">MAC</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">CPU</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">RAM</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Disco</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Uso CPU</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Uso RAM</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredVms.map(vm => {
              const isRunning = vm.status === 'running'
              return (
                <tr
                  key={vm.id}
                  className={`hover:bg-slate-50 transition-colors ${selectedIds.has(vm.id) ? 'bg-sky-50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(vm.id)}
                      onChange={() => onToggleSelect(vm.id)}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full inline-block ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`} />
                      <span className={`text-xs font-medium ${isRunning ? 'text-emerald-700' : 'text-red-600'}`}>
                        {isRunning ? 'Encendida' : 'Apagada'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{vm.name}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{vm.ip || '-'}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{vm.mac}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{vm.cpuAlloc} vCPU</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{vm.ramAlloc >= 1024 ? `${(vm.ramAlloc / 1024).toFixed(1)} GB` : `${vm.ramAlloc} MB`}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{vm.diskAlloc} GB</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 w-24">
                      <div className="flex-1 bg-slate-100 rounded-full h-2">
                        <div className={`h-2 rounded-full transition-all ${barColor(vm.cpuUsage)}`} style={{ width: `${isRunning ? vm.cpuUsage : 0}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 w-8 text-right">{isRunning ? vm.cpuUsage : 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 w-24">
                      <div className="flex-1 bg-slate-100 rounded-full h-2">
                        <div className={`h-2 rounded-full transition-all ${barColor(vm.ramUsage)}`} style={{ width: `${isRunning ? vm.ramUsage : 0}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 w-8 text-right">{isRunning ? vm.ramUsage : 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {isRunning ? (
                        <>
                          <IconButton
                            icon="fa-terminal"
                            tooltip="Terminal"
                            className="text-white bg-blue-600 hover:bg-blue-700"
                            onClick={() => onTerminal(vm.id, vm.name)}
                          />
                          <IconButton
                            icon="fa-stop"
                            tooltip="Apagar"
                            className="text-white bg-amber-600 hover:bg-amber-700"
                            onClick={() => onAction(vm.id, 'shutdown')}
                          />
                          <IconButton
                            icon="fa-sync-alt"
                            tooltip="Reiniciar"
                            className="text-white bg-blue-600 hover:bg-blue-700"
                            onClick={() => onAction(vm.id, 'reboot')}
                          />
                        </>
                      ) : (
                        <IconButton
                          icon="fa-play"
                          tooltip="Encender"
                          className="text-white bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => onAction(vm.id, 'start')}
                        />
                      )}
                      <IconButton
                        icon="fa-code-branch"
                        tooltip="Recrear"
                        className="text-white bg-purple-600 hover:bg-purple-700"
                        onClick={() => onRecreate(vm.id)}
                      />
                      {isRunning ? (
                        <div className="relative">
                          <button
                            onClick={() => onMenuOpen(openMenu === vm.id ? null : vm.id)}
                            className="p-1.5 text-sm text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                          >
                            <i className="fas fa-ellipsis-v"></i>
                          </button>
                          {openMenu === vm.id && (
                            <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 z-10 py-1">
                              <button
                                onClick={() => { onMenuOpen(null); onDestroy(vm.id) }}
                                className="block w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50"
                              >
                                <i className="fas fa-skull mr-2"></i>Forzar Apagado
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <IconButton
                          icon="fa-trash-alt"
                          tooltip="Eliminar"
                          className="text-white bg-red-600 hover:bg-red-700"
                          onClick={() => onDelete(vm.id)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
