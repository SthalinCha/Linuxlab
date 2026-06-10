import { useState, useEffect, useRef } from 'react'
import { api } from '../services/api'
import type { VirtualMachine, DashboardData } from '../types'
import TerminalModal from '../components/TerminalModal'
import ContentHeader from '../components/ContentHeader'

type VMStatus = 'running' | 'shutoff'

interface VMDisplay {
  id: number
  name: string
  status: VMStatus
  ip: string
  mac: string
  cpuAlloc: number
  ramAlloc: number
  diskAlloc: number
  cpuUsage: number
  ramUsage: number
}

interface Toast {
  id: number
  type: 'loading' | 'success' | 'error' | 'warning'
  message: string
}

function toVMStatus(raw: string): VMStatus {
  if (raw === 'running') return 'running'
  return 'shutoff'
}

function toVMDisplay(
  vm: VirtualMachine,
  cpuCount: number,
  ramTotalGb: number
): VMDisplay {
  const status = toVMStatus(vm.current_state)
  const cpuUsage = vm.cpu_usage_percent != null
    ? Math.min(100, Math.round(vm.cpu_usage_percent))
    : cpuCount > 0 ? Math.min(100, Math.round((vm.vcpus / cpuCount) * 100)) : 0
  const ramUsage = vm.ram_percent != null
    ? Math.min(100, Math.round(vm.ram_percent))
    : ramTotalGb > 0 ? Math.min(100, Math.round((vm.ram_mb / 1024 / ramTotalGb) * 100)) : 0
  return {
    id: vm.id,
    name: vm.name,
    status,
    ip: vm.ip_address || '',
    mac: vm.mac_address,
    cpuAlloc: vm.vcpus,
    ramAlloc: vm.ram_mb,
    diskAlloc: vm.disk_gb,
    cpuUsage: status === 'running' ? cpuUsage : 0,
    ramUsage: status === 'running' ? ramUsage : 0,
  }
}

let toastIdCounter = 0

