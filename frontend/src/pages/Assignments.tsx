import { useState, FormEvent } from 'react'
import { api } from '../services/api'
import { useToast } from '../hooks/useToast'
import { useAssignments } from '../hooks/useAssignments'
import type { VMAssignment, VMState } from '../types'
import ConfirmModal from '../components/ConfirmModal'
import ClosePeriodModal from '../components/ClosePeriodModal'
import ContentHeader from '../components/ContentHeader'
import AssignmentStats from '../components/AssignmentStats'
import AssignmentToolbar from '../components/AssignmentToolbar'
import AssignmentTable from '../components/AssignmentTable'
import AssignmentHistory from '../components/AssignmentHistory'

export default function Assignments() {
  const { assignments, vms, students, allPeriods, currentPeriod, selectedPeriodId, loading, error, refetch: loadData, loadPeriods, handleActivatePeriod } = useAssignments()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todos')

  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ vm_id: 0, student_id: 0 })

  const { addToast } = useToast()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmRelease, setConfirmRelease] = useState<number | null>(null)
  const [confirmBulkRelease, setConfirmBulkRelease] = useState(false)
  const [confirmAutoAssign, setConfirmAutoAssign] = useState(false)
  const [confirmClosePeriod, setConfirmClosePeriod] = useState(false)
  const [autoAssignResults, setAutoAssignResults] = useState<{ preview?: boolean; created?: number; assignments: Array<{ student: string; vm: string; student_id?: number; vm_id?: number }>; unassigned_students: number } | null>(null)

  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null)
  const [csvImporting, setCsvImporting] = useState(false)
  const [capacityWarning, setCapacityWarning] = useState<string | null>(null)

  const [showHistory, setShowHistory] = useState(false)
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null)
  const [periodAssignments, setPeriodAssignments] = useState<VMAssignment[]>([])
  const [loadingPeriod, setLoadingPeriod] = useState(false)

  const activePeriodId = selectedPeriodId
  const activePeriodCode = allPeriods.find(p => p.id === selectedPeriodId)?.code ?? currentPeriod?.code ?? '—'

  const getVmName = (id: number) => Array.isArray(vms) ? vms.find((v) => v.id === id)?.name || `VM #${id}` : `VM #${id}`
  const getStudentName = (id: number) =>
    Array.isArray(students) ? students.find((s) => s.id === id)?.full_name || `Estudiante #${id}` : `Estudiante #${id}`

  const availableVms = Array.isArray(vms)
    ? vms.filter((v) => !assignments.some((a) => a.vm_id === v.id && !a.released_at))
    : []
  const availableStudents = Array.isArray(students)
    ? students.filter((s) => s.is_active && !assignments.some((a) => a.student_id === s.id && !a.released_at))
    : []

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!activePeriodId) {
      addToast('error', 'No hay un período activo')
      return
    }
    try {
      await api.assignments.create({ ...formData, period_id: activePeriodId })
      setFormData({ vm_id: 0, student_id: 0 })
      setShowForm(false)
      addToast('success', 'Asignación creada correctamente')
      await loadData(activePeriodId || undefined)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al crear asignación')
    }
  }

  const handleRelease = async (id: number) => {
    try {
      await api.assignments.release(id)
      setConfirmRelease(null)
      addToast('success', 'Asignación liberada')
      await loadData(activePeriodId || undefined)
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
      await loadData(activePeriodId || undefined)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al liberar asignaciones')
    }
  }

  const handleAutoAssign = async (confirmed = false) => {
    if (!activePeriodId) {
      addToast('error', 'No hay un período activo')
      return
    }
    try {
      const result = await api.assignments.autoAssign(activePeriodId, !confirmed)
      if (!confirmed && result.preview) {
        setAutoAssignResults(result)
        setConfirmAutoAssign(true)
        return
      }
      setAutoAssignResults(result)
      setConfirmAutoAssign(false)
      addToast('success', `${result.created} asignaciones automáticas creadas`)
      await loadData(activePeriodId || undefined)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error en asignación automática')
    }
  }

  const handleBatchAssign = async (selected: Array<{ vm_id: number; student_id: number }>) => {
    if (!activePeriodId || selected.length === 0) return
    try {
      const items = selected.map(s => ({ ...s, period_id: activePeriodId }))
      const result = await api.assignments.batchCreate(items)
      addToast('success', `${result.created} asignaciones creadas`)
      setAutoAssignResults(null)
      await loadData(activePeriodId || undefined)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al crear asignaciones')
    }
  }

  const handleImportCsv = async (file: File) => {
    setCsvImporting(true)
    setCapacityWarning(null)
    addToast('loading', 'Importando estudiantes...')
    try {
      const result = await api.students.importCsv(file)
      setImportResult(result)
      addToast('success', `${result.created} estudiantes importados`)

      const available = freeVms
      if (result.created > available) {
        setCapacityWarning(`Solo hay ${available} VM${available !== 1 ? 's' : ''} disponibles para estudiantes. ${result.created - available} estudiante${result.created - available !== 1 ? 's' : ''} quedar${result.created - available !== 1 ? 'án' : 'á'} sin asignar.`)
      }

      await loadData(activePeriodId || undefined)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al importar')
    } finally {
      setCsvImporting(false)
    }
  }

  const handleClosePeriod = async () => {
    if (!activePeriodId) return
    try {
      const result = await api.periods.close(activePeriodId)
      setConfirmClosePeriod(false)
      addToast('success', `Período cerrado (${result.released_count} asignaciones liberadas)`)
      await loadData(activePeriodId || undefined)
      await loadPeriods()
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al cerrar período')
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    const active = filteredAssignments.filter(a => !a.released_at)
    if (selectedIds.size === active.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(active.map(a => a.id)))
  }

  const loadPeriodAssignments = async (periodId: number) => {
    setLoadingPeriod(true)
    try {
      const data = await api.assignments.list(false, periodId)
      setPeriodAssignments(Array.isArray(data) ? data : [])
    } catch (err) {
      addToast('error', 'Error al cargar asignaciones del período')
    } finally {
      setLoadingPeriod(false)
    }
  }

  const togglePeriodAccordion = (periodId: number) => {
    if (expandedPeriod === periodId) {
      setExpandedPeriod(null)
      setPeriodAssignments([])
      return
    }
    setExpandedPeriod(periodId)
    loadPeriodAssignments(periodId)
  }

  const assignedIds = new Set(assignments.filter(a => !a.released_at).map(a => a.student_id))
  const unassignedStudents = students.filter(s => s.is_active && !assignedIds.has(s.id))

  const filteredAssignments = assignments.filter(a => {
    if (filter === 'asignados') return !a.released_at
    if (filter === 'sin_asignar') return false
    if (search) {
      const s = search.toLowerCase()
      const student = students.find(st => st.id === a.student_id)
      const vm = vms.find(v => v.id === a.vm_id)
      return (
        student?.full_name.toLowerCase().includes(s) ||
        student?.email.toLowerCase().includes(s) ||
        vm?.name.toLowerCase().includes(s)
      )
    }
    return true
  })

  const activeCount = assignments.filter(a => !a.released_at).length
  const isOpenPeriod = currentPeriod?.id === selectedPeriodId && !currentPeriod?.closed_at
  const totalStudents = isOpenPeriod
    ? students.filter(s => s.is_active).length
    : new Set(assignments.map(a => a.student_id)).size
  const pendingStudents = isOpenPeriod ? totalStudents - activeCount : 0
  const TEACHER_VM = 'vhost-10'
  const freeVms = vms.filter(v => v.name !== TEACHER_VM && !assignments.some(a => a.vm_id === v.id && !a.released_at)).length

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
    <div className="bg-[#f8fafc] space-y-5">
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-red-50 border-red-200 text-red-700">
          <i className="fas fa-circle-exclamation mt-0.5"></i>
          <span className="flex-1 text-sm">{error}</span>
        </div>
      )}

      <ContentHeader title="Asignaciones de Laboratorio" icon="fa-users-gear" />
      <AssignmentStats totalStudents={totalStudents} activeCount={activeCount} pendingStudents={pendingStudents} freeVms={freeVms} />

      <AssignmentToolbar
        allPeriods={allPeriods}
        selectedPeriodId={selectedPeriodId}
        onPeriodChange={handleActivatePeriod}
        showForm={showForm}
        onToggleForm={() => setShowForm(!showForm)}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory(!showHistory)}
        formData={formData}
        onFormDataChange={setFormData}
        availableVms={availableVms}
        availableStudents={availableStudents}
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        selectedIds={selectedIds}
        importResult={importResult}
        onImportResultDismiss={() => setImportResult(null)}
        capacityWarning={capacityWarning}
        onCapacityWarningDismiss={() => setCapacityWarning(null)}
        csvImporting={csvImporting}
        autoAssignResults={autoAssignResults}
        onAutoAssignResultsDismiss={() => setAutoAssignResults(null)}
        onBatchAssign={handleBatchAssign}
        onCreate={handleCreate}
        onImportCsv={handleImportCsv}
        onAutoAssign={() => {
          if (!activePeriodId) {
            addToast('error', 'No hay un período activo')
            return
          }
          if (availableVms.length === 0 || availableStudents.length === 0) {
            addToast('error', 'No hay VMs o estudiantes disponibles')
            return
          }
          handleAutoAssign(false)
        }}
        onBulkRelease={() => setConfirmBulkRelease(true)}
        onClearSelection={() => setSelectedIds(new Set())}
        onClosePeriod={() => setConfirmClosePeriod(true)}
      />

      <AssignmentTable
        loading={loading}
        filter={filter}
        search={search}
        filteredAssignments={filteredAssignments}
        unassignedStudents={unassignedStudents}
        students={students}
        vms={vms}
        selectedIds={selectedIds}
        stateColors={stateColors}
        stateDots={stateDots}
        getVmName={getVmName}
        getStudentName={getStudentName}
        onToggleSelect={toggleSelect}
        onSelectAll={handleSelectAll}
        onConfirmRelease={(id) => setConfirmRelease(id)}
      />

      <AssignmentHistory
        show={showHistory}
        periods={allPeriods}
        expandedPeriod={expandedPeriod}
        loadingPeriod={loadingPeriod}
        periodAssignments={periodAssignments}
        students={students}
        vms={vms}
        onTogglePeriod={togglePeriodAccordion}
        onLoadPeriods={loadPeriods}
      />

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

      <ConfirmModal
        open={confirmAutoAssign}
        title="¿Asignar automáticamente?"
        message={`Se asignarán VMs disponibles a estudiantes sin asignación (período: ${activePeriodCode}). vhost-10 quedará reservada.`}
        confirmLabel="Asignar Automáticamente"
        onConfirm={() => handleAutoAssign(true)}
        onCancel={() => setConfirmAutoAssign(false)} />

      <ClosePeriodModal
        open={confirmClosePeriod}
        periodCode={activePeriodCode}
        onConfirm={handleClosePeriod}
        onCancel={() => setConfirmClosePeriod(false)} />
    </div>
  )
}
