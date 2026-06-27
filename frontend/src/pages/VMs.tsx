import { useState, useEffect, useMemo } from 'react'
import { api } from '../services/api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { useVMs } from '../hooks/useVMs'
import TerminalModal from '../components/TerminalModal'
import ContentHeader from '../components/ContentHeader'
import VMStats from '../components/VMStats'
import VMToolbar from '../components/VMToolbar'
import VMTable from '../components/VMTable'
import VMModals from '../components/VMModals'
import type { VMTemplateInfo } from '../types'

export default function VMs() {
  const { addToast, removeToast } = useToast()
  const { isAdmin } = useAuth()
  const action = useAsyncAction()
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [openMenu, setOpenMenu] = useState<number | null>(null)

  const { allVms, dashboardData, loading, error, refetch: loadVms } = useVMs(statusFilter)

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [confirmDestroy, setConfirmDestroy] = useState<number | null>(null)
  const [confirmRecreate, setConfirmRecreate] = useState<number | null>(null)
  const [confirmBulkAction, setConfirmBulkAction] = useState<{ ids: number[]; action: string; label: string } | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [confirmBulkRecreate, setConfirmBulkRecreate] = useState<number[] | null>(null)
  const [terminalVm, setTerminalVm] = useState<{ id: number; name: string } | null>(null)
  const [confirmAddVm, setConfirmAddVm] = useState<number | null>(null)

  const [templateOptions, setTemplateOptions] = useState<VMTemplateInfo[]>([])
  const [showLabModal, setShowLabModal] = useState(false)
  const [labTemplate, setLabTemplate] = useState('ubuntu-server-main')
  const [labCount, setLabCount] = useState(10)
  const [labStart, setLabStart] = useState(10)
  const [labPrefix] = useState('vhost')

  useEffect(() => {
    const controller = new AbortController()
    api.vms.templates({ signal: controller.signal }).then((res) => {
      if (!controller.signal.aborted && res?.items) setTemplateOptions(res.items)
    }).catch(() => {})
    return () => controller.abort()
  }, [])

  const actionLabels: Record<string, string> = {
    start: 'Encendiendo', shutdown: 'Apagando', reboot: 'Reiniciando',
    destroy: 'Forzando apagado', recreate: 'Recreando', delete: 'Eliminando',
  }

  const runVmAction = (id: number, act: string) => action.execute(`${act}-${id}`, async () => {
    const vm = allVms.find(v => v.id === id)
    const tid = addToast('loading', `${actionLabels[act] || act} ${vm?.name || id}...`)
    const actions: Record<string, (id: number, opts?: { signal?: AbortSignal }) => Promise<unknown>> = {
      start: api.vms.start, shutdown: api.vms.shutdown,
      reboot: api.vms.reboot, destroy: api.vms.destroy,
    }
    try {
      await actions[act](id)
      if (act === 'shutdown' || act === 'reboot') {
        await new Promise(r => setTimeout(r, 2000))
      }
      removeToast(tid)
      const successLabels: Record<string, string> = { start: 'se encendió', shutdown: 'se apagó', reboot: 'se reinició', destroy: 'se forzó apagado' }
      addToast('success', `${vm?.name || id} ${successLabels[act] || act} con éxito`)
      if (act === 'destroy') setConfirmDestroy(null)
      await loadVms()
    } catch {
      removeToast(tid)
      addToast('error', `Error al ${act} ${vm?.name || id}`)
    }
  })

  const runBulkAction = () => action.execute('bulk-action', async () => {
    if (!confirmBulkAction) return
    const tid = addToast('loading', `Ejecutando ${confirmBulkAction.label} en ${confirmBulkAction.ids.length} VM(s)...`)
    try {
      const data = await api.vms.bulkAction(confirmBulkAction.ids, confirmBulkAction.action)
      setConfirmBulkAction(null)
      removeToast(tid)
      addToast('success', `${confirmBulkAction.label}: ${data.filter(r => r.status === 'ok').length} VM(s) procesadas`)
      await loadVms()
    } catch {
      removeToast(tid)
      addToast('error', 'Error en acción masiva')
    }
  })

  const runBulkDelete = () => action.execute('bulk-delete', async () => {
    const ids = Array.from(selectedIds)
    const tid = addToast('loading', `Eliminando ${ids.length} VM(s)...`)
    try {
      const data = await api.vms.bulkDelete(ids)
      setConfirmBulkDelete(false)
      setSelectedIds(new Set())
      removeToast(tid)
      addToast('success', `${data.filter(r => r.status === 'deleted').length} VM(s) eliminadas`)
      await loadVms()
    } catch {
      removeToast(tid)
      addToast('error', 'Error al eliminar')
    }
  })

  const runBulkRecreate = (ids: number[]) => action.execute('bulk-recreate', async () => {
    const tid = addToast('loading', `Recreando ${ids.length} VM(s)...`)
    try {
      let ok = 0
      for (const id of ids) {
        try {
          await api.vms.recreate(id)
          ok++
        } catch {
          const vm = allVms.find(v => v.id === id)
          addToast('error', `Error al recrear ${vm?.name || id}`)
        }
      }
      setConfirmBulkRecreate(null)
      removeToast(tid)
      addToast('success', `${ok} VM(s) recreadas`)
      await loadVms()
    } catch {
      removeToast(tid)
      addToast('error', 'Error al recrear VMs')
    }
  })

  const handleAddVmConfirm = async () => {
    try {
      const res = await api.vms.nextNumber()
      setConfirmAddVm(res.next_number)
    } catch {
      addToast('error', 'Error al obtener el siguiente número disponible')
    }
  }

  const handleOpenLabModal = async () => {
    try {
      const res = await api.vms.nextNumber()
      setLabStart(res.next_number)
    } catch {
      addToast('error', 'Error al obtener el siguiente número disponible')
    }
    setShowLabModal(true)
  }

  const doAddVm = () => action.execute('add-vm', async () => {
    if (confirmAddVm === null) return
    const tid = addToast('loading', `Creando vhost-${confirmAddVm}...`)
    try {
      await api.vms.clone({ number: confirmAddVm, template_name: labTemplate })
      setConfirmAddVm(null)
      removeToast(tid)
      addToast('success', `vhost-${confirmAddVm} creada`)
      await loadVms()
    } catch {
      removeToast(tid)
      addToast('error', 'Error al crear VM')
    }
  })

  const handleRecreate = (id: number) => action.execute(`recreate-${id}`, async () => {
    const vm = allVms.find(v => v.id === id)
    const tid = addToast('loading', `Recreando ${vm?.name || id}...`)
    try {
      await api.vms.recreate(id)
      setConfirmRecreate(null)
      removeToast(tid)
      addToast('success', `${vm?.name || id} recreada`)
      await loadVms()
    } catch {
      removeToast(tid)
      addToast('error', `Error al recrear ${vm?.name || id}`)
    }
  })

  const handleDelete = (id: number) => action.execute(`delete-${id}`, async () => {
    const vm = allVms.find(v => v.id === id)
    const tid = addToast('loading', `Eliminando ${vm?.name || id}...`)
    try {
      await api.vms.delete(id)
      setConfirmDelete(null)
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
      removeToast(tid)
      addToast('success', `${vm?.name || id} eliminada`)
      await loadVms()
    } catch {
      removeToast(tid)
      addToast('error', `Error al eliminar ${vm?.name || id}`)
    }
  })

  const handleCreateLab = () => action.execute('create-lab', async () => {
    const tid = addToast('loading', `Creando laboratorio: ${labCount} VMs...`)
    try {
      const data = await api.vms.createLab({ count: labCount, start_number: labStart, prefix: labPrefix, template_name: labTemplate })
      const created = data.filter(r => r.status === 'created').length
      setShowLabModal(false)
      removeToast(tid)
      addToast('success', `Laboratorio creado: ${created} VM(s)`)
      const skipped = data.filter(r => r.status === 'skipped')
      if (skipped.length > 0) {
        addToast('warning', `${skipped.length} VM(s) omitidas (ya existen)`)
      }
      await loadVms()
    } catch {
      removeToast(tid)
      addToast('error', 'Error al crear laboratorio')
    }
  })

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

  const filteredVms = useMemo(() => {
    const q = filter.toLowerCase()
    return q
      ? allVms.filter(v =>
          v.name.toLowerCase().includes(q) ||
          v.ip.toLowerCase().includes(q) ||
          v.mac.toLowerCase().includes(q)
        )
      : allVms
  }, [filter, allVms])

  const selectedList = Array.from(selectedIds)
  const runningCount = allVms.filter(v => v.status === 'running').length
  const stoppedCount = allVms.filter(v => v.status === 'shutoff').length
  const totalCpuAlloc = allVms.reduce((s, v) => s + v.cpuAlloc, 0)
  const totalRamGb = allVms.reduce((s, v) => s + v.ramAlloc, 0) / 1024

  return (
    <div className="bg-[#f8fafc] space-y-5">
      <ContentHeader title="Instancias" icon="fa-microchip" />

      <VMStats
        runningCount={runningCount}
        stoppedCount={stoppedCount}
        totalCpuAlloc={totalCpuAlloc}
        totalRamGb={totalRamGb}
        dashboardData={dashboardData}
      />

      <VMToolbar
        filter={filter}
        onFilterChange={setFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        selectedIds={selectedIds}
        selectedList={selectedList}
        onBulkAction={(ids, action, label) => setConfirmBulkAction({ ids, action, label })}
        onBulkRecreate={(ids) => setConfirmBulkRecreate(ids)}
        onBulkDelete={() => setConfirmBulkDelete(true)}
        onClearSelection={() => setSelectedIds(new Set())}
        onAddVm={handleAddVmConfirm}
        onCreateLab={handleOpenLabModal}
      />

      <VMTable
        filteredVms={filteredVms}
        selectedIds={selectedIds}
        loading={loading}
        error={error}
        isAdmin={isAdmin}
        openMenu={openMenu}
        actionLoading={{
          ...Object.fromEntries(allVms.flatMap(v => [
            [`start-${v.id}`, action.isLoading(`start-${v.id}`)],
            [`shutdown-${v.id}`, action.isLoading(`shutdown-${v.id}`)],
            [`reboot-${v.id}`, action.isLoading(`reboot-${v.id}`)],
            [`destroy-${v.id}`, action.isLoading(`destroy-${v.id}`)],
            [`recreate-${v.id}`, action.isLoading(`recreate-${v.id}`)],
            [`delete-${v.id}`, action.isLoading(`delete-${v.id}`)],
            [`term-${v.id}`, false],
          ])),
        }}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onAction={runVmAction}
        onDelete={(id) => setConfirmDelete(id)}
        onDestroy={(id) => setConfirmDestroy(id)}
        onRecreate={(id) => setConfirmRecreate(id)}
        onTerminal={(id, name) => setTerminalVm({ id, name })}
        onMenuOpen={setOpenMenu}
      />

      <VMModals
        showLabModal={showLabModal}
        labTemplate={labTemplate}
        labCount={labCount}
        labStart={labStart}
        labPrefix={labPrefix}
        creatingLab={action.isLoading('create-lab')}
        templates={templateOptions}
        confirmDelete={confirmDelete}
        loadingDelete={confirmDelete !== null && action.isLoading(`delete-${confirmDelete}`)}
        confirmDestroy={confirmDestroy}
        loadingDestroy={confirmDestroy !== null && action.isLoading(`destroy-${confirmDestroy}`)}
        confirmRecreate={confirmRecreate}
        loadingRecreate={confirmRecreate !== null && action.isLoading(`recreate-${confirmRecreate}`)}
        confirmBulkAction={confirmBulkAction}
        loadingBulkAction={action.isLoading('bulk-action')}
        confirmBulkDelete={confirmBulkDelete}
        loadingBulkDelete={action.isLoading('bulk-delete')}
        confirmBulkRecreate={confirmBulkRecreate}
        loadingBulkRecreate={action.isLoading('bulk-recreate')}
        confirmAddVm={confirmAddVm}
        creatingVm={action.isLoading('add-vm')}
        onLabTemplateChange={setLabTemplate}
        onLabCountChange={setLabCount}
        onLabStartChange={setLabStart}
        onCloseLabModal={() => setShowLabModal(false)}
        onCreateLab={handleCreateLab}
        onConfirmDelete={() => confirmDelete !== null && handleDelete(confirmDelete)}
        onCancelDelete={() => setConfirmDelete(null)}
        onConfirmDestroy={() => confirmDestroy !== null && runVmAction(confirmDestroy, 'destroy')}
        onCancelDestroy={() => setConfirmDestroy(null)}
        onConfirmRecreate={() => confirmRecreate !== null && handleRecreate(confirmRecreate)}
        onCancelRecreate={() => setConfirmRecreate(null)}
        onConfirmBulkAction={runBulkAction}
        onCancelBulkAction={() => setConfirmBulkAction(null)}
        onConfirmBulkDelete={runBulkDelete}
        onCancelBulkDelete={() => setConfirmBulkDelete(false)}
        onConfirmBulkRecreate={() => runBulkRecreate(confirmBulkRecreate!)}
        onCancelBulkRecreate={() => setConfirmBulkRecreate(null)}
        onConfirmAddVm={doAddVm}
        onCancelAddVm={() => { if (!action.isLoading('add-vm')) setConfirmAddVm(null) }}
      />

      <TerminalModal
        open={terminalVm !== null}
        vmId={terminalVm?.id ?? 0}
        vmName={terminalVm?.name ?? ''}
        onClose={() => setTerminalVm(null)}
      />
    </div>
  )
}
