import { useState, FormEvent } from 'react'
import { api } from '../services/api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useToast } from '../hooks/useToast'
import { useAssignments } from '../hooks/useAssignments'
import type { VMState, AutoAssignPreview, AutoAssignResult } from '../types'
import ConfirmModal from '../components/ConfirmModal'
import ClosePeriodModal from '../components/ClosePeriodModal'
import ContentHeader from '../components/ContentHeader'
import AssignmentStats from '../components/AssignmentStats'
import AssignmentToolbar from '../components/AssignmentToolbar'
import AssignmentTable from '../components/AssignmentTable'
import AutoAssignModal from '../components/AutoAssignModal'

export default function Assignments() {
  const { assignments, vms, students, allPeriods, currentPeriod, selectedPeriodId, loading, error, refetch: loadData, loadPeriods, handleSelectPeriod, handleActivatePeriod, page, totalPages, totalAssignments, goToPage } = useAssignments()
  const { addToast } = useToast()
  const action = useAsyncAction()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todos')

  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ vm_id: 0, student_id: 0 })

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const [confirmDeleteAssignment, setConfirmDeleteAssignment] = useState<number | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [confirmClosePeriod, setConfirmClosePeriod] = useState(false)
  const [confirmActivatePeriod, setConfirmActivatePeriod] = useState(false)

  const [autoAssignPreview, setAutoAssignPreview] = useState<AutoAssignPreview | null>(null)
  const [autoAssignResult, setAutoAssignResult] = useState<AutoAssignResult | null>(null)
  const [autoAssignLoading, setAutoAssignLoading] = useState(false)
  const [autoAssignExecuting, setAutoAssignExecuting] = useState(false)

  const TEACHER_VM = 'vhost-10'
  const activePeriodCode = allPeriods.find(p => p.id === selectedPeriodId)?.code ?? currentPeriod?.code ?? '—'

  const getVmName = (id: number) => vms.find((v) => v.id === id)?.name || `VM #${id}`
  const getStudentName = (id: number) => students.find((s) => s.id === id)?.full_name || `Estudiante #${id}`

  const periodStudentIds = new Set(assignments.map(a => a.student_id))
  const periodStudents = students.filter(s => periodStudentIds.has(s.id))

  const availableVms = vms.filter((v) => v.name !== TEACHER_VM && !assignments.some((a) => a.vm_id === v.id && !a.released_at))
  const availableStudents = periodStudents.filter((s) => s.is_active && !assignments.some((a) => a.student_id === s.id && a.vm_id != null && !a.released_at))

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedPeriodId) {
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
    await action.execute('create-assignment', async () => {
      try {
        await api.assignments.create({ ...formData, period_id: selectedPeriodId })
        setFormData({ vm_id: 0, student_id: 0 })
        setShowForm(false)
        addToast('success', 'Asignación creada correctamente')
        await loadData(selectedPeriodId || undefined)
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al crear asignación')
      }
    })
  }

  const handleExportCsv = async () => {
    await action.execute('export-csv', async () => {
      try {
        const blob = await api.assignments.export(selectedPeriodId)
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
    })
  }

  const handleClosePeriod = async () => {
    if (!selectedPeriodId) return
    await action.execute('close-period', async () => {
      try {
        const result = await api.periods.close(selectedPeriodId)
        setConfirmClosePeriod(false)
        addToast('success', `Período finalizado (${result.released_count} asignaciones liberadas)`)
        await loadData(selectedPeriodId || undefined)
        await loadPeriods()
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al cerrar período')
      }
    })
  }

  const handleActivate = async () => {
    if (!selectedPeriodId) return
    await action.execute('activate-period', async () => {
      setConfirmActivatePeriod(false)
      try {
        await handleActivatePeriod(selectedPeriodId)
        addToast('success', 'Período reabierto correctamente')
        await loadData(selectedPeriodId)
        await loadPeriods()
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al reabrir período')
      }
    })
  }

  const handleAutoAssign = async () => {
    if (!selectedPeriodId) return
    setAutoAssignPreview(null)
    setAutoAssignResult(null)
    setAutoAssignLoading(true)
    try {
      const result = await api.assignments.autoAssign({ period_id: selectedPeriodId, preview: true })
      setAutoAssignPreview(result as AutoAssignPreview)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al generar vista previa')
    } finally {
      setAutoAssignLoading(false)
    }
  }

  const handleAutoAssignConfirm = async () => {
    if (!selectedPeriodId) return
    setAutoAssignExecuting(true)
    try {
      const result = await api.assignments.autoAssign({ period_id: selectedPeriodId, preview: false })
      setAutoAssignResult(result as AutoAssignResult)
      setAutoAssignPreview(null)
      addToast('success', `${(result as AutoAssignResult).created} asignaciones automáticas creadas`)
      await loadData(selectedPeriodId)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Error al asignar automáticamente')
    } finally {
      setAutoAssignExecuting(false)
    }
  }

  const handleCloseAutoAssign = () => {
    setAutoAssignPreview(null)
    setAutoAssignResult(null)
  }

  const handleDeleteAssignment = async (assignmentId: number) => {
    setConfirmDeleteAssignment(null)
    await action.execute(`delete-assignment-${assignmentId}`, async () => {
      try {
        await api.assignments.delete(assignmentId)
        addToast('success', 'Asignación eliminada')
        await loadData(selectedPeriodId || undefined)
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al eliminar asignación')
      }
    })
  }

  const handleBulkDelete = async () => {
    setConfirmBulkDelete(false)
    await action.execute('bulk-delete', async () => {
      try {
        const result = await api.assignments.bulkDelete(Array.from(selectedIds))
        setSelectedIds(new Set())
        addToast('success', `${result.deleted} asignaciones eliminadas`)
        await loadData(selectedPeriodId || undefined)
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al eliminar asignaciones')
      }
    })
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

  const filteredAssignments = assignments
    .filter(a => a.vm_id != null)
    .filter(a => {
    const studentExists = students.some(s => s.id === a.student_id)
    if (!studentExists) return false
    if (filter === 'asignados') return !a.released_at
    if (filter === 'sin_asignar') return false
    if (search) {
      const q = search.toLowerCase()
      const student = students.find(st => st.id === a.student_id)
      const vm = vms.find(v => v.id === a.vm_id)
      return (
        student?.full_name.toLowerCase().includes(q) ||
        student?.email.toLowerCase().includes(q) ||
        vm?.name.toLowerCase().includes(q)
      )
    }
    return true
  }).sort((a, b) => {
    const nameA = (vms.find(v => v.id === a.vm_id)?.name || '').replace('vhost-', '')
    const nameB = (vms.find(v => v.id === b.vm_id)?.name || '').replace('vhost-', '')
    return (parseInt(nameA, 10) || 0) - (parseInt(nameB, 10) || 0)
  })

  const activeCount = assignments.filter(a => a.vm_id != null && !a.released_at).length
  const isOpenPeriod = currentPeriod?.id === selectedPeriodId && !currentPeriod?.closed_at

  const totalStudents = periodStudents.length
  const pendingStudents = isOpenPeriod ? totalStudents - activeCount : 0
  const freeVms = vms.filter(v => v.name !== TEACHER_VM && !assignments.some(a => a.vm_id === v.id && !a.released_at)).length

  const unassignedStudents = periodStudents.filter(s => s.is_active && !assignments.some(a => a.student_id === s.id && a.vm_id != null && !a.released_at))

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

      {!selectedPeriodId ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <i className="fas fa-calendar-day text-4xl text-slate-300 mb-4"></i>
          <p className="text-base font-semibold text-slate-500">Selecciona un período</p>
          <p className="text-sm text-slate-400 mt-1">Elige un período en el selector superior para gestionar las asignaciones.</p>
        </div>
      ) : null}

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
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        selectedIds={selectedIds}
        onCreate={handleCreate}
        onBulkDelete={() => setConfirmBulkDelete(true)}
        onClearSelection={() => setSelectedIds(new Set())}
        onClosePeriod={() => setConfirmClosePeriod(true)}
        onActivatePeriod={() => setConfirmActivatePeriod(true)}
        onExportCsv={handleExportCsv}
        onAutoAssign={handleAutoAssign}
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
        onDeleteAssignment={(id) => setConfirmDeleteAssignment(id)}
        page={page + 1}
        totalPages={totalPages}
        totalItems={totalAssignments}
        onPageChange={(p) => goToPage(p - 1)}
      />

      <ConfirmModal
        open={confirmDeleteAssignment !== null}
        title="¿Eliminar asignación?"
        message="La asignación será eliminada permanentemente. Esto no se puede deshacer."
        danger confirmLabel="Eliminar"
        loading={confirmDeleteAssignment !== null && action.isLoading(`delete-assignment-${confirmDeleteAssignment}`)}
        loadingLabel="Eliminando..."
        onConfirm={() => confirmDeleteAssignment !== null && handleDeleteAssignment(confirmDeleteAssignment)}
        onCancel={() => setConfirmDeleteAssignment(null)} />

      <ConfirmModal
        open={confirmBulkDelete}
        title="¿Eliminar seleccionados?"
        message={`Se eliminarán permanentemente ${selectedIds.size} asignaciones. Esto no se puede deshacer.`}
        danger confirmLabel="Eliminar todo"
        loading={action.isLoading('bulk-delete')}
        loadingLabel="Eliminando..."
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)} />

      <ClosePeriodModal
        open={confirmClosePeriod}
        periodCode={activePeriodCode}
        loading={action.isLoading('close-period')}
        loadingLabel="Finalizando..."
        onConfirm={handleClosePeriod}
        onCancel={() => setConfirmClosePeriod(false)} />

      <ConfirmModal
        open={confirmActivatePeriod}
        title="¿Reabrir período?"
        message="El período volverá a estar activo. Las asignaciones liberadas no se restaurarán automáticamente."
        confirmLabel="Reabrir"
        loading={action.isLoading('activate-period')}
        loadingLabel="Reabriendo..."
        onConfirm={handleActivate}
        onCancel={() => setConfirmActivatePeriod(false)} />

      <AutoAssignModal
        open={autoAssignPreview !== null || autoAssignResult !== null || autoAssignLoading}
        preview={autoAssignPreview}
        result={autoAssignResult}
        loading={autoAssignLoading}
        executing={autoAssignExecuting}
        onConfirm={handleAutoAssignConfirm}
        onCancel={handleCloseAutoAssign} />
    </div>
  )
}
