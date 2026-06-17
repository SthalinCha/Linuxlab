import type { VMAssignment, Period } from '../types'
import type { VirtualMachine, Student } from '../types'
import { SkeletonBar } from './Skeleton'

interface Props {
  show: boolean
  periods: Period[]
  expandedPeriod: number | null
  loadingPeriod: boolean
  periodAssignments: VMAssignment[]
  students: Student[]
  vms: VirtualMachine[]
  onTogglePeriod: (periodId: number) => void
  onLoadPeriods: () => void
}

export default function AssignmentHistory({
  show, periods, expandedPeriod, loadingPeriod, periodAssignments,
  students, vms, onTogglePeriod, onLoadPeriods,
}: Props) {
  const getStudentName = (id: number) =>
    students.find((s) => s.id === id)?.full_name || `Estudiante #${id}`

  const getVmName = (id: number) =>
    vms.find((v) => v.id === id)?.name || `VM #${id}`

  if (!show) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <i className="fas fa-clock-rotate-left text-slate-400"></i>
          <h2 className="text-sm font-semibold text-slate-700">Historial de Asignaciones</h2>
          <span className="text-xs text-slate-400 font-mono">{periods.length} período{periods.length !== 1 ? 's' : ''}</span>
        </div>
        <button onClick={onLoadPeriods}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
          <i className="fas fa-rotate"></i>
        </button>
      </div>
      <div className="p-5 space-y-3">
        {periods.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <i className="fas fa-clock-rotate-left text-3xl mb-3"></i>
            <p className="text-sm font-medium">Sin historial de asignaciones</p>
            <p className="text-xs mt-1">Las asignaciones guardadas aparecerán aquí</p>
          </div>
        ) : (
          periods.map((p) => {
            const isOpen = expandedPeriod === p.id
            return (
              <div key={p.id} className="bg-white border border-slate-200/80 rounded-xl overflow-hidden hover:border-slate-300/60 transition-colors">
                <button onClick={() => onTogglePeriod(p.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 lg:px-5 py-3.5 text-left">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-slate-600">{p.code.slice(-1)}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{p.code}</span>
                        {p.name && <span className="text-xs text-slate-400">({p.name})</span>}
                        {p.is_active && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-emerald-100 text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Activo
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span><i className="fas fa-calendar mr-1"></i>
                          {new Date(p.start_date).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })} — {new Date(p.end_date).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={`inline-flex items-center transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                    <i className="fas fa-chevron-down text-slate-400 text-sm"></i>
                  </span>
                </button>
                <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="border-t border-slate-100">
                    {loadingPeriod ? (
                      <div className="space-y-2 p-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <SkeletonBar key={i} className="h-8 w-full" />
                        ))}
                      </div>
                    ) : periodAssignments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                        <i className="fas fa-inbox text-xl mb-2"></i>
                        <p className="text-xs">Sin asignaciones en este período</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50/60">
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider">Estudiante</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider">VM</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider">Asignación</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider">Liberación</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {periodAssignments.map((pa) => {
                              const s = students.find(st => st.id === pa.student_id)
                              const vm = pa.vm_id ? vms.find(v => v.id === pa.vm_id) : null
                              const vmName = vm?.name || pa.vm_name_snapshot || getVmName(pa.vm_id ?? 0)
                              const released = !!pa.released_at
                              return (
                                <tr key={pa.id} className="hover:bg-slate-50/60 transition-colors">
                                  <td className="px-4 py-2.5 text-slate-700">
                                    {s?.full_name || getStudentName(pa.student_id)}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold font-mono ${
                                      released ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-700'
                                    }`}>
                                      <i className={`fas fa-server ${released ? 'text-red-400' : 'text-indigo-400'}`}></i>
                                      {vmName}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-500">{new Date(pa.assigned_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}</td>
                                  <td className="px-4 py-2.5 text-slate-500">
                                    {pa.released_at ? new Date(pa.released_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) : <span className="text-slate-300">—</span>}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {released ? (
                                      <span className="text-slate-400"><i className="fas fa-circle-minus mr-1"></i>Liberada</span>
                                    ) : (
                                      <span className="text-emerald-600 font-medium"><i className="fas fa-circle-check mr-1"></i>Activa</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
