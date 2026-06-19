import { useState, useEffect } from 'react'
import { api } from '../services/api'
import ContentHeader from '../components/ContentHeader'
import { TableSkeleton } from '../components/Skeleton'
import type { PeriodInfo, VMAssignment, VirtualMachine, Student, VMState } from '../types'

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic']

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export default function Students() {
  const [periodInfos, setPeriodInfos] = useState<PeriodInfo[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodInfo | null>(null)
  const [assignments, setAssignments] = useState<VMAssignment[]>([])
  const [vms, setVms] = useState<VirtualMachine[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loadingPeriods, setLoadingPeriods] = useState(true)
  const [loadingAssignments, setLoadingAssignments] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPeriods = async () => {
    setLoadingPeriods(true)
    try {
      const items = await api.assignments.periods()
      setPeriodInfos(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar períodos')
    } finally {
      setLoadingPeriods(false)
    }
  }

  const loadAssignments = async (period: PeriodInfo) => {
    setLoadingAssignments(true)
    setAssignments([])
    try {
      const [result, v, s] = await Promise.all([
        api.assignments.list(false, period.id),
        api.vms.listLight(),
        api.students.list(),
      ])
      if (result?.items && Array.isArray(result.items)) setAssignments(result.items)
      if (Array.isArray(v)) setVms(v)
      if (Array.isArray(s)) setStudents(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar asignaciones')
    } finally {
      setLoadingAssignments(false)
    }
  }

  useEffect(() => { loadPeriods() }, [])

  useEffect(() => {
    if (selectedPeriod) loadAssignments(selectedPeriod)
  }, [selectedPeriod])

  const getStudentName = (id: number) =>
    students.find(s => s.id === id)?.full_name || `Estudiante #${id}`
  const getVmName = (id: number) =>
    vms.find(v => v.id === id)?.name || `VM #${id}`

  const stateColors: Partial<Record<VMState, string>> = {
    running: 'text-emerald-600',
    'shut off': 'text-red-500',
    paused: 'text-amber-600',
    crashed: 'text-red-600',
    unknown: 'text-slate-400',
  }

  const stateDots: Partial<Record<VMState, string>> = {
    running: 'bg-emerald-500 animate-pulse',
    'shut off': 'bg-red-400',
    paused: 'bg-amber-400',
    crashed: 'bg-red-500',
    unknown: 'bg-slate-300',
  }

  return (
    <div className="space-y-5">
      <ContentHeader title="Estudiantes por Período" icon="fa-user-graduate" />

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Cerrar</button>
        </div>
      )}

      {loadingPeriods ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200/60 p-5 animate-pulse">
              <div className="h-5 w-16 bg-slate-200 rounded mb-3"></div>
              <div className="h-3 w-32 bg-slate-200 rounded mb-2"></div>
              <div className="h-3 w-24 bg-slate-200 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {periodInfos
            .filter(p => /^P\d+$/.test(p.period_name) && (p.is_active || p.closed_at))
            .map(p => {
              const isSelected = selectedPeriod?.period_name === p.period_name
              const isOpen = p.is_active && !p.closed_at
              return (
                <button key={p.period_name} onClick={() => setSelectedPeriod(prev => prev?.period_name === p.period_name ? null : p)}
                  className={`text-left bg-white rounded-xl border-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 transition-all hover:-translate-y-1 hover:shadow-lg ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200/60'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-bold text-slate-800">{p.period_name}</span>
                    <span className={`text-[0.65rem] font-semibold uppercase px-2 py-0.5 rounded-full ${
                      isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {isOpen ? 'Activo' : p.closed_at ? 'Cerrado' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mb-3">
                    <i className="fas fa-calendar mr-1"></i>
                    {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <i className="fas fa-user-graduate text-indigo-400"></i>
                    <span className="font-semibold text-slate-700">{p.student_count}</span>
                    <span className="text-slate-400">estudiante{p.student_count !== 1 ? 's' : ''}</span>
                  </div>
                </button>
              )
            })}
        </div>
      )}

      {selectedPeriod && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <i className="fas fa-list text-slate-400"></i>
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
              Asignaciones — {selectedPeriod.period_name}
            </h2>
          </div>

          {loadingAssignments ? (
            <TableSkeleton rows={5} cols={6} />
          ) : assignments.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 text-center">
              <i className="fas fa-inbox text-3xl text-slate-300 mb-2"></i>
              <p className="text-sm text-slate-500">No hay asignaciones en este período</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Estudiante</th>
                      <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Correo</th>
                      <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">VM</th>
                      <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Estado VM</th>
                      <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">IP</th>
                      <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-center">Recreac.</th>
                      <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Asignación</th>
                      <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Liberación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignments.map(a => {
                      const student = students.find(s => s.id === a.student_id)
                      const vm = a.vm_id ? vms.find(v => v.id === a.vm_id) : null
                      const vmName = vm?.name || a.vm_name_snapshot || getVmName(a.vm_id ?? 0)
                      const isReleased = !!a.released_at
                      const state = vm?.current_state || 'unknown'
                      return (
                        <tr key={a.id} className={`transition-colors hover:bg-slate-50/80 ${isReleased ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3.5 font-medium text-slate-800">{student?.full_name || getStudentName(a.student_id)}</td>
                          <td className="px-4 py-3.5 text-slate-500 text-xs">{student?.email || <span className="text-slate-300 italic">—</span>}</td>
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
                          <td className="px-4 py-3.5 text-center">
                            <span className={`text-xs font-mono font-semibold ${a.recreation_count >= 3 ? 'text-amber-600' : 'text-slate-400'}`}>
                              {a.recreation_count}/3
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-400">
                            <i className="fas fa-calendar-day mr-1"></i>
                            {new Date(a.assigned_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-400">
                            {a.released_at ? (
                              <><i className="fas fa-check-circle mr-1 text-red-400"></i>{new Date(a.released_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                            ) : (
                              <span className="text-slate-300 italic">Activa</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