export default function VMs() {
  const [allVms, setAllVms] = useState<VMDisplay[]>([])
  const [filteredVms, setFilteredVms] = useState<VMDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [toasts, setToasts] = useState<Toast[]>([])
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [confirmDestroy, setConfirmDestroy] = useState<number | null>(null)
  const [confirmRecreate, setConfirmRecreate] = useState<number | null>(null)
  const [confirmBulkAction, setConfirmBulkAction] = useState<{ ids: number[]; action: string; label: string } | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [terminalVm, setTerminalVm] = useState<{ id: number; name: string } | null>(null)
  const [confirmAddVm, setConfirmAddVm] = useState<number | null>(null)
  const [creatingVm, setCreatingVm] = useState(false)

  const [showLabModal, setShowLabModal] = useState(false)
  const [labTemplate, setLabTemplate] = useState('ubuntu-server-main')
  const [labCount, setLabCount] = useState(10)
  const [labStart, setLabStart] = useState(10)
  const [labPrefix, setLabPrefix] = useState('vhost')
  const [templates, setTemplates] = useState<VirtualMachine[]>([])
  const [creatingLab, setCreatingLab] = useState(false)

  const addToast = (type: Toast['type'], message: string): number => {
    const id = ++toastIdCounter
    setToasts(prev => [...prev, { id, type, message }])
    if (type !== 'loading') {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 4000)
    }
    return id
  }

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const loadVms = async () => {
    setLoading(true)
    try {
      const [data, dash] = await Promise.all([
        api.vms.list(statusFilter || undefined),
        api.dashboard.get().catch(() => null),
      ])
      setDashboardData(dash)
      const cpuCount = dash?.cpu_count ?? 0
      const ramGb = dash?.ram_total_gb ?? 0
      setAllVms(data.map(v => toVMDisplay(v, cpuCount, ramGb)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar VMs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadVms() }, [statusFilter])

  useEffect(() => {
    const q = filter.toLowerCase()
    const filtered = q
      ? allVms.filter(v =>
          v.name.toLowerCase().includes(q) ||
          v.ip.toLowerCase().includes(q) ||
          v.mac.toLowerCase().includes(q)
        )
      : allVms
    setFilteredVms(filtered)
  }, [allVms, filter])

  useEffect(() => {
    api.vms.listTemplates().then(setTemplates).catch(() => {})
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const doAction = async (id: number, action: string) => {
    const labels: Record<string, string> = { start: 'Encendiendo', shutdown: 'Apagando', reboot: 'Reiniciando', destroy: 'Forzando apagado' }
    const vm = allVms.find(v => v.id === id)
    const tid = addToast('loading', `${labels[action] || action} ${vm?.name || id}...`)
    try {
      const actions: Record<string, (id: number) => Promise<unknown>> = {
        start: api.vms.start, shutdown: api.vms.shutdown,
        reboot: api.vms.reboot, destroy: api.vms.destroy,
      }
      await actions[action](id)
      if (action === 'destroy') setConfirmDestroy(null)
      if (action !== 'destroy') setConfirmDelete(null)
      removeToast(tid)
      const successLabels: Record<string, string> = { start: 'se encendió', shutdown: 'se apagó', reboot: 'se reinició', destroy: 'se forzó apagado' }
      addToast('success', `${vm?.name || id} ${successLabels[action] || action} con éxito`)
      await loadVms()
    } catch (err) {
      removeToast(tid)
      addToast('error', `Error al ${action} ${vm?.name || id}`)
    }
  }

  const doBulkAction = async () => {
    if (!confirmBulkAction) return
    const tid = addToast('loading', `Ejecutando ${confirmBulkAction.label} en ${confirmBulkAction.ids.length} VM(s)...`)
    try {
      const data = await api.vms.bulkAction(confirmBulkAction.ids, confirmBulkAction.action)
      setConfirmBulkAction(null)
      removeToast(tid)
      const ok = data.filter(r => r.status === 'ok').length
      addToast('success', `${confirmBulkAction.label}: ${ok} VM(s) procesadas`)
      await loadVms()
    } catch (err) {
      removeToast(tid)
      addToast('error', 'Error en acción masiva')
    }
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    const tid = addToast('loading', `Eliminando ${ids.length} VM(s)...`)
    try {
      const data = await api.vms.bulkDelete(ids)
      setConfirmBulkDelete(false)
      setSelectedIds(new Set())
      removeToast(tid)
      const deleted = data.filter(r => r.status === 'deleted').length
      addToast('success', `${deleted} VM(s) eliminadas`)
      await loadVms()
    } catch (err) {
      removeToast(tid)
      addToast('error', 'Error al eliminar')
    }
  }

  const handleAddVmConfirm = () => {
    const nums = allVms
      .map(v => parseInt(v.name.split('-').pop() || '0', 10))
      .filter(n => !isNaN(n) && n > 0)
    const maxNum = nums.length > 0 ? Math.max(...nums) : 0
    setConfirmAddVm(maxNum + 1)
  }

  const doAddVm = async () => {
    if (confirmAddVm === null) return
    setCreatingVm(true)
    const tid = addToast('loading', `Creando vhost-${confirmAddVm}...`)
    try {
      await api.vms.clone({ number: confirmAddVm })
      setConfirmAddVm(null)
      removeToast(tid)
      addToast('success', `vhost-${confirmAddVm} creada`)
      await loadVms()
    } catch (err) {
      removeToast(tid)
      addToast('error', err instanceof Error ? err.message : 'Error al crear VM')
    } finally {
      setCreatingVm(false)
    }
  }

  const handleRecreate = async (id: number) => {
    const vm = allVms.find(v => v.id === id)
    const tid = addToast('loading', `Recreando ${vm?.name || id}...`)
    try {
      await api.vms.recreate(id)
      setConfirmRecreate(null)
      removeToast(tid)
      addToast('success', `${vm?.name || id} recreada`)
      await loadVms()
    } catch (err) {
      removeToast(tid)
      addToast('error', `Error al recrear ${vm?.name || id}`)
    }
  }

  const handleDelete = async (id: number) => {
    const vm = allVms.find(v => v.id === id)
    const tid = addToast('loading', `Eliminando ${vm?.name || id}...`)
    try {
      await api.vms.delete(id)
      setConfirmDelete(null)
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
      removeToast(tid)
      addToast('success', `${vm?.name || id} eliminada`)
      await loadVms()
    } catch (err) {
      removeToast(tid)
      addToast('error', `Error al eliminar ${vm?.name || id}`)
    }
  }

  const handleCreateLab = async () => {
    setCreatingLab(true)
    const tid = addToast('loading', `Creando laboratorio: ${labCount} VMs...`)
    try {
      const data = await api.vms.createLab({ count: labCount, start_number: labStart, prefix: labPrefix })
      const created = data.filter(r => r.status === 'created').length
      setShowLabModal(false)
      removeToast(tid)
      addToast('success', `Laboratorio creado: ${created} VM(s)`)

      const skipped = data.filter(r => r.status === 'skipped')
      if (skipped.length > 0) {
        addToast('warning', `${skipped.length} VM(s) omitidas (ya existen)`)
      }
      await loadVms()
    } catch (err) {
      removeToast(tid)
      addToast('error', 'Error al crear laboratorio')
    } finally {
      setCreatingLab(false)
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredVms.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredVms.map(v => v.id)))
  }

  const selectedList = Array.from(selectedIds)
  const runningCount = allVms.filter(v => v.status === 'running').length
  const stoppedCount = allVms.filter(v => v.status === 'shutoff').length
  const totalCpuAlloc = allVms.reduce((s, v) => s + v.cpuAlloc, 0)
  const totalRamGb = allVms.reduce((s, v) => s + v.ramAlloc, 0) / 1024

  const barColor = (pct: number) =>
    pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-emerald-500'

  return (
    <div className="bg-[#f8fafc] space-y-5">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[60] space-y-2 w-80">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-l-4 ${
              t.type === 'loading' ? 'border-l-blue-500' :
              t.type === 'success' ? 'border-l-emerald-500' :
              t.type === 'warning' ? 'border-l-yellow-500' :
              'border-l-red-500'
            }`}
          >
            {t.type === 'loading' ? (
              <i className="fas fa-spinner fa-spin text-blue-500 mt-0.5"></i>
            ) : t.type === 'success' ? (
              <i className="fas fa-check-circle text-emerald-500 mt-0.5"></i>
            ) : t.type === 'warning' ? (
              <i className="fas fa-exclamation-triangle text-yellow-500 mt-0.5"></i>
            ) : (
              <i className="fas fa-times-circle text-red-500 mt-0.5"></i>
            )}
            <span className="flex-1 text-sm text-slate-700">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="text-slate-400 hover:text-slate-600 leading-none text-lg">&times;</button>
          </div>
        ))}
      </div>

      {/* Header */}
      <ContentHeader title="Instancias" icon="fa-microchip" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-play mr-1"></i>Activas
            </span>
            <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><i className="fas fa-power-off text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-emerald-600">{runningCount}</div>
        </div>
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-stop mr-1"></i>Apagadas
            </span>
            <span className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500"><i className="fas fa-circle-stop text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-red-500">{stoppedCount}</div>
        </div>
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-microchip mr-1"></i>Overcommit CPU
            </span>
            <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><i className="fas fa-microchip text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-blue-600">{totalCpuAlloc} vCPU</div>
          <div className="text-xs text-slate-400 mt-0.5">Ratio {dashboardData?.cpu_count ? (totalCpuAlloc / dashboardData.cpu_count).toFixed(2) : '?'}x</div>
        </div>
        <div className="bg-white border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
              <i className="fas fa-memory mr-1"></i>RAM Comprometida
            </span>
            <span className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600"><i className="fas fa-memory text-sm"></i></span>
          </div>
          <div className="text-[1.75rem] font-bold tracking-tight text-purple-600">{totalRamGb > 1024 ? `${(totalRamGb / 1024).toFixed(1)} TB` : `${totalRamGb.toFixed(1)} GB`}</div>
          <div className="text-xs text-slate-400 mt-0.5">de {dashboardData?.ram_total_gb ?? '?'} GB</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input
                type="text"
                placeholder="Buscar por nombre, IP o MAC..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
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
                  onClick={() => setConfirmBulkAction({ ids: selectedList, action: 'start', label: 'Encender' })}
                  disabled={selectedList.length === 0}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <i className="fas fa-play mr-1"></i>Encender
                </button>
                <button
                  onClick={() => setConfirmBulkAction({ ids: selectedList, action: 'shutdown', label: 'Apagar' })}
                  disabled={selectedList.length === 0}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <i className="fas fa-stop mr-1"></i>Apagar
                </button>
                <button
                  onClick={() => {
                    if (selectedList.length === 1) {
                      setConfirmRecreate(selectedList[0])
                    } else {
                      addToast('error', 'Selecciona solo una VM para recrear')
                    }
                  }}
                  disabled={selectedList.length !== 1}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <i className="fas fa-code-branch mr-1"></i>Recrear
                </button>
                <button
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={selectedList.length === 0}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <i className="fas fa-trash-alt mr-1"></i>Eliminar
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-slate-400 hover:text-slate-600 underline ml-1"
                >
                  <i className="fas fa-times mr-1"></i>Limpiar
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAddVmConfirm}
              className="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
            >
              <i className="fas fa-plus mr-1"></i>Añadir Máquina
            </button>
            <button
              onClick={() => setShowLabModal(true)}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 shadow-sm"
            >
              <i className="fas fa-rocket mr-1.5"></i>Crear Laboratorio
            </button>
          </div>
        </div>
      </div>

      {/* Create Lab Modal */}
      {showLabModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 backdrop-blur-sm bg-black/40" onClick={() => !creatingLab && setShowLabModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <i className="fas fa-rocket text-emerald-600"></i>
              </div>
              <h2 className="text-lg font-semibold text-slate-800">Crear Laboratorio</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  <i className="fas fa-clone mr-1"></i>Plantilla
                </label>
                <select
                  value={labTemplate}
                  onChange={(e) => setLabTemplate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                >
                  <option value="ubuntu-server-main">ubuntu-server-main</option>
                  {templates.filter(t => t.is_template).map(t => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Número de Inicio</label>
                  <input
                    type="number"
                    min={10}
                    value={labStart}
                    onChange={(e) => setLabStart(Math.max(10, parseInt(e.target.value) || 10))}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad de Máquinas</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={labCount}
                    onChange={(e) => setLabCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                  />
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg px-4 py-3">
                <p className="text-sm text-slate-600">
                  <i className="fas fa-info-circle text-slate-400 mr-1.5"></i>
                  Se clonarán <strong>{labCount}</strong> instancias automáticamente: desde{' '}<strong>{labPrefix}-{labStart}</strong> hasta{' '}<strong>{labPrefix}-{labStart + labCount - 1}</strong>.
                </p>
              </div>

              {creatingLab && (
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3">
                  <i className="fas fa-spinner fa-spin text-slate-500"></i>
                  Creando laboratorio...
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowLabModal(false)}
                disabled={creatingLab}
                className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateLab}
                disabled={creatingLab}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-40"
              >
                {creatingLab ? 'Creando...' : 'Iniciar Clonación'}
              </button>
            </div>
          </div>
        </div>
      )}

      <VmModal
        open={confirmDelete !== null}
        title="Eliminar Instancia"
        message="Esta acción destruirá los discos virtuales de la VM y no se puede deshacer."
        confirmLabel="Sí, Eliminar"
        danger
        icon="fa-trash-alt"
        iconBg="bg-red-100"
        iconColor="text-red-600"
        onConfirm={() => confirmDelete !== null && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <VmModal
        open={confirmDestroy !== null}
        title="Forzar Apagado"
        message="Se forzará el apagado de la VM. Los datos en memoria no guardados se perderán."
        confirmLabel="Sí, Forzar Apagado"
        danger
        icon="fa-exclamation-triangle"
        iconBg="bg-red-100"
        iconColor="text-red-600"
        onConfirm={() => confirmDestroy !== null && doAction(confirmDestroy, 'destroy')}
        onCancel={() => setConfirmDestroy(null)}
      />

      <VmModal
        open={confirmRecreate !== null}
        title="Recrear VM"
        message="La VM se recreará desde la plantilla. Esto no puede deshacerse."
        confirmLabel="Recrear"
        danger
        icon="fa-code-branch"
        iconBg="bg-purple-100"
        iconColor="text-purple-600"
        onConfirm={() => confirmRecreate !== null && handleRecreate(confirmRecreate)}
        onCancel={() => setConfirmRecreate(null)}
      />

      <VmModal
        open={!!confirmBulkAction}
        title={`${confirmBulkAction ? confirmBulkAction.label.charAt(0).toUpperCase() + confirmBulkAction.label.slice(1) : ''} ${confirmBulkAction?.ids.length ?? 0} VM(s)?`}
        message={`Se va a ${confirmBulkAction?.label || 'ejecutar'} en ${confirmBulkAction?.ids.length ?? 0} VM(s).`}
        confirmLabel={confirmBulkAction?.label || 'Confirmar'}
        danger={confirmBulkAction?.action === 'destroy'}
        icon={confirmBulkAction?.action === 'destroy' ? 'fa-skull' : 'fa-info-circle'}
        onConfirm={doBulkAction}
        onCancel={() => setConfirmBulkAction(null)}
      />

      <VmModal
        open={confirmBulkDelete}
        title="Eliminar Instancias"
        message="Esta acción destruirá los discos virtuales de las VM(s) seleccionadas y no se puede deshacer."
        confirmLabel="Sí, Eliminar Todo"
        danger
        icon="fa-trash-alt"
        iconBg="bg-red-100"
        iconColor="text-red-600"
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      <VmModal
        open={confirmAddVm !== null}
        title="Añadir Máquina"
        message={confirmAddVm !== null ? `Se creará la VM vhost-${confirmAddVm} con los valores por defecto de la plantilla.` : ''}
        confirmLabel={creatingVm ? 'Creando...' : 'Crear'}
        disabled={creatingVm}
        icon="fa-plus"
        iconBg="bg-blue-100"
        iconColor="text-blue-600"
        onConfirm={doAddVm}
        onCancel={() => { if (!creatingVm) setConfirmAddVm(null) }}
      />

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 text-slate-500 py-16 bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <i className="fas fa-spinner fa-spin"></i>
          Cargando...
        </div>
      ) : error ? (
        <div className="flex items-center justify-center gap-2 text-red-500 py-16 bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <i className="fas fa-exclamation-triangle"></i>
          {error}
        </div>
      ) : filteredVms.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-slate-400 py-16 bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <i className="fas fa-microchip text-3xl"></i>
          <span>No hay máquinas virtuales</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={filteredVms.length > 0 && selectedIds.size === filteredVms.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300"
                    />
                  </th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">IP</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">MAC</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">CPU</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">RAM</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Disco</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Uso CPU</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Uso RAM</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVms.map(vm => {
                  const isRunning = vm.status === 'running'
                  return (
                    <tr
                      key={vm.id}
                      className={`hover:bg-slate-50 transition-colors ${selectedIds.has(vm.id) ? 'bg-sky-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(vm.id)}
                          onChange={() => toggleSelect(vm.id)}
                          className="rounded border-slate-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full inline-block ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`} />
                          <span className={`text-xs font-medium ${isRunning ? 'text-emerald-700' : 'text-red-600'}`}>
                            {isRunning ? 'Encendida' : 'Apagada'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{vm.name}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{vm.ip || '-'}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{vm.mac}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{vm.cpuAlloc} vCPU</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{vm.ramAlloc >= 1024 ? `${(vm.ramAlloc / 1024).toFixed(1)} GB` : `${vm.ramAlloc} MB`}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{vm.diskAlloc} GB</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 w-24">
                          <div className="flex-1 bg-slate-100 rounded-full h-2">
                            <div className={`h-2 rounded-full transition-all ${barColor(vm.cpuUsage)}`} style={{ width: `${isRunning ? vm.cpuUsage : 0}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-8 text-right">{isRunning ? vm.cpuUsage : 0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 w-24">
                          <div className="flex-1 bg-slate-100 rounded-full h-2">
                            <div className={`h-2 rounded-full transition-all ${barColor(vm.ramUsage)}`} style={{ width: `${isRunning ? vm.ramUsage : 0}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-8 text-right">{isRunning ? vm.ramUsage : 0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {isRunning ? (
                            <>
                              <IconButton
                                icon="fa-terminal"
                                tooltip="Terminal"
                                className="text-white bg-blue-600 hover:bg-blue-700"
                                onClick={() => setTerminalVm({ id: vm.id, name: vm.name })}
                              />
                              <IconButton
                                icon="fa-stop"
                                tooltip="Apagar"
                                className="text-white bg-amber-600 hover:bg-amber-700"
                                onClick={() => setConfirmDestroy(vm.id)}
                              />
                            </>
                          ) : (
                            <>
                              <IconButton
                                icon="fa-play"
                                tooltip="Encender"
                                className="text-white bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => doAction(vm.id, 'start')}
                              />
                            </>
                          )}
                          <IconButton
                            icon="fa-code-branch"
                            tooltip="Recrear"
                            className="text-white bg-purple-600 hover:bg-purple-700"
                            onClick={() => setConfirmRecreate(vm.id)}
                          />
                          {isRunning ? (
                            <IconButton
                              icon="fa-skull"
                              tooltip="Destruir"
                              className="text-white bg-red-600 hover:bg-red-700"
                              onClick={() => setConfirmDestroy(vm.id)}
                            />
                          ) : (
                            <IconButton
                              icon="fa-trash-alt"
                              tooltip="Eliminar"
                              className="text-white bg-red-600 hover:bg-red-700"
                              onClick={() => setConfirmDelete(vm.id)}
                            />
                          )}

                          {/* Three-dots menu */}
                          <div className="relative">
                            <button
                              onClick={() => setOpenMenu(openMenu === vm.id ? null : vm.id)}
                              className="px-1.5 py-1.5 text-sm text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                            >
                              <i className="fas fa-ellipsis-v"></i>
                            </button>
                            {openMenu === vm.id && (
                              <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 z-10 py-1" ref={menuRef}>
                                {isRunning && (
                                  <button
                                    onClick={() => { setOpenMenu(null); doAction(vm.id, 'reboot') }}
                                    className="block w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50"
                                  >
                                    <i className="fas fa-sync-alt mr-2"></i>Reiniciar
                                  </button>
                                )}
                                {isRunning && (
                                  <button
                                    onClick={() => { setOpenMenu(null); setConfirmDestroy(vm.id) }}
                                    className="block w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50"
                                  >
                                    <i className="fas fa-skull mr-2"></i>Forzar Apagado
                                  </button>
                                )}
                                <button
                                  onClick={() => { setOpenMenu(null); setConfirmRecreate(vm.id) }}
                                  className="block w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50"
                                >
                                  <i className="fas fa-code-branch mr-2"></i>Recrear desde plantilla
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TerminalModal
        open={terminalVm !== null}
        vmId={terminalVm?.id ?? 0}
        vmName={terminalVm?.name ?? ''}
        onClose={() => setTerminalVm(null)} />
    </div>
  )
}

/* ── Sub-components ── */

interface IconButtonProps {
  icon: string
  tooltip: string
  className?: string
  onClick: () => void
}

function IconButton({ icon, tooltip, className = '', onClick }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`px-2 py-1.5 text-xs font-medium rounded-lg ${className}`}
    >
      <i className={`fas ${icon}`}></i>
    </button>
  )
}

/* Shared icon modal — replaces DeleteModal, DestroyModal, ConfirmActionModal */
interface VmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  disabled?: boolean
  icon?: string
  iconBg?: string
  iconColor?: string
  onConfirm: () => void
  onCancel: () => void
}

function VmModal({
  open, title, message, confirmLabel = 'Confirmar',
  danger = false, disabled = false, icon = 'fa-info-circle',
  iconBg = 'bg-slate-100', iconColor = 'text-slate-600',
  onConfirm, onCancel,
}: VmModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 backdrop-blur-sm bg-black/40" onClick={disabled ? undefined : onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
        <div className="flex flex-col items-center text-center mb-4">
          <div className={`w-14 h-14 rounded-full ${iconBg} flex items-center justify-center mb-3`}>
            <i className={`fas ${icon} ${iconColor} text-xl`}></i>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-600 mt-2">{message}</p>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={disabled}
            className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={disabled}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
