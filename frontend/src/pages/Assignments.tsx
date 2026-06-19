import { useState, FormEvent } from 'react'
import { api } from '../services/api'
import { useToast } from '../hooks/useToast'
import { useAssignments } from '../hooks/useAssignments'
import type { VMState } from '../types'
import ConfirmModal from '../components/ConfirmModal'
import ClosePeriodModal from '../components/ClosePeriodModal'
import ContentHeader from '../components/ContentHeader'
import AssignmentStats from '../components/AssignmentStats'
import AssignmentToolbar from '../components/AssignmentToolbar'
import AssignmentTable from '../components/AssignmentTable'


export default function Assignments() {
  const { assignments, vms, students, allPeriods, currentPeriod, selectedPeriodId, loading, error, refetch: loadData, loadPeriods, handleSelectPeriod, handleActivatePeriod, page, totalPages, totalAssignments, goToPage } = useAssignments()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todos')

  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ vm_id: 0, student_id: 0 })

  const { addToast } = useToast()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmRelease, setConfirmRelease] = useState<number | null>(null)
  const [confirmBulkRelease, setConfirmBulkRelease] = useState(false)
  const [confirmDeleteAssignment, setConfirmDeleteAssignment] = useState<number | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [confirmClosePeriod, setConfirmClosePeriod] = useState(false)
  const [confirmActivatePeriod, setConfirmActivatePeriod] = useState(false)
  const [confirmUndoImport, setConfirmUndoImport] = useState(false)
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState<{ id: number; name: string } | null>(null)

  const [importResult, setImportResult] = useState<{ created: number; assigned: number; unassigned: number; errors: string[]; created_ids: number[] } | null>(null)
  const [csvImporting, setCsvImporting] = useState(false)
  const [capacityWarning, setCapacityWarning] = useState<string | null>(null)



  const TEACHER_VM = 'vhost-10'
  const activePeriodId = selectedPeriodId
  const activePeriodCode = allPeriods.find(p => p.id === selectedPeriodId)?.code ?? currentPeriod?.code ?? '—'

  const getVmName = (id: number) => Array.isArray(vms) ? vms.find((v) => v.id === id)?.name || `VM #${id}` : `VM #${id}`
  const getStudentName = (id: number) =>
    Array.isArray(students) ? students.find((s) => s.id === id)?.full_name || `Estudiante #${id}` : `Estudiante #${id}`

  const availableVms = Array.isArray(vms)
    ? vms.filter((v) => v.name !== TEACHER_VM && !assignments.some((a) => a.vm_id === v.id && !a.released_at))
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
    if (!formData.vm_id || formData.vm_id <= 0) {
      addToast('error', 'Debes seleccionar una VM')
      return
    }
    if (!formData.student_id || formData.student_id <= 0) {
      addToast('error', 'Debes seleccionar un estudiante')
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

  const handleImportCsv = async (file: File) => {
    setCsvImporting(true)
    setCapacityWarning(null)
    try {
      const result = await api.students.importCsv(file, activePeriodId || undefined)
      setImportResult(result)
      addToast('success', `${result.created} creados, ${result.assigned} asignados`)

      if (result.unassigned > 0) {
        setCapacityWarning(`${result.unassigned} estudiante${result.unassigned !== 1 ? 's' : ''} del CSV no pudieron recibir VM por falta de recursos.`)
      }

      await loadData(activePeriodId || undefined)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al importar')
    } finally {
      setCsvImporting(false)
    }
  }

  const handleUndoImport = async () => {
    try {
      const { created_ids } = importResult!
      const result = await api.students.undoImport({
        student_ids: created_ids,
        period_id: activePeriodId || undefined,
      })
      setConfirmUndoImport(false)
      setImportResult(null)
      addToast('success', `Importación revertida: ${result.deleted_students} estudiantes eliminados, ${result.deleted_assignments} asignaciones borradas`)
      await loadData(activePeriodId || undefined)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al revertir importación')
    }
  }

  const handleExportCsv = async () => {
    try {
      const blob = await api.assignments.export(activePeriodId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `asignaciones_${activePeriodCode.replace(/\s+/g, '_')}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      addToast('success', 'CSV exportado correctamente')
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al exportar CSV')
    }
  }

  const handleClosePeriod = async () => {
    if (!activePeriodId) return
    try {
      const result = await api.periods.close(activePeriodId)
      setConfirmClosePeriod(false)
      addToast('success', `Período finalizado (${result.released_count} asignaciones liberadas)`)    
      await loadData(activePeriodId || undefined)
      await loadPeriods()
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al cerrar período')
    }
  }

  const handleActivate = async () => {
    if (!activePeriodId) return
    setConfirmActivatePeriod(false)
    try {
      await handleActivatePeriod(activePeriodId)
      addToast('success', 'Período reabierto correctamente')
      await loadData(activePeriodId)
      await loadPeriods()
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al reabrir período')
    }
  }

  const handleDeleteStudent = async (studentId: number, studentName: string) => {
    setConfirmDeleteStudent(null)
    try {
      await api.students.delete(studentId)
      addToast('success', `Estudiante "${studentName}" eliminado`)
      await loadData(activePeriodId || undefined)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al eliminar estudiante')
    }
  }

  const handleDeleteAssignment = async (assignmentId: number) => {
    setConfirmDeleteAssignment(null)
    try {
      await api.assignments.delete(assignmentId)
      addToast('success', 'Asignación eliminada')
      await loadData(activePeriodId || undefined)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al eliminar asignación')
    }
  }

  const handleBulkDelete = async () => {
    setConfirmBulkDelete(false)
    try {
      const result = await api.assignments.bulkDelete(Array.from(selectedIds))
      setSelectedIds(new Set())
      addToast('success', `${result.deleted} asignaciones eliminadas`)
      await loadData(activePeriodId || undefined)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al eliminar asignaciones')
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

  const assignedIds = new Set(assignments.filter(a => !a.released_at).map(a => a.student_id))
  const unassignedStudents = students.filter(s => s.is_active && !assignedIds.has(s.id))
  const assignedStudentIds = new Set(assignments.map(a => a.student_id))
  const studentsPerPeriod = Array.isArray(students) ? students.filter(s => assignedStudentIds.has(s.id)) : []

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
  }).sort((a, b) => {
    const nameA = (vms.find(v => v.id === a.vm_id)?.name || '').replace('vhost-', '')
    const nameB = (vms.find(v => v.id === b.vm_id)?.name || '').replace('vhost-', '')
    return (parseInt(nameA, 10) || 0) - (parseInt(nameB, 10) || 0)
  })

  const activeCount = assignments.filter(a => !a.released_at).length
  const isOpenPeriod = currentPeriod?.id === selectedPeriodId && !currentPeriod?.closed_at
  const totalStudents = isOpenPeriod
    ? students.filter(s => s.is_active).length
    : studentsPerPeriod.length
  const pendingStudents = isOpenPeriod ? totalStudents - activeCount : 0
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
        onPeriodChange={handleSelectPeriod}
        showForm={showForm}
        onToggleForm={() => setShowForm(!showForm)}
        formData={formData}
        onFormDataChange={setFormData}
        availableVms={availableVms}
        availableStudents={availableStudents}
        allStudents={studentsPerPeriod}
        onDeleteStudent={(id, name) => setConfirmDeleteStudent({ id, name })}
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
        onCreate={handleCreate}
        onImportCsv={handleImportCsv}
        onUndoImport={() => setConfirmUndoImport(true)}
        onBulkRelease={() => setConfirmBulkRelease(true)}
        onBulkDelete={() => setConfirmBulkDelete(true)}
        onClearSelection={() => setSelectedIds(new Set())}
        onClosePeriod={() => setConfirmClosePeriod(true)}
        onActivatePeriod={() => setConfirmActivatePeriod(true)}
        onExportCsv={handleExportCsv}
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
        onDeleteAssignment={(id) => setConfirmDeleteAssignment(id)}
        onDeleteStudent={(id, name) => setConfirmDeleteStudent({ id, name })}
        page={page + 1}
        totalPages={totalPages}
        totalItems={totalAssignments}
        onPageChange={(p) => goToPage(p - 1)}
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
        open={confirmDeleteAssignment !== null}
        title="¿Eliminar asignación?"
        message="La asignación será eliminada permanentemente. Esto no se puede deshacer."
        danger confirmLabel="Eliminar"
        onConfirm={() => confirmDeleteAssignment !== null && handleDeleteAssignment(confirmDeleteAssignment)}
        onCancel={() => setConfirmDeleteAssignment(null)} />

      <ConfirmModal
        open={confirmBulkDelete}
        title="¿Eliminar seleccionados?"
        message={`Se eliminarán permanentemente ${selectedIds.size} asignaciones. Esto no se puede deshacer.`}
        danger confirmLabel="Eliminar todo"
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)} />

      <ConfirmModal
        open={confirmUndoImport}
        title="¿Revertir importación?"
        message={`Se eliminarán ${importResult?.created_ids?.length ?? 0} estudiantes recién importados y se liberarán sus asignaciones.`}
        danger confirmLabel="Revertir"
        onConfirm={handleUndoImport}
        onCancel={() => setConfirmUndoImport(false)} />

      <ClosePeriodModal
        open={confirmClosePeriod}
        periodCode={activePeriodCode}
        onConfirm={handleClosePeriod}
        onCancel={() => setConfirmClosePeriod(false)} />

      <ConfirmModal
        open={confirmActivatePeriod}
        title="¿Reabrir período?"
        message="El período volverá a estar activo. Las asignaciones liberadas no se restaurarán automáticamente."
        confirmLabel="Reabrir"
        onConfirm={handleActivate}
        onCancel={() => setConfirmActivatePeriod(false)} />

      <ConfirmModal
        open={confirmDeleteStudent !== null}
        title="¿Eliminar estudiante?"
        message={`Se eliminará permanentemente a "${confirmDeleteStudent?.name}". Esto no se puede deshacer.`}
        danger confirmLabel="Eliminar"
        onConfirm={() => confirmDeleteStudent && handleDeleteStudent(confirmDeleteStudent.id, confirmDeleteStudent.name)}
        onCancel={() => setConfirmDeleteStudent(null)} />
    </div>
  )
}
