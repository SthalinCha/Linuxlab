import { useState, useRef } from 'react'
import type { FormEvent } from 'react'
import type { VirtualMachine, Student, Period } from '../types'

interface Props {
  allPeriods: Period[]
  selectedPeriodId: number
  onPeriodChange: (periodId: number) => void
  showForm: boolean
  onToggleForm: () => void
  showHistory: boolean
  onToggleHistory: () => void
  formData: { vm_id: number; student_id: number }
  onFormDataChange: (data: { vm_id: number; student_id: number }) => void
  availableVms: VirtualMachine[]
  availableStudents: Student[]
  search: string
  onSearchChange: (value: string) => void
  filter: string
  onFilterChange: (value: string) => void
  selectedIds: Set<number>
  importResult: { created: number; errors: string[] } | null
  onImportResultDismiss: () => void
  capacityWarning: string | null
  onCapacityWarningDismiss: () => void
  csvImporting: boolean
  autoAssignResults: { preview?: boolean; created?: number; assignments: Array<{ student: string; vm: string; student_id?: number; vm_id?: number }>; unassigned_students: number } | null
  onAutoAssignResultsDismiss: () => void
  onBatchAssign: (selected: Array<{ vm_id: number; student_id: number }>) => void
  onCreate: (e: FormEvent) => Promise<void>
  onImportCsv: (file: File) => void
  onAutoAssign: () => void
  onBulkRelease: () => void
  onClearSelection: () => void
  onClosePeriod: () => void
}

