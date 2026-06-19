import { useState, useMemo } from 'react'
import type { VirtualMachine } from '../types'

interface Props {
  allVms: VirtualMachine[]
  selectedIds: Set<number>
  onSelectionChange: (ids: Set<number>) => void
}

export default function VmSelector({ allVms, selectedIds, onSelectionChange }: Props) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const PAGE_SIZE = 12

  const filtered = useMemo(() => {
    if (!search.trim()) return allVms
    const q = search.toLowerCase()
    return allVms.filter(vm =>
      vm.name.toLowerCase().includes(q) ||
      (vm.ip_address || '').toLowerCase().includes(q)
    )
  }, [allVms, search])

  const runningCount = filtered.filter(v => v.current_state === 'running').length
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageVms = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const allFilteredSelected = filtered.every(vm => selectedIds.has(vm.id))
  const someFilteredSelected = filtered.some(vm => selectedIds.has(vm.id))

  const toggleVm = (id: number) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const next = new Set(selectedIds)
      filtered.forEach(vm => next.delete(vm.id))
      onSelectionChange(next)
    } else {
      const next = new Set(selectedIds)
      filtered.forEach(vm => next.add(vm.id))
      onSelectionChange(next)
    }
  }

  const pageRange = (p: number) => {
    const start = p * PAGE_SIZE + 1
    const end = Math.min((p + 1) * PAGE_SIZE, filtered.length)
    return `${start}–${end}`
  }

  return (
    <div className="space-y-4">
      {/* Search + range toggle + select all */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Buscar VM por nombre o IP..."
            autoFocus
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500
              transition-all duration-150"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setPage(0) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <i className="fas fa-times" />
            </button>
          )}
        </div>
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          <span className="font-semibold text-indigo-600">{filtered.length}</span> VM(s) encontradas
          · <span className="font-semibold text-emerald-600">{runningCount}</span> activas
        </span>
        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filtered.length > 0 && allFilteredSelected}
            ref={el => { if (el) el.indeterminate = !allFilteredSelected && someFilteredSelected }}
            onChange={toggleSelectAll}
            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
          />
          Seleccionar todas
        </label>
      </div>

      {/* VM grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto">
        {pageVms.map(vm => {
          const isSelected = selectedIds.has(vm.id)
          const isRunning = vm.current_state === 'running'
          const portCount = vm.ports?.length || 0

          return (
            <button
              key={vm.id}
              type="button"
              onClick={() => toggleVm(vm.id)}
              className={`
                relative flex flex-col gap-1.5 p-3.5 rounded-xl border-2 text-left
                transition-all duration-150
                ${isSelected
                  ? 'border-indigo-500 bg-indigo-50/60 shadow-sm shadow-indigo-100'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                }
                ${!isRunning ? 'opacity-60' : ''}
              `}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center">
                  <i className="fas fa-check text-[10px] text-white" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
                  {vm.name}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  isRunning
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                  {isRunning ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <code className="text-xs font-mono text-slate-400">{vm.ip_address || '—'}</code>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <i className="fas fa-plug text-[10px]" />
                <span>{portCount} puerto{portCount !== 1 ? 's' : ''}</span>
              </div>
            </button>
          )
        })}
        {pageVms.length === 0 && (
          <div className="col-span-full py-8 text-center text-sm text-slate-400">
            <i className="fas fa-inbox text-2xl mb-2 block" />
            {search ? 'Sin resultados de búsqueda' : 'No hay VMs disponibles'}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className="fas fa-chevron-left" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              className={`
                px-2.5 py-1.5 rounded-lg font-medium
                ${i === safePage
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'hover:bg-slate-50'
                }
              `}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={safePage === totalPages - 1}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className="fas fa-chevron-right" />
          </button>
          <span className="ml-1 text-slate-400">{pageRange(safePage)} de {filtered.length}</span>
        </div>
      )}
    </div>
  )
}
