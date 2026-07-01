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
  search: string
  onSearchChange: (value: string) => void
  filter: string
  onFilterChange: (value: string) => void
  selectedIds: Set<number>
  onCreate: (e: FormEvent) => Promise<void>
  onBulkDelete: () => void
  onClearSelection: () => void
  onClosePeriod: () => void
  onActivatePeriod: () => void
  onExportCsv: () => void
  onAutoAssign: () => void
}

export default function AssignmentToolbar({
  allPeriods, selectedPeriodId, onPeriodChange,
  showForm, onToggleForm,
  formData, onFormDataChange, availableVms, availableStudents,
  search, onSearchChange, filter, onFilterChange,
  selectedIds,
  onCreate, onBulkDelete, onClearSelection, onClosePeriod, onActivatePeriod, onExportCsv, onAutoAssign,
}: Props) {
  const selectedPeriod = allPeriods.find(p => p.id === selectedPeriodId)
  const activePeriodCode = selectedPeriod?.code ?? '—'
  const periodOptions = allPeriods.filter(p => /^P\d+$/.test(p.code))

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

        <button onClick={onAutoAssign}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-all">
          <i className="fas fa-magic"></i>
          Asignación Automática
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

        <button type="button" onClick={onExportCsv}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all">
          <i className="fas fa-download"></i>
          Exportar CSV
        </button>
      </div>

      {/* Search + Filter + Bulk */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none"></i>
            <input type="text" placeholder="Buscar por nombre, email o VM..."
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