export default function AssignmentToolbar({
  allPeriods, selectedPeriodId, onPeriodChange,
  showForm, onToggleForm, showHistory, onToggleHistory,
  formData, onFormDataChange, availableVms, availableStudents,
  search, onSearchChange, filter, onFilterChange,
  selectedIds,
  importResult, onImportResultDismiss,
  capacityWarning, onCapacityWarningDismiss,
  csvImporting,
  autoAssignResults, onAutoAssignResultsDismiss, onBatchAssign,
  onCreate, onImportCsv, onAutoAssign, onBulkRelease, onClearSelection, onClosePeriod,
}: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const hiddenInputRef = useRef<HTMLInputElement>(null)
  const activePeriodCode = allPeriods.find(p => p.id === selectedPeriodId)?.code ?? '—'
  const periodOptions = allPeriods.filter(p => /^P\d+$/.test(p.code))
  const [checkedRows, setCheckedRows] = useState<Set<number>>(new Set())
  const allChecked = !!(autoAssignResults && autoAssignResults.assignments.length > 0 && checkedRows.size === autoAssignResults.assignments.length)

  const handleCheckRow = (idx: number) => {
    setCheckedRows(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  const handleCheckAll = () => {
    if (!autoAssignResults) return
    if (allChecked) setCheckedRows(new Set())
    else setCheckedRows(new Set(autoAssignResults.assignments.map((_, i) => i)))
  }

  const handleAssignSelected = () => {
    if (!autoAssignResults) return
    const selected = autoAssignResults.assignments
      .filter((_, i) => checkedRows.has(i))
      .filter(a => a.vm_id && a.student_id)
      .map(a => ({ vm_id: a.vm_id!, student_id: a.student_id! }))
    if (selected.length > 0) onBatchAssign(selected)
  }

  const handleDismissResults = () => {
    setCheckedRows(new Set())
    onAutoAssignResultsDismiss()
  }

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file)
    if (file) onImportCsv(file)
  }

  return (
    <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5 space-y-4">
      {/* Row 1: Period Selector + Primary Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-sm font-semibold">
          <i className="fas fa-calendar-day text-indigo-400"></i>
          <select value={selectedPeriodId} onChange={(e) => onPeriodChange(Number(e.target.value))}
            className="bg-transparent text-sm font-semibold text-indigo-700 outline-none cursor-pointer">
            {periodOptions.map((p) => (
              <option key={p.id} value={p.id} className="text-slate-800">
                {p.code} {p.is_active ? '●' : ''}
              </option>
            ))}
          </select>
        </div>

        <button onClick={onToggleForm}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-none">
          <i className="fas fa-plus-circle"></i>
          {showForm ? 'Cancelar' : 'Nueva Asignación'}
        </button>

        <button onClick={onClosePeriod}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-all">
          <i className="fas fa-lock"></i>
          Cerrar Período
        </button>

        <div className="flex-1"></div>

        <button onClick={onToggleHistory}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
            showHistory ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }`}>
          <i className={`fas ${showHistory ? 'fa-arrow-left' : 'fa-clock-rotate-left'}`}></i>
          {showHistory ? 'Asignaciones Actuales' : 'Ver Historial'}
        </button>

        <div className="flex gap-2 items-center">
          <input type="file" accept=".csv" ref={hiddenInputRef}
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            className="hidden" />
          <button type="button" onClick={() => hiddenInputRef.current?.click()}
            disabled={csvImporting}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${csvImporting ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'}`}>
            <i className={`fas ${csvImporting ? 'fa-spinner fa-spin' : 'fa-upload'}`}></i>
            {csvImporting ? 'Importando...' : 'Importar CSV'}
          </button>
          {selectedFile && (
            <span className="text-xs text-slate-500 truncate max-w-[120px]">{selectedFile.name}</span>
          )}
        </div>

        <button onClick={onAutoAssign}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 transition-all hover:-translate-y-0.5 active:translate-y-0">
          <i className="fas fa-bolt"></i>
          Asignación Automática
        </button>
      </div>

      {/* Dropzone area */}
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
          if (file) handleFileChange(file);
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
              <span className="text-xs text-slate-400">Formato: <code>full_name, email</code></span>
            </>
          )}
        </div>
      </div>

      {/* Search + Filter + Bulk */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none"></i>
            <input type="text" placeholder="Buscar por nombre, email, código o VM..."
              value={search} onChange={(e) => onSearchChange(e.target.value)}
              className="border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm w-full focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition-all" />
          </div>
          <select value={filter} onChange={(e) => onFilterChange(e.target.value)}
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
              <button onClick={onBulkRelease}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-all">
                <i className="fas fa-link-slash"></i>
                Desvincular
              </button>
              <button onClick={onClearSelection}
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
              {importResult.errors?.length > 0 && (
                <ul className="mt-1 text-xs space-y-0.5">
                  {importResult.errors.slice(0, 5).map((e, i) => <li key={i}><i className="fas fa-triangle-exclamation mr-1"></i>{e}</li>)}
                  {importResult.errors.length > 5 && <li className="text-slate-400">...y {importResult.errors.length - 5} más</li>}
                </ul>
              )}
            </div>
            <button onClick={onImportResultDismiss} className="font-bold leading-none">&times;</button>
          </div>
        </div>
      )}

      {/* Capacity warning */}
      {capacityWarning && (
        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <i className="fas fa-triangle-exclamation text-red-500 mt-0.5"></i>
            <div className="flex-1">{capacityWarning}</div>
            <button onClick={onCapacityWarningDismiss} className="font-bold leading-none">&times;</button>
          </div>
        </div>
      )}

      {/* Auto-assign results */}
      {autoAssignResults && (
        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <i className="fas fa-bolt text-emerald-500"></i>
              {autoAssignResults.preview ? 'Vista previa de asignación' : `${autoAssignResults.created} asignaciones creadas`}
              {autoAssignResults.unassigned_students > 0 && (
                <span className="text-xs font-normal text-amber-600">({autoAssignResults.unassigned_students} estudiantes sin VM)</span>
              )}
            </div>
            <button onClick={handleDismissResults} className="text-sm text-slate-400 hover:text-slate-600">&times;</button>
          </div>
          {autoAssignResults.assignments.length > 0 && (
            <div className="flex items-center justify-between mb-2 gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                <input type="checkbox" checked={allChecked} onChange={handleCheckAll}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                Seleccionar todos
              </label>
              <div className="flex items-center gap-2">
                {autoAssignResults.preview && checkedRows.size > 0 && (
                  <button onClick={handleAssignSelected}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-all">
                    <i className="fas fa-check"></i>
                    Asignar seleccionados ({checkedRows.size})
                  </button>
                )}
                <button onClick={onAutoAssign}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all">
                  <i className="fas fa-bolt"></i>
                  Asignar todos
                </button>
              </div>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-medium">
                  <th className="px-3 py-2 text-left w-8"></th>
                  <th className="px-3 py-2 text-left">Estudiante</th>
                  <th className="px-3 py-2 text-left">VM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {autoAssignResults.assignments.map((a, i) => (
                  <tr key={i} className={`hover:bg-slate-50 transition-colors ${checkedRows.has(i) ? 'bg-emerald-50/50' : ''}`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={checkedRows.has(i)} onChange={() => handleCheckRow(i)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-700">{a.student}</td>
                    <td className="px-3 py-2 font-mono text-emerald-600">{a.vm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inline form */}
      {showForm && (
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center text-white text-xs font-bold">+</div>
            <h3 className="text-sm font-semibold text-slate-800">
              Nueva Asignación <span className="text-xs text-slate-400 font-normal">— {activePeriodCode}</span>
            </h3>
          </div>
          <form onSubmit={onCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5"><i className="fas fa-server mr-1"></i>Máquina Virtual</label>
              <select value={formData.vm_id}
                onChange={(e) => onFormDataChange({ ...formData, vm_id: Number(e.target.value) })}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10" required>
                <option value={0}>Seleccionar VM</option>
                {availableVms.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} — {v.ip_address || 'sin IP'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5"><i className="fas fa-user mr-1"></i>Estudiante</label>
              <select value={formData.student_id}
                onChange={(e) => onFormDataChange({ ...formData, student_id: Number(e.target.value) })}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10" required>
                <option value={0}>Seleccionar Estudiante</option>
                {availableStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2.5">
              <button type="button" onClick={onToggleForm}
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
  )
}
