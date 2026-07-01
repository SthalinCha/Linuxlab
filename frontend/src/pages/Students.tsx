import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useToast } from '../hooks/useToast'
import { useStudentsPage } from '../hooks/useStudentsPage'
import ConfirmModal from '../components/ConfirmModal'
import ContentHeader from '../components/ContentHeader'
import StudentFormModal from '../components/StudentFormModal'
import { TableSkeleton } from '../components/Skeleton'

const CHECKBOX_CLASS = "appearance-none w-4 h-4 border-2 border-slate-300 rounded cursor-pointer transition-all checked:bg-slate-900 checked:border-slate-900 checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] bg-contain bg-center bg-no-repeat"

export default function Students() {
  const navigate = useNavigate()
  const {
    students, allPeriods, currentPeriod,
    selectedPeriodId, loading, error,
    refetch: loadData, handleSelectPeriod,
  } = useStudentsPage()
  const { addToast } = useToast()
  const action = useAsyncAction()
  const [search, setSearch] = useState('')

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState<{ id: number; full_name: string; email: string } | null>(null)
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState<{ id: number; name: string } | null>(null)
  const [confirmBulkDeleteStudents, setConfirmBulkDeleteStudents] = useState(false)

  const [importResult, setImportResult] = useState<{ created: number; assigned: number; unassigned: number; errors: string[]; created_ids: number[] } | null>(null)
  const [csvImporting, setCsvImporting] = useState(false)
  const [confirmUndoImport, setConfirmUndoImport] = useState(false)
  const hiddenInputRef = useRef<HTMLInputElement>(null)

  const activePeriodCode = allPeriods.find(p => p.id === selectedPeriodId)?.code ?? currentPeriod?.code ?? '—'

  const filteredStudents = students.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
  })

  const handleCreateStudent = async (data: { full_name: string; email: string }) => {
    await action.execute('create-student', async () => {
      try {
        await api.students.create({ ...data, period_id: selectedPeriodId || undefined })
        setShowCreateModal(false)
        addToast('success', `Estudiante "${data.full_name}" creado correctamente`)
        await loadData(selectedPeriodId || undefined)
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al crear estudiante')
        throw err
      }
    })
  }

  const handleEditStudent = async (data: { full_name: string; email: string }) => {
    if (!editingStudent) return
    await action.execute(`edit-student-${editingStudent.id}`, async () => {
      try {
        await api.students.update(editingStudent.id, data)
        setEditingStudent(null)
        addToast('success', `Estudiante actualizado correctamente`)
        await loadData(selectedPeriodId || undefined)
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al actualizar estudiante')
        throw err
      }
    })
  }

  const handleDeleteStudent = async (studentId: number, studentName: string) => {
    setConfirmDeleteStudent(null)
    await action.execute(`delete-student-${studentId}`, async () => {
      try {
        await api.students.delete(studentId)
        addToast('success', `Estudiante "${studentName}" eliminado`)
        setSelectedIds(prev => { const next = new Set(prev); next.delete(studentId); return next })
        await loadData(selectedPeriodId || undefined)
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al eliminar estudiante')
      }
    })
  }

  const handleBulkDeleteStudents = async () => {
    setConfirmBulkDeleteStudents(false)
    await action.execute('bulk-delete-students', async () => {
      let deleted = 0
      for (const id of selectedIds) {
        try {
          await api.students.delete(id)
          deleted++
        } catch (err) {
          addToast('error', `Error al eliminar estudiante #${id}`)
        }
      }
      setSelectedIds(new Set())
      addToast('success', `${deleted} estudiante${deleted !== 1 ? 's' : ''} eliminado${deleted !== 1 ? 's' : ''}`)
      await loadData(selectedPeriodId || undefined)
    })
  }

  const handleImportCsv = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      addToast('error', 'Formato incorrecto — solo se aceptan archivos CSV')
      return
    }
    setCsvImporting(true)
    setImportResult(null)
    setSelectedIds(new Set())
    try {
      const result = await api.students.importCsv(file, selectedPeriodId || undefined)
      setImportResult(result)
      addToast('success', `${result.created} estudiante${result.created !== 1 ? 's' : ''} creado${result.created !== 1 ? 's' : ''}`)
      await loadData(selectedPeriodId || undefined)
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
          period_id: selectedPeriodId || undefined,
        })
        setConfirmUndoImport(false)
        setImportResult(null)
        addToast('success', `Importación revertida: ${result.deleted_students} estudiantes eliminados, ${result.deleted_assignments} asignaciones borradas`)
        await loadData(selectedPeriodId || undefined)
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Error al revertir importación')
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
        a.download = `estudiantes_${activePeriodCode.replace(/\s+/g, '_')}.csv`
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

  const toggleSelectStudent = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleSelectAllStudents = () => {
    const allActive = filteredStudents.filter(s => s.is_active).map(s => s.id)
    if (selectedIds.size === allActive.length && allActive.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allActive))
    }
  }

  const handleClearSelection = () => setSelectedIds(new Set())

  return (
    <div className="bg-[#f8fafc] space-y-5">
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-red-50 border-red-200 text-red-700">
          <i className="fas fa-circle-exclamation mt-0.5"></i>
          <span className="flex-1 text-sm">{error}</span>
        </div>
      )}

      <ContentHeader title="Gestión de Estudiantes" icon="fa-user-graduate" />

      {/* Empty state — no hay períodos */}
      {allPeriods.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <i className="fas fa-calendar-day text-4xl text-slate-300 mb-4"></i>
          <p className="text-base font-semibold text-slate-500">No hay períodos disponibles</p>
          <p className="text-sm text-slate-400 mt-1">Crea un período desde la página de Períodos para gestionar estudiantes.</p>
        </div>
      )}

      {/* Stats cards */}
      {allPeriods.length > 0 && (
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-user-graduate mr-1"></i>Total Estudiantes
            </span>
            <span className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600"><i className="fas fa-users text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-slate-900">{students.length}</div>
        </div>
      </div>
      )}

      {/* Toolbar */}
      <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-sm font-semibold">
              <i className="fas fa-calendar-day text-indigo-400"></i>
              <select
                value={selectedPeriodId || ''}
                onChange={(e) => handleSelectPeriod(Number(e.target.value))}
                className="bg-transparent text-sm font-semibold text-indigo-700 outline-none cursor-pointer min-w-[5rem]">
                <option value="" className="text-slate-500">Seleccionar período</option>
                {allPeriods.filter(p => /^P\d+$/.test(p.code)).map((p) => (
                  <option key={p.id} value={p.id} className="text-slate-800">
                    {p.code} {p.is_active ? '●' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-none">
              <i className="fas fa-plus-circle"></i>
              Nuevo Estudiante
            </button>

            <input type="file" accept=".csv" ref={hiddenInputRef}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportCsv(f); e.target.value = '' }}
              className="hidden" />
            <button type="button" onClick={() => hiddenInputRef.current?.click()}
              disabled={csvImporting}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${csvImporting ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'}`}>
              <i className={`fas ${csvImporting ? 'fa-spinner fa-spin' : 'fa-upload'}`}></i>
              {csvImporting ? 'Importando...' : 'Importar CSV'}
            </button>

            <button type="button" onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all">
              <i className="fas fa-download"></i>
              Exportar CSV
            </button>
          </div>

          {/* Dropzone CSV */}
          <div
            className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${csvImporting ? 'border-blue-300 bg-blue-50/50 cursor-wait' : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/30'}`}
            onClick={() => { if (!csvImporting) hiddenInputRef.current?.click() }}
            onDragOver={(e) => { if (!csvImporting) { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50'); }}}
            onDragLeave={(e) => { e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50'); }}
            onDrop={(e) => {
              e.preventDefault();
              if (csvImporting) return;
              e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
              const file = e.dataTransfer.files[0];
              if (file) handleImportCsv(file);
            }}>
            <div className="flex flex-col items-center gap-1.5">
              {csvImporting ? (
                <>
                  <i className="fas fa-spinner fa-spin text-2xl text-blue-500"></i>
                  <span className="text-sm text-blue-600 font-medium">Importando estudiantes...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-cloud-arrow-up text-2xl text-slate-300"></i>
                  <span className="text-sm text-slate-500 font-medium">Arrastra un archivo CSV aquí o haz clic para seleccionar</span>
                  <span className="text-xs text-slate-400">Formato: nombre completo, correo electrónico</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none"></i>
              <input type="text" placeholder="Buscar por nombre o email..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm w-full focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition-all" />
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <>
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                    <i className="fas fa-check mr-1"></i>{selectedIds.size} seleccionado(s)
                  </span>
                  <button onClick={() => setConfirmBulkDeleteStudents(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 transition-all">
                    <i className="fas fa-trash-can"></i>
                    Eliminar
                  </button>
                  <button onClick={handleClearSelection}
                    className="text-xs text-slate-400 hover:text-slate-600 underline">
                    Limpiar
                  </button>
                </>
              )}
            </div>
        </div>
      </div>

      {/* Import results — arriba, entre toolbar y tabla */}
      {importResult && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm border ${
          importResult.errors?.length > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          <i className={`mt-0.5 fas ${importResult.errors?.length > 0 ? 'fa-circle-exclamation text-red-500' : 'fa-circle-check text-blue-500'}`}></i>
          <div className="flex-1">
            {importResult.created > 0 ? (
              <><strong>{importResult.created}</strong> estudiantes creados</>
            ) : (
              <>No hay estudiantes nuevos en el archivo</>
            )}
            {importResult.errors?.length > 0 && (
              <span className="ml-1 text-amber-600">
                ({importResult.errors.length} omitido{importResult.errors.length > 1 ? 's' : ''})
              </span>
            )}
            {importResult.errors?.length > 0 && importResult.created === 0 && (
              <div className="mt-1 text-xs text-slate-500">
                Todos los emails ya estaban en el CSV o faltaban datos
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {importResult.created_ids?.length > 0 && (
              <>
                <button onClick={() => navigate('/assignments')}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 underline">
                  <i className="fas fa-arrow-right mr-1"></i>Ir a Asignaciones
                </button>
                <button onClick={() => setConfirmUndoImport(true)}
                  className="text-xs font-medium text-red-600 hover:text-red-800 underline">
                  <i className="fas fa-undo mr-1"></i>Deshacer
                </button>
              </>
            )}
            <button onClick={() => setImportResult(null)} className="font-bold leading-none">&times;</button>
          </div>
        </div>
      )}

      {/* Student table */}
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <i className="fas fa-table-list text-slate-400"></i>
              <h2 className="text-sm font-semibold text-slate-700">Estudiantes Registrados</h2>
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-[0.7rem] font-bold bg-indigo-100 text-indigo-700">
                {filteredStudents.length}
              </span>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <i className="fas fa-users-slash text-3xl text-slate-300 mb-3"></i>
              <p className="text-sm font-medium text-slate-500">{search ? 'Sin resultados de búsqueda' : 'No hay estudiantes registrados en este período'}</p>
              <p className="text-xs text-slate-400 mt-1">Importa estudiantes mediante CSV o créalos manualmente</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="px-4 py-3.5 w-10">
                      <input type="checkbox"
                        checked={filteredStudents.length > 0 && selectedIds.size === filteredStudents.filter(s => s.is_active).length}
                        onChange={handleSelectAllStudents}
                        className={CHECKBOX_CLASS} />
                    </th>
                    <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Nombre</th>
                    <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Correo</th>
                    <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left">Estado</th>
                    <th className="px-4 py-3.5 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500 text-left w-24">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <input type="checkbox" checked={selectedIds.has(s.id)}
                          onChange={() => toggleSelectStudent(s.id)}
                          className={CHECKBOX_CLASS} />
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-800">{s.full_name}</td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs">{s.email || <span className="text-slate-300 italic">sin correo</span>}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          s.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                          {s.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditingStudent({ id: s.id, full_name: s.full_name, email: s.email })}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all"
                            title="Editar estudiante">
                            <i className="fas fa-pen-to-square text-sm"></i>
                          </button>
                          <button onClick={() => setConfirmDeleteStudent({ id: s.id, name: s.full_name })}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                            title="Eliminar estudiante">
                            <i className="fas fa-trash-can text-sm"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      <StudentFormModal
        open={showCreateModal}
        onSave={handleCreateStudent}
        onCancel={() => setShowCreateModal(false)}
        saving={action.isLoading('create-student')}
      />

      <StudentFormModal
        open={editingStudent !== null}
        student={editingStudent}
        onSave={handleEditStudent}
        onCancel={() => setEditingStudent(null)}
        saving={editingStudent !== null && action.isLoading(`edit-student-${editingStudent.id}`)}
      />

      <ConfirmModal
        open={confirmDeleteStudent !== null}
        title="¿Eliminar estudiante?"
        message={`Se eliminará permanentemente a "${confirmDeleteStudent?.name}" y todas sus asignaciones. Esto no se puede deshacer.`}
        danger confirmLabel="Eliminar"
        loading={confirmDeleteStudent !== null && action.isLoading(`delete-student-${confirmDeleteStudent.id}`)}
        loadingLabel="Eliminando..."
        onConfirm={() => confirmDeleteStudent && handleDeleteStudent(confirmDeleteStudent.id, confirmDeleteStudent.name)}
        onCancel={() => setConfirmDeleteStudent(null)} />

      <ConfirmModal
        open={confirmBulkDeleteStudents}
        title="¿Eliminar estudiantes seleccionados?"
        message={`Se eliminarán permanentemente ${selectedIds.size} estudiante${selectedIds.size !== 1 ? 's' : ''} y todas sus asignaciones. Esto no se puede deshacer.`}
        danger confirmLabel="Eliminar todo"
        loading={action.isLoading('bulk-delete-students')}
        loadingLabel="Eliminando..."
        onConfirm={handleBulkDeleteStudents}
        onCancel={() => setConfirmBulkDeleteStudents(false)} />

      <ConfirmModal
        open={confirmUndoImport}
        title="¿Revertir importación?"
        message={`Se eliminarán ${importResult?.created_ids?.length ?? 0} estudiantes recién importados y se liberarán sus asignaciones.`}
        danger confirmLabel="Revertir"
        loading={action.isLoading('undo-import')}
        loadingLabel="Revertiendo..."
        onConfirm={handleUndoImport}
        onCancel={() => setConfirmUndoImport(false)} />
    </div>
  )
}
