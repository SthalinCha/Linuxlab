import { useState, FormEvent } from 'react'
import { api } from '../services/api'
import { useAsyncAction } from '../hooks/useAsyncAction'
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
  const { addToast } = useToast()
  const action = useAsyncAction()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todos')
  const [showStudentList, setShowStudentList] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ vm_id: 0, student_id: 0 })

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const [confirmDeleteAssignment, setConfirmDeleteAssignment] = useState<number | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [confirmClosePeriod, setConfirmClosePeriod] = useState(false)
  const [confirmActivatePeriod, setConfirmActivatePeriod] = useState(false)
  const [confirmUndoImport, setConfirmUndoImport] = useState(false)
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState<{ id: number; name: string } | null>(null)
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set())
  const [confirmBulkDeleteStudents, setConfirmBulkDeleteStudents] = useState(false)

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
    await action.execute('create-assignment', async () => {
      try {
        await api.assignments.create({ ...formData, period_id: activePeriodId })
        setFormData({ vm_id: 0, student_id: 0 })
        setShowForm(false)
        addToast('success', 'Asignación creada correctamente')
        await loadData(activePeriodId || undefined)
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al crear asignación')
      }
    })
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
    await action.execute('undo-import', async () => {
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
    })
  }

  const handleExportCsv = async () => {
    await action.execute('export-csv', async () => {
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
    })
  }

  const handleClosePeriod = async () => {
    if (!activePeriodId) return
    await action.execute('close-period', async () => {
      try {
        const result = await api.periods.close(activePeriodId)
        setConfirmClosePeriod(false)
        addToast('success', `Período finalizado (${result.released_count} asignaciones liberadas)`)
        await loadData(activePeriodId || undefined)
        await loadPeriods()
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al cerrar período')
      }
    })
  }

  const handleActivate = async () => {
    if (!activePeriodId) return
    await action.execute('activate-period', async () => {
      setConfirmActivatePeriod(false)
      try {
        await handleActivatePeriod(activePeriodId)
        addToast('success', 'Período reabierto correctamente')
        await loadData(activePeriodId)
        await loadPeriods()
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al reabrir período')
      }
    })
  }

  const handleDeleteStudent = async (studentId: number, studentName: string) => {
    setConfirmDeleteStudent(null)
    await action.execute(`delete-student-${studentId}`, async () => {
      try {
        await api.students.delete(studentId)
        addToast('success', `Estudiante "${studentName}" eliminado`)
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al eliminar estudiante')
      } finally {
        await loadData(activePeriodId || undefined)
      }
    })
  }

  const handleBulkDeleteStudents = async () => {
    setConfirmBulkDeleteStudents(false)
    await action.execute('bulk-delete-students', async () => {
      let deleted = 0
      for (const id of selectedStudentIds) {
        try {
          await api.students.delete(id)
          deleted++
        } catch (err) {
          addToast('error', `Error al eliminar estudiante #${id}`)
        }
      }
      setSelectedStudentIds(new Set())
      addToast('success', `${deleted} estudiante${deleted !== 1 ? 's' : ''} eliminado${deleted !== 1 ? 's' : ''}`)
      await loadData(activePeriodId || undefined)
    })
  }

  const handleDeleteAssignment = async (assignmentId: number) => {
    setConfirmDeleteAssignment(null)
    await action.execute(`delete-assignment-${assignmentId}`, async () => {
      try {
        await api.assignments.delete(assignmentId)
        addToast('success', 'Asignación eliminada')
        await loadData(activePeriodId || undefined)
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
        await loadData(activePeriodId || undefined)
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

  const assignedIds = new Set(assignments.filter(a => !a.released_at).map(a => a.student_id))
  const unassignedStudents = students.filter(s => s.is_active && !assignedIds.has(s.id))
  const assignedStudentIds = new Set(assignments.map(a => a.student_id))
  const studentsPerPeriod = Array.isArray(students) ? students.filter(s => assignedStudentIds.has(s.id)) : []

  const filteredAssignments = assignments.filter(a => {
    const studentExists = students.some(s => s.id === a.student_id)
    if (!studentExists) return false
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
        onBulkDelete={() => setConfirmBulkDelete(true)}
        onClearSelection={() => setSelectedIds(new Set())}
        onClosePeriod={() => setConfirmClosePeriod(true)}
        onActivatePeriod={() => setConfirmActivatePeriod(true)}
        onExportCsv={handleExportCsv}
        showStudentList={showStudentList}
        onToggleStudentList={() => setShowStudentList(!showStudentList)}
      />

      {showStudentList ? (
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              <i className="fas fa-user-graduate mr-2 text-slate-400"></i>
              Lista de Estudiantes
            </h3>
            <div className="flex items-center gap-3">
              {selectedStudentIds.size > 0 && (
                <>
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                    {selectedStudentIds.size} seleccionado(s)
                  </span>
                  <button onClick={() => setConfirmBulkDeleteStudents(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 transition-all">
                    <i className="fas fa-trash-can"></i>
                    Eliminar seleccionados
                  </button>
                  <button onClick={() => setSelectedStudentIds(new Set())}
                    className="text-xs text-slate-400 hover:text-slate-600 underline">
                    Limpiar
                  </button>
                </>
              )}
              <span className="text-xs text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">{students.length} estudiante{students.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3.5 w-10">
                    <input type="checkbox" checked={students.length > 0 && selectedStudentIds.size === students.length}
                      onChange={() => {
                        if (selectedStudentIds.size === students.length) setSelectedStudentIds(new Set())
                        else setSelectedStudentIds(new Set(students.map(s => s.id)))
                      }}
                      className="appearance-none w-4 h-4 border-2 border-slate-300 rounded cursor-pointer transition-all checked:bg-slate-900 checked:border-slate-900 checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] bg-contain bg-center bg-no-repeat" />
                  </th>
                  <th className="px-5 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Nombre</th>
                  <th className="px-5 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Email</th>
                  <th className="px-5 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-slate-400 text-sm">No hay estudiantes registrados</td>
                  </tr>
                ) : students.map(s => {
                  const isSelected = selectedStudentIds.has(s.id)
                  return (
                    <tr key={s.id} className={`hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-sky-50' : ''}`}>
                      <td className="px-5 py-3.5">
                        <input type="checkbox" checked={isSelected}
                          onChange={() => {
                            const next = new Set(selectedStudentIds)
                            if (next.has(s.id)) next.delete(s.id); else next.add(s.id)
                            setSelectedStudentIds(next)
                          }}
                          className="appearance-none w-4 h-4 border-2 border-slate-300 rounded cursor-pointer transition-all checked:bg-slate-900 checked:border-slate-900 checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] bg-contain bg-center bg-no-repeat" />
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-800">{s.full_name}</td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs">{s.email || <span className="text-slate-300 italic">—</span>}</td>
                      <td className="px-5 py-3.5 text-center">
                        <button onClick={() => setConfirmDeleteStudent({ id: s.id, name: s.full_name })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-all">
                          <i className="fas fa-trash-can"></i>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
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
          onDeleteStudent={(id, name) => setConfirmDeleteStudent({ id, name })}
          page={page + 1}
          totalPages={totalPages}
          totalItems={totalAssignments}
          onPageChange={(p) => goToPage(p - 1)}
        />
      )}

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

      <ConfirmModal
        open={confirmUndoImport}
        title="¿Revertir importación?"
        message={`Se eliminarán ${importResult?.created_ids?.length ?? 0} estudiantes recién importados y se liberarán sus asignaciones.`}
        danger confirmLabel="Revertir"
        loading={action.isLoading('undo-import')}
        loadingLabel="Revertiendo..."
        onConfirm={handleUndoImport}
        onCancel={() => setConfirmUndoImport(false)} />

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

      <ConfirmModal
        open={confirmBulkDeleteStudents}
        title="¿Eliminar estudiantes seleccionados?"
        message={`Se eliminarán permanentemente ${selectedStudentIds.size} estudiante${selectedStudentIds.size !== 1 ? 's' : ''} y todas sus asignaciones. Esto no se puede deshacer.`}
        danger confirmLabel="Eliminar todo"
        loading={action.isLoading('bulk-delete-students')}
        loadingLabel="Eliminando..."
        onConfirm={handleBulkDeleteStudents}
        onCancel={() => setConfirmBulkDeleteStudents(false)} />

      <ConfirmModal
        open={confirmDeleteStudent !== null}
        title="¿Eliminar estudiante?"
        message={`Se eliminará permanentemente a "${confirmDeleteStudent?.name}". Esto no se puede deshacer.`}
        danger confirmLabel="Eliminar"
        loading={confirmDeleteStudent !== null && action.isLoading(`delete-student-${confirmDeleteStudent.id}`)}
        loadingLabel="Eliminando..."
        onConfirm={() => confirmDeleteStudent && handleDeleteStudent(confirmDeleteStudent.id, confirmDeleteStudent.name)}
        onCancel={() => setConfirmDeleteStudent(null)} />
    </div>
  )
}
