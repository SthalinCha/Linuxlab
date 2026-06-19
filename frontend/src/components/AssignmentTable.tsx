import type { VMAssignment, Student, VirtualMachine, VMState } from '../types'
import { TableSkeleton } from './Skeleton'

interface Props {
  loading: boolean
  filter: string
  search: string
  filteredAssignments: VMAssignment[]
  unassignedStudents: Student[]
  students: Student[]
  vms: VirtualMachine[]
  selectedIds: Set<number>
  stateColors: Partial<Record<VMState, string>>
  stateDots: Partial<Record<VMState, string>>
  getVmName: (id: number) => string
  getStudentName: (id: number) => string
  onToggleSelect: (id: number) => void
  onSelectAll: () => void
  onConfirmRelease: (id: number) => void
  onDeleteAssignment?: (id: number) => void
  onDeleteStudent?: (id: number, name: string) => void
  page?: number
  totalPages?: number
  totalItems?: number
  onPageChange?: (page: number) => void
}

export default function AssignmentTable({
  loading, filter, search, filteredAssignments, unassignedStudents,
  students, vms, selectedIds, stateColors, stateDots,
  getVmName, getStudentName, onToggleSelect, onSelectAll, onConfirmRelease,
  onDeleteAssignment, onDeleteStudent,
  page, totalPages, totalItems, onPageChange,
}: Props) {
  if (loading) {
    return <TableSkeleton rows={5} cols={7} />
  }

  if (filter === 'sin_asignar') {
    return (
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">
            <i className="fas fa-user-slash mr-2 text-slate-400"></i>
            Estudiantes sin Asignar ({unassignedStudents.length})
          </h2>
        </div>
        {unassignedStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <i className="fas fa-check-circle text-3xl text-emerald-300 mb-3"></i>
            <p className="text-sm font-medium text-slate-500">Todos los estudiantes están asignados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500">Estudiante</th>
                  <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500">Correo</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unassignedStudents.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{s.full_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{s.email}</td>
                    <td className="px-4 py-3 w-12">
                      {onDeleteStudent && (
                        <button onClick={() => onDeleteStudent(s.id, s.full_name)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          title="Eliminar estudiante">
                          <i className="fas fa-trash-can text-sm"></i>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  if (filteredAssignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <i className="fas fa-users-slash text-3xl text-slate-300 mb-3"></i>
        <p className="text-sm font-medium text-slate-500">{search ? 'Sin resultados de búsqueda' : 'No hay asignaciones registradas'}</p>
        <p className="text-xs text-slate-400 mt-1">Usa "Nueva Asignación" o "Importar CSV" para comenzar</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <i className="fas fa-table-list text-slate-400"></i>
          <h2 className="text-sm font-semibold text-slate-700">Asignaciones Actuales</h2>
          <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-[0.7rem] font-bold bg-indigo-100 text-indigo-700">
            {filteredAssignments.filter(a => !a.released_at).length}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3.5 w-10">
                <input type="checkbox"
                  checked={filteredAssignments.length > 0 && selectedIds.size === filteredAssignments.filter(a => !a.released_at).length && filteredAssignments.some(a => !a.released_at)}
                  onChange={onSelectAll}
                  className="appearance-none w-4 h-4 border-2 border-slate-300 rounded cursor-pointer transition-all checked:bg-slate-900 checked:border-slate-900 checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] bg-contain bg-center bg-no-repeat" />
              </th>
              <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Estudiante</th>
              <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Correo</th>
              <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">VM</th>
              <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Estado VM</th>
              <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">IP</th>
              <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Asignación</th>
              <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-center w-16">Recreac.</th>
              <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left w-20">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredAssignments.map((a) => {
              const student = students.find(s => s.id === a.student_id)
              const vm = a.vm_id ? vms.find(v => v.id === a.vm_id) : null
              const vmName = vm?.name || a.vm_name_snapshot || getVmName(a.vm_id ?? 0)
              const isReleased = !!a.released_at
              const isSelected = selectedIds.has(a.id)
              const state = vm?.current_state || 'unknown'

              return (
                <tr key={a.id} className={`transition-colors hover:bg-slate-50/80 ${isSelected ? 'bg-sky-50' : ''} ${isReleased ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3.5">
                    {!isReleased && (
                      <input type="checkbox" checked={isSelected}
                        onChange={() => onToggleSelect(a.id)}
                        className="appearance-none w-4 h-4 border-2 border-slate-300 rounded cursor-pointer transition-all checked:bg-slate-900 checked:border-slate-900 checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] bg-contain bg-center bg-no-repeat" />
                    )}
                  </td>
                  <td className="px-4 py-3.5 font-medium text-slate-800">{student?.full_name || getStudentName(a.student_id)}</td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs">{student?.email || <span className="text-slate-300 italic">sin correo</span>}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono ${
                      isReleased ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-700'
                    }`}>
                      <i className={`fas fa-server ${isReleased ? 'text-red-400' : 'text-indigo-400'}`}></i>
                      {vmName}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    {vm ? (
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isReleased ? 'bg-slate-300' : stateDots[state] || 'bg-slate-300'}`}></span>
                        <span className={`text-xs font-medium ${isReleased ? 'text-slate-400' : stateColors[state] || 'text-slate-400'}`}>
                          {isReleased ? 'Liberada' :
                           state === 'running' ? 'Activa' :
                           state === 'shut off' ? 'Apagada' :
                           state === 'paused' ? 'Suspendida' : state}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 font-mono text-xs">{vm?.ip_address || '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-slate-400">
                    <i className="fas fa-calendar-day mr-1"></i>
                    {new Date(a.assigned_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`text-xs font-mono font-semibold ${a.recreation_count >= 3 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {a.recreation_count}/3
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    {!isReleased ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => onConfirmRelease(a.id)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          title="Desvincular estudiante">
                          <i className="fas fa-link-slash text-sm"></i>
                        </button>
                        {onDeleteAssignment && (
                          <button onClick={() => onDeleteAssignment(a.id)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                            title="Eliminar asignación">
                            <i className="fas fa-trash-can text-sm"></i>
                          </button>
                        )}
                        {onDeleteStudent && (
                          <button onClick={() => onDeleteStudent(a.student_id, student?.full_name || getStudentName(a.student_id))}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                            title="Eliminar estudiante">
                            <i className="fas fa-user-slash text-sm"></i>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400 italic">Liberada</span>
                        {onDeleteStudent && (
                          <button onClick={() => onDeleteStudent(a.student_id, student?.full_name || getStudentName(a.student_id))}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                            title="Eliminar estudiante">
                            <i className="fas fa-trash-can text-sm"></i>
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {totalPages && totalPages > 1 && onPageChange && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/30">
            <span className="text-xs text-slate-500">{totalItems ?? 0} asignaciones en total</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => onPageChange((page ?? 1) - 1)} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <i className="fas fa-chevron-left"></i>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => onPageChange(p)}
                  className={`min-w-[2rem] px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    p === page ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
                  }`}>
                  {p}
                </button>
              ))}
              <button onClick={() => onPageChange((page ?? 1) + 1)} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <i className="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
