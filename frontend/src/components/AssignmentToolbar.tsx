import { useState, useRef } from 'react'
import type { FormEvent } from 'react'
import type { VirtualMachine, Student, Period } from '../types'

interface Props {
  allPeriods: Period[]
  selectedPeriodId: number
  onPeriodChange: (periodId: number) => void
  showForm: boolean
  onToggleForm: () => void
  formData: { vm_id: number; student_id: number }
  onFormDataChange: (data: { vm_id: number; student_id: number }) => void
  availableVms: VirtualMachine[]
  availableStudents: Student[]
  allStudents: Student[]
  onDeleteStudent?: (id: number, name: string) => void
  search: string
  onSearchChange: (value: string) => void
  filter: string
  onFilterChange: (value: string) => void
  selectedIds: Set<number>
  importResult: { created: number; assigned: number; unassigned: number; errors: string[]; created_ids: number[] } | null
  onImportResultDismiss: () => void
  onUndoImport?: () => void
  capacityWarning: string | null
  onCapacityWarningDismiss: () => void
  csvImporting: boolean
  onCreate: (e: FormEvent) => Promise<void>
  onImportCsv: (file: File) => void
  onBulkDelete: () => void
  onClearSelection: () => void
  onClosePeriod: () => void
  onActivatePeriod: () => void
  onExportCsv: () => void
  showStudentList: boolean
  onToggleStudentList: () => void
}

export default function AssignmentToolbar({
  allPeriods, selectedPeriodId, onPeriodChange,
  showForm, onToggleForm,
  formData, onFormDataChange, availableVms, availableStudents,
  allStudents, onDeleteStudent,
  search, onSearchChange, filter, onFilterChange,
  selectedIds,
  importResult, onImportResultDismiss, onUndoImport,
  capacityWarning, onCapacityWarningDismiss,
  csvImporting,
  onCreate, onImportCsv, onBulkDelete, onClearSelection, onClosePeriod, onActivatePeriod, onExportCsv,
  showStudentList, onToggleStudentList,
}: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const hiddenInputRef = useRef<HTMLInputElement>(null)
  const selectedPeriod = allPeriods.find(p => p.id === selectedPeriodId)
  const activePeriodCode = selectedPeriod?.code ?? '—'
  const periodOptions = allPeriods.filter(p => /^P\d+$/.test(p.code))
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

        {selectedPeriod?.closed_at ? (
          <button onClick={onActivatePeriod}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-all">
            <i className="fas fa-lock-open"></i>
            Reabrir Período
          </button>
        ) : (
          <button onClick={onClosePeriod}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 transition-all">
            <i className="fas fa-lock"></i>
            Finalizar Período
          </button>
        )}

        <div className="flex-1"></div>

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

        <button type="button" onClick={onExportCsv}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all">
          <i className="fas fa-download"></i>
          Exportar CSV
        </button>

        <button type="button" onClick={onToggleStudentList}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            showStudentList
              ? 'text-white bg-zinc-900 hover:bg-zinc-800'
              : 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }`}>
          <i className="fas fa-user-graduate"></i>
          {showStudentList ? 'Ver Asignaciones' : 'Listar Estudiantes'}
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
              <button onClick={onBulkDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 transition-all">
                <i className="fas fa-trash-can"></i>
                Eliminar
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
          <div className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm ${
            importResult.created === 0 && importResult.errors?.length > 0
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-blue-50 border border-blue-200 text-blue-700'
          }`}>
            <i className={`mt-0.5 fas ${importResult.created === 0 && importResult.errors?.length > 0 ? 'fa-circle-exclamation text-red-500' : 'fa-circle-check text-blue-500'}`}></i>
            <div className="flex-1">
              <strong>{importResult.created}</strong> creados, <strong>{importResult.assigned}</strong> asignados
              {importResult.unassigned > 0 && (
                <span className="ml-1 text-amber-600">({importResult.unassigned} sin VM)</span>
              )}
              {importResult.errors?.length > 0 && (
                <div className="mt-1 text-xs">
                  {importResult.errors.slice(0, 1).map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {importResult.created_ids?.length > 0 && onUndoImport && (
                <button onClick={onUndoImport}
                  className="text-xs font-medium text-red-600 hover:text-red-800 underline">
                  <i className="fas fa-undo mr-1"></i>Deshacer
                </button>
              )}
              <button onClick={onImportResultDismiss} className="font-bold leading-none">&times;</button>
            </div>
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
          {onDeleteStudent && allStudents.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                <i className="fas fa-user-graduate mr-1"></i>Todos los estudiantes ({allStudents.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {allStudents.map(s => (
                  <div key={s.id} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                    <span className="max-w-[120px] truncate">{s.full_name}</span>
                    <button onClick={() => onDeleteStudent(s.id, s.full_name)}
                      className="text-slate-400 hover:text-red-500 transition-colors ml-0.5"
                      title="Eliminar estudiante">
                      <i className="fas fa-xmark"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
