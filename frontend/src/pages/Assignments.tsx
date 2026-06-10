import { useState, useEffect, FormEvent, useRef } from 'react'
import { api } from '../services/api'
import type { VMAssignment, VirtualMachine, Student, PeriodInfo } from '../types'
import ConfirmModal from '../components/ConfirmModal'
import ContentHeader from '../components/ContentHeader'

interface Toast {
  id: number
  type: 'loading' | 'success' | 'error' | 'warning'
  message: string
}

let toastIdCounter = 0

export default function Assignments() {
  const [assignments, setAssignments] = useState<VMAssignment[]>([])
  const [allAssignments, setAllAssignments] = useState<VMAssignment[]>([])
  const [vms, setVms] = useState<VirtualMachine[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todos')

  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ id_vm: 0, id_student: 0, period_name: '' })

  const [toasts, setToasts] = useState<Toast[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmRelease, setConfirmRelease] = useState<number | null>(null)
  const [confirmBulkRelease, setConfirmBulkRelease] = useState(false)
  const [confirmAutoAssign, setConfirmAutoAssign] = useState(false)
  const [periodName, setPeriodName] = useState('2026A')
  const [autoAssignResults, setAutoAssignResults] = useState<{ created: number; assignments: Array<{ student: string; vm: string }>; unassigned_students: number } | null>(null)

  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showHistory, setShowHistory] = useState(false)
  const [periods, setPeriods] = useState<PeriodInfo[]>([])
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null)
  const [periodAssignments, setPeriodAssignments] = useState<VMAssignment[]>([])
  const [loadingPeriod, setLoadingPeriod] = useState(false)

  const addToast = (type: Toast['type'], message: string) => {
    const id = ++toastIdCounter
    setToasts(prev => [...prev, { id, type, message }])
    if (type !== 'loading') {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 4000)
    }
  }

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const loadData = async (period?: string) => {
    setLoading(true)
    try {
      const [a, v, s] = await Promise.all([
        period ? api.assignments.list(false, period) : api.assignments.list(),
        api.vms.list(),
        api.students.list(),
      ])
      setAllAssignments(a)
      setAssignments(a)
      setVms(v)
      setStudents(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  const loadPeriods = async () => {
    try {
      setPeriods(await api.assignments.periods())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar períodos')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const getVmName = (id: number) => vms.find((v) => v.id === id)?.name || `VM #${id}`
  const getStudentName = (id: number) =>
    students.find((s) => s.id === id)?.full_name || `Estudiante #${id}`
  const getVmState = (id: number) => vms.find((v) => v.id === id)?.current_state || 'unknown'
  const getVmIp = (id: number) => vms.find((v) => v.id === id)?.ip_address || '-'

  const availableVms = vms.filter(
    (v) => v.is_active && !assignments.some((a) => a.id_vm === v.id && !a.released_at)
  )
  const availableStudents = students.filter(
    (s) => s.is_active && !assignments.some((a) => a.id_student === s.id && !a.released_at)
  )

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.assignments.create(formData)
      setFormData({ id_vm: 0, id_student: 0, period_name: '' })
      setShowForm(false)
      addToast('success', 'Asignación creada correctamente')
      await loadData()
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al crear asignación')
    }
  }

  const handleRelease = async (id: number) => {
    try {
      await api.assignments.release(id)
      setConfirmRelease(null)
      addToast('success', 'Asignación liberada')
      await loadData()
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al liberar asignación')
    }
  }

  const handleBulkRelease = async () => {
    try {
      const result = await api.assignments.bulkRelease(Array.from(selectedIds))
      setConfirmBulkRelease(false)
      setSelectedIds(new Set())
      addToast('success', `${result.released} asignaciones liberadas`)
      await loadData()
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al liberar asignaciones')
    }
  }

  const handleAutoAssign = async () => {
    try {
      const result = await api.assignments.autoAssign(periodName)
      setAutoAssignResults(result)
      setConfirmAutoAssign(false)
      addToast('success', `${result.created} asignaciones automáticas creadas`)
      await loadData()
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error en asignación automática')
    }
  }

  const handleImportCsv = async (e: FormEvent) => {
    e.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!file) return
    addToast('loading', 'Importando estudiantes...')
    try {
      const result = await api.students.importCsv(file)
      setImportResult(result)
      addToast('success', `${result.created} estudiantes importados`)
      await loadData()
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al importar')
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const loadPeriodAssignments = async (period: string) => {
    setLoadingPeriod(true)
    try {
      const data = await api.assignments.list(false, period)
      setPeriodAssignments(data)
    } catch (err) {
      addToast('error', 'Error al cargar asignaciones del período')
    } finally {
      setLoadingPeriod(false)
    }
  }

  const togglePeriodAccordion = (period: string) => {
    if (expandedPeriod === period) {
      setExpandedPeriod(null)
      setPeriodAssignments([])
      return
    }
    setExpandedPeriod(period)
    loadPeriodAssignments(period)
  }

  const assignedIds = new Set(assignments.filter(a => !a.released_at).map(a => a.id_student))
  const unassignedStudents = students.filter(s => s.is_active && !assignedIds.has(s.id))

  const filteredAssignments = assignments.filter(a => {
    if (filter === 'asignados') return !a.released_at
    if (filter === 'sin_asignar') return false
    if (search) {
      const s = search.toLowerCase()
      const student = students.find(st => st.id === a.id_student)
      const vm = vms.find(v => v.id === a.id_vm)
      return (
        student?.full_name.toLowerCase().includes(s) ||
        student?.email.toLowerCase().includes(s) ||
        student?.student_code.toLowerCase().includes(s) ||
        vm?.name.toLowerCase().includes(s)
      )
    }
    return true
  })

  const activeCount = assignments.filter(a => !a.released_at).length
  const totalStudents = students.filter(s => s.is_active).length
  const pendingStudents = totalStudents - activeCount
  const freeVms = vms.filter(v => v.is_active && !assignments.some(a => a.id_vm === v.id && !a.released_at)).length

  const stateColors: Record<string, string> = {
    running: 'text-emerald-600',
    'shut off': 'text-red-500',
    paused: 'text-amber-600',
    crashed: 'text-red-600',
    unknown: 'text-slate-400',
  }

  const stateDots: Record<string, string> = {
    running: 'bg-emerald-500 animate-pulse',
    'shut off': 'bg-red-400',
    paused: 'bg-amber-400',
    crashed: 'bg-red-500',
    unknown: 'bg-slate-300',
  }

  return (
    <div className="bg-[#f8fafc] space-y-5">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[60] space-y-2 w-80">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-l-4 ${
              t.type === 'loading' ? 'border-l-blue-500' :
              t.type === 'success' ? 'border-l-emerald-500' :
              t.type === 'warning' ? 'border-l-yellow-500' :
              'border-l-red-500'
            }`}
          >
            {t.type === 'loading' ? (
              <i className="fas fa-spinner fa-spin text-blue-500 mt-0.5"></i>
            ) : t.type === 'success' ? (
              <i className="fas fa-check-circle text-emerald-500 mt-0.5"></i>
            ) : t.type === 'warning' ? (
              <i className="fas fa-exclamation-triangle text-yellow-500 mt-0.5"></i>
            ) : (
              <i className="fas fa-times-circle text-red-500 mt-0.5"></i>
            )}
            <span className="flex-1 text-sm text-slate-700">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="text-slate-400 hover:text-slate-600 leading-none text-lg">&times;</button>
          </div>
        ))}
      </div>

      {/* Error/Success inline alerts */}
      {(error || successMsg) && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
          error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          <i className={`fas ${error ? 'fa-circle-exclamation' : 'fa-check-circle'} mt-0.5`}></i>
          <span className="flex-1 text-sm">{error || successMsg}</span>
          <button onClick={() => { setError(''); setSuccessMsg('') }} className="font-bold leading-none text-lg">&times;</button>
        </div>
      )}

      {/* Header */}
      <ContentHeader title="Asignaciones de Laboratorio" icon="fa-users-gear" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-user-graduate mr-1"></i>Estudiantes Registrados
            </span>
            <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><i className="fas fa-users text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-slate-900">{totalStudents}</div>
        </div>
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-check-circle mr-1"></i>Estudiantes Asignados
            </span>
            <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><i className="fas fa-check text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-emerald-600">{activeCount}</div>
        </div>
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-hourglass-half mr-1"></i>Pendientes
            </span>
            <span className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><i className="fas fa-clock text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-amber-600">{pendingStudents}</div>
          {pendingStudents > 0 && (
            <div className="text-[0.65rem] text-amber-600 font-medium mt-0.5">
              <i className="fas fa-triangle-exclamation mr-1"></i>{pendingStudents} sin VM
            </div>
          )}
        </div>
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-server mr-1"></i>VMs Disponibles
            </span>
            <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><i className="fas fa-microchip text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-blue-600">{freeVms}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5 space-y-4">
        {/* Row 1: Period + Primary Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[120px]">
            <i className="fas fa-calendar-day absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none"></i>
            <input
              type="text"
              value={periodName}
              onChange={(e) => setPeriodName(e.target.value)}
              placeholder="Período"
              className="border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm w-28 font-medium text-slate-800 focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition-all"
            />
          </div>

          <button onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-none">
            <i className="fas fa-plus-circle"></i>
            {showForm ? 'Cancelar' : 'Nueva Asignación'}
          </button>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-100">
            <i className="fas fa-arrow-right-arrow-left text-slate-400"></i>
            <span>Período activo: <strong className="text-slate-600">{periodName || '—'}</strong></span>
          </div>

          <div className="flex-1"></div>

          <button onClick={() => setShowHistory(!showHistory)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
              showHistory ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}>
            <i className={`fas ${showHistory ? 'fa-arrow-left' : 'fa-clock-rotate-left'}`}></i>
            {showHistory ? 'Asignaciones Actuales' : 'Ver Historial'}
          </button>

          <form onSubmit={handleImportCsv} className="flex gap-2 items-center">
            <div className="relative">
              <input type="file" accept=".csv" ref={fileInputRef}
                className="absolute inset-0 opacity-0 w-full cursor-pointer" />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all">
                <i className="fas fa-upload"></i>
                Importar CSV
              </button>
            </div>
            {fileInputRef.current?.files?.[0] && (
              <button type="submit"
                className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-all">
                <i className="fas fa-check"></i>
              </button>
            )}
          </form>

          <button onClick={() => { if (availableVms.length === 0 || availableStudents.length === 0) { addToast('error', 'No hay VMs o estudiantes disponibles'); return }; setConfirmAutoAssign(true) }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 transition-all hover:-translate-y-0.5 active:translate-y-0">
            <i className="fas fa-bolt"></i>
            Asignación Automática
          </button>
        </div>

        {/* Dropzone area */}
        <div id="dropzone"
          className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center transition-all cursor-pointer hover:border-blue-400 hover:bg-blue-50/30"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50'); }}
          onDragLeave={(e) => { e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50'); }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
            const file = e.dataTransfer.files[0];
            if (file) {
              const dt = new DataTransfer();
              dt.items.add(file);
              if (fileInputRef.current) fileInputRef.current.files = dt.files;
            }
          }}>
          <div className="flex flex-col items-center gap-1.5">
            <i className="fas fa-cloud-arrow-up text-2xl text-slate-300"></i>
            <span className="text-sm text-slate-500 font-medium">Arrastra un archivo CSV aquí o haz clic para seleccionar</span>
            <span className="text-xs text-slate-400">Formato: nombre, email, código</span>
          </div>
        </div>

        {/* Search + Filter + Bulk */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none"></i>
              <input type="text" placeholder="Buscar por nombre, email, código o VM..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm w-full focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition-all" />
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition-all">
              <option value="todos">Todos</option>
              <option value="asignados">Asignados</option>
              <option value="sin_asignar">Sin Asignar</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  <i className="fas fa-check mr-1"></i>{selectedIds.size} seleccionado(s)
                </span>
                <button onClick={() => setConfirmBulkRelease(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-all">
                  <i className="fas fa-link-slash"></i>
                  Desvincular
                </button>
                <button onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-slate-400 hover:text-slate-600 underline">
                  <i className="fas fa-times mr-1"></i>Limpiar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Import results */}
        {importResult && (
          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm">
              <i className="fas fa-circle-check text-blue-500 mt-0.5"></i>
              <div className="flex-1">
                <strong>{importResult.created}</strong> estudiantes importados
                {importResult.errors.length > 0 && (
                  <ul className="mt-1 text-xs space-y-0.5">
                    {importResult.errors.slice(0, 5).map((e, i) => <li key={i}><i className="fas fa-triangle-exclamation mr-1"></i>{e}</li>)}
                    {importResult.errors.length > 5 && <li className="text-slate-400">...y {importResult.errors.length - 5} más</li>}
                  </ul>
                )}
              </div>
              <button onClick={() => setImportResult(null)} className="font-bold leading-none">&times;</button>
            </div>
          </div>
        )}

        {/* Auto-assign results */}
        {autoAssignResults && (
          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
              <i className="fas fa-bolt text-emerald-500 mt-0.5"></i>
              <div className="flex-1">
                <strong>{autoAssignResults.created}</strong> asignaciones creadas
                {autoAssignResults.unassigned_students > 0 && (
                  <span className="ml-2 text-amber-600">({autoAssignResults.unassigned_students} estudiantes sin VM)</span>
                )}
                {autoAssignResults.assignments.length > 0 && (
                  <div className="mt-1 text-xs space-y-0.5 max-h-32 overflow-y-auto bg-white/50 rounded-lg p-2">
                    {autoAssignResults.assignments.map((a, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <i className="fas fa-arrow-right text-emerald-400 text-[0.6rem]"></i>
                        <span className="font-medium">{a.student}</span>
                        <span className="text-emerald-400">→</span>
                        <span className="font-mono text-emerald-600">{a.vm}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setAutoAssignResults(null)} className="font-bold leading-none">&times;</button>
            </div>
          </div>
        )}

        {/* Inline form */}
        {showForm && (
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center text-white text-xs font-bold">+</div>
              <h3 className="text-sm font-semibold text-slate-800">
                Nueva Asignación
              </h3>
            </div>
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5"><i className="fas fa-server mr-1"></i>Máquina Virtual</label>
                <select value={formData.id_vm}
                  onChange={(e) => setFormData({ ...formData, id_vm: Number(e.target.value) })}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10" required>
                  <option value={0}>Seleccionar VM</option>
                  {availableVms.map((v) => (
                    <option key={v.id} value={v.id}>{v.name} — {v.ip_address || 'sin IP'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5"><i className="fas fa-user mr-1"></i>Estudiante</label>
                <select value={formData.id_student}
                  onChange={(e) => setFormData({ ...formData, id_student: Number(e.target.value) })}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10" required>
                  <option value={0}>Seleccionar Estudiante</option>
                  {availableStudents.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5"><i className="fas fa-calendar mr-1"></i>Período</label>
                <input type="text" placeholder="Ej: 2026A" value={formData.period_name}
                  onChange={(e) => setFormData({ ...formData, period_name: e.target.value })}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10" required />
              </div>
              <div className="sm:col-span-3 flex justify-end gap-2.5">
                <button type="button" onClick={() => setShowForm(false)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all">
                  Cancelar
                </button>
                <button type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 transition-all">
                  <i className="fas fa-check"></i>
                  Asignar
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Assignments Table */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 text-slate-500 py-16 bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <i className="fas fa-spinner fa-spin"></i>
          Cargando...
        </div>
      ) : filter === 'sin_asignar' ? (
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
                    <th className="px-4 py-3 text-left text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500">Matrícula</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unassignedStudents.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{s.full_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{s.email}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500">{s.student_code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <i className="fas fa-users-slash text-3xl text-slate-300 mb-3"></i>
          <p className="text-sm font-medium text-slate-500">{search ? 'Sin resultados de búsqueda' : 'No hay asignaciones registradas'}</p>
          <p className="text-xs text-slate-400 mt-1">Usa "Nueva Asignación" o "Importar CSV" para comenzar</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <i className="fas fa-table-list text-slate-400"></i>
              <h2 className="text-sm font-semibold text-slate-700">Asignaciones Actuales</h2>
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-[0.7rem] font-bold bg-indigo-100 text-indigo-700">
                {activeCount}
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
                      onChange={() => {
                        const active = filteredAssignments.filter(a => !a.released_at)
                        if (selectedIds.size === active.length) setSelectedIds(new Set())
                        else setSelectedIds(new Set(active.map(a => a.id)))
                      }}
                      className="appearance-none w-4 h-4 border-2 border-slate-300 rounded cursor-pointer transition-all checked:bg-slate-900 checked:border-slate-900 checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] bg-contain bg-center bg-no-repeat" />
                  </th>
                  <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Estudiante</th>
                  <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Correo</th>
                  <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Matrícula</th>
                  <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">VM</th>
                  <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Estado VM</th>
                  <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">IP</th>
                  <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Asignación</th>
                  <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left w-20">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssignments.map((a) => {
                  const student = students.find(s => s.id === a.id_student)
                  const vm = vms.find(v => v.id === a.id_vm)
                  const isReleased = !!a.released_at
                  const isSelected = selectedIds.has(a.id)
                  const state = vm?.current_state || 'unknown'

                  return (
                    <tr key={a.id} className={`transition-colors hover:bg-slate-50/80 ${isSelected ? 'bg-sky-50' : ''} ${isReleased ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3.5">
                        {!isReleased && (
                          <input type="checkbox" checked={isSelected}
                            onChange={() => toggleSelect(a.id)}
                            className="appearance-none w-4 h-4 border-2 border-slate-300 rounded cursor-pointer transition-all checked:bg-slate-900 checked:border-slate-900 checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] bg-contain bg-center bg-no-repeat" />
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-800">{student?.full_name || getStudentName(a.id_student)}</td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs">{student?.email || <span className="text-slate-300 italic">sin correo</span>}</td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs font-mono">{student?.student_code || '—'}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono ${
                          isReleased ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          <i className={`fas fa-server ${isReleased ? 'text-red-400' : 'text-indigo-400'}`}></i>
                          {vm?.name || getVmName(a.id_vm)}
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
                        {new Date(a.assigned_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-3.5">
                          {!isReleased ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => setConfirmRelease(a.id)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                              title="Desvincular estudiante">
                              <i className="fas fa-link-slash text-sm"></i>
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Liberada</span>
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

      {/* History Accordion */}
      {showHistory && (
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <i className="fas fa-clock-rotate-left text-slate-400"></i>
              <h2 className="text-sm font-semibold text-slate-700">Historial de Asignaciones</h2>
              <span className="text-xs text-slate-400 font-mono">{periods.length} período{periods.length !== 1 ? 's' : ''}</span>
            </div>
            <button onClick={() => loadPeriods()}
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
                const isOpen = expandedPeriod === p.period_name
                return (
                  <div key={p.period_name} className="bg-white border border-slate-200/80 rounded-xl overflow-hidden hover:border-slate-300/60 transition-colors">
                    <button onClick={() => togglePeriodAccordion(p.period_name)}
                      className="w-full flex items-center justify-between gap-3 px-4 lg:px-5 py-3.5 text-left">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-slate-600">{p.period_name.slice(-1)}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">Período {p.period_name}</span>
                            <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-[0.7rem] font-bold bg-indigo-100 text-indigo-700">{p.total}</span>
                          </div>
                          <div className="flex items-center gap-2.5 text-xs text-slate-400 mt-0.5">
                            <span><i className="fas fa-check-circle text-emerald-500 mr-1"></i>{p.active} activa{p.active !== 1 ? 's' : ''}</span>
                            {p.released > 0 && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                <span><i className="fas fa-circle-minus text-slate-400 mr-1"></i>{p.released} liberada{p.released !== 1 ? 's' : ''}</span>
                              </>
                            )}
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
                          <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
                            <i className="fas fa-spinner fa-spin"></i>
                            Cargando...
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
                                  const s = students.find(st => st.id === pa.id_student)
                                  const vm = vms.find(v => v.id === pa.id_vm)
                                  const released = !!pa.released_at
                                  return (
                                    <tr key={pa.id} className="hover:bg-slate-50/60 transition-colors">
                                      <td className="px-4 py-2.5 text-slate-700">
                                        {s?.full_name || getStudentName(pa.id_student)}
                                        <br /><span className="text-slate-400">{s?.student_code || ''}</span>
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold font-mono ${
                                          released ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-700'
                                        }`}>
                                          <i className={`fas fa-server ${released ? 'text-red-400' : 'text-indigo-400'}`}></i>
                                          {vm?.name || getVmName(pa.id_vm)}
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
      )}

      {/* Modals */}
      <ConfirmModal
        open={confirmRelease !== null}
        title="¿Desvincular asignación?"
        message="La VM quedará disponible para futuras asignaciones."
        danger confirmLabel="Desvincular"
        onConfirm={() => confirmRelease !== null && handleRelease(confirmRelease)}
        onCancel={() => setConfirmRelease(null)} />

      <ConfirmModal
        open={confirmBulkRelease}
        title="¿Desvincular seleccionados?"
        message={`Se liberarán ${selectedIds.size} asignaciones.`}
        danger confirmLabel="Desvincular todo"
        onConfirm={handleBulkRelease}
        onCancel={() => setConfirmBulkRelease(false)} />

      <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-250 ${confirmAutoAssign ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="fixed inset-0 backdrop-blur-sm bg-black/40" onClick={() => setConfirmAutoAssign(false)} />
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 transform transition-transform duration-300 scale-95">
          <div className="flex flex-col items-center text-center mb-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-3">
              <i className="fas fa-bolt text-blue-600 text-xl"></i>
            </div>
            <h2 className="text-lg font-semibold text-slate-800">¿Asignar automáticamente?</h2>
            <p className="text-sm text-slate-600 mt-2">
              Se asignarán VMs disponibles a estudiantes sin asignación (período: <strong>{periodName}</strong>). vhost-10 quedará reservada.
            </p>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setConfirmAutoAssign(false)}
              className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all">
              Cancelar
            </button>
            <button onClick={handleAutoAssign}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-all">
              <i className="fas fa-bolt"></i>
              Asignar Automáticamente
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
