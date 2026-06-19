interface Props {
  filter: string
  onFilterChange: (value: string) => void
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  selectedIds: Set<number>
  selectedList: number[]
  onBulkAction: (ids: number[], action: string, label: string) => void
  onBulkRecreate: (ids: number[]) => void
  onBulkDelete: () => void
  onClearSelection: () => void
  onAddVm: () => void
  onCreateLab: () => void
}

export default function VMToolbar({
  filter, onFilterChange, statusFilter, onStatusFilterChange,
  selectedIds, selectedList,
  onBulkAction, onBulkRecreate, onBulkDelete, onClearSelection,
  onAddVm, onCreateLab,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input
              type="text"
              placeholder="Buscar por nombre, IP o MAC..."
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              className="border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <option value="">Todas</option>
            <option value="running">Activas</option>
            <option value="shut off">Apagadas</option>
            <option value="paused">Suspendidas</option>
          </select>

          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full ml-1">
                {selectedIds.size} seleccionada(s)
              </span>
              <div className="h-5 w-px bg-slate-200 mx-1" />
              <button
                onClick={() => onBulkAction(selectedList, 'start', 'Encender')}
                disabled={selectedList.length === 0}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <i className="fas fa-play mr-1"></i>Encender
              </button>
              <button
                onClick={() => onBulkAction(selectedList, 'shutdown', 'Apagar')}
                disabled={selectedList.length === 0}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <i className="fas fa-stop mr-1"></i>Apagar
              </button>
              <button
                onClick={() => onBulkRecreate(selectedList)}
                disabled={selectedList.length === 0}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <i className="fas fa-code-branch mr-1"></i>Recrear
              </button>
              <button
                onClick={onBulkDelete}
                disabled={selectedList.length === 0}
                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <i className="fas fa-trash-alt mr-1"></i>Eliminar
              </button>
              <button
                onClick={onClearSelection}
                className="text-xs text-slate-400 hover:text-slate-600 underline ml-1"
              >
                <i className="fas fa-times mr-1"></i>Limpiar
              </button>
            </>
          )}
        </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onAddVm}
              className="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
            >
              <i className="fas fa-plus mr-1"></i>Añadir Máquina
            </button>
            <button
              onClick={onCreateLab}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 shadow-sm"
            >
              <i className="fas fa-rocket mr-1.5"></i>Crear Laboratorio
            </button>
          </div>
      </div>
    </div>
  )
}
