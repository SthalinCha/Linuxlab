import { useState, useEffect, useRef } from 'react'
import { api } from '../services/api'
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
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const { allVms, dashboardData, loading, error, refetch: loadVms } = useVMs(statusFilter)

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [confirmDestroy, setConfirmDestroy] = useState<number | null>(null)
  const [confirmRecreate, setConfirmRecreate] = useState<number | null>(null)
  const [confirmBulkAction, setConfirmBulkAction] = useState<{ ids: number[]; action: string; label: string } | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [confirmBulkRecreate, setConfirmBulkRecreate] = useState<number[] | null>(null)
  const [terminalVm, setTerminalVm] = useState<{ id: number; name: string } | null>(null)
  const [confirmAddVm, setConfirmAddVm] = useState<number | null>(null)
  const [creatingVm, setCreatingVm] = useState(false)

  const [templateOptions, setTemplateOptions] = useState<VMTemplateInfo[]>([])
  const [showLabModal, setShowLabModal] = useState(false)
  const [labTemplate, setLabTemplate] = useState('ubuntu-server-main')
  const [labCount, setLabCount] = useState(10)
  const [labStart, setLabStart] = useState(10)
  const [labPrefix] = useState('vhost')
  const [creatingLab, setCreatingLab] = useState(false)

  useEffect(() => {
    api.vms.templates().then((res) => {
      if (res?.items) setTemplateOptions(res.items)
    }).catch(() => {})
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
      addToast('success', `${confirmBulkAction.label}: ${data.filter(r => r.status === 'ok').length} VM(s) procesadas`)
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
      addToast('success', `${data.filter(r => r.status === 'deleted').length} VM(s) eliminadas`)
      await loadVms()
    } catch (err) {
      removeToast(tid)
      addToast('error', 'Error al eliminar')
    }
  }

  const handleBulkRecreate = async (ids: number[]) => {
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
    } catch (err) {
      removeToast(tid)
      addToast('error', 'Error al recrear VMs')
    }
  }

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

  const doAddVm = async () => {
    if (confirmAddVm === null) return
    setCreatingVm(true)
    const tid = addToast('loading', `Creando vhost-${confirmAddVm}...`)
    try {
      await api.vms.clone({ number: confirmAddVm, template_name: labTemplate })
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

  const q = filter.toLowerCase()
  const filteredVms = q
    ? allVms.filter(v =>
        v.name.toLowerCase().includes(q) ||
        v.ip.toLowerCase().includes(q) ||
        v.mac.toLowerCase().includes(q)
      )
    : allVms

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
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onAction={doAction}
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
        creatingLab={creatingLab}
        templates={templateOptions}
        confirmDelete={confirmDelete}
        confirmDestroy={confirmDestroy}
        confirmRecreate={confirmRecreate}
        confirmBulkAction={confirmBulkAction}
        confirmBulkDelete={confirmBulkDelete}
        confirmBulkRecreate={confirmBulkRecreate}
        confirmAddVm={confirmAddVm}
        creatingVm={creatingVm}
        onLabTemplateChange={setLabTemplate}
        onLabCountChange={setLabCount}
        onLabStartChange={setLabStart}
        onCloseLabModal={() => setShowLabModal(false)}
        onCreateLab={handleCreateLab}
        onConfirmDelete={() => confirmDelete !== null && handleDelete(confirmDelete)}
        onCancelDelete={() => setConfirmDelete(null)}
        onConfirmDestroy={() => confirmDestroy !== null && doAction(confirmDestroy, 'destroy')}
        onCancelDestroy={() => setConfirmDestroy(null)}
        onConfirmRecreate={() => confirmRecreate !== null && handleRecreate(confirmRecreate)}
        onCancelRecreate={() => setConfirmRecreate(null)}
        onConfirmBulkAction={doBulkAction}
        onCancelBulkAction={() => setConfirmBulkAction(null)}
        onConfirmBulkDelete={handleBulkDelete}
        onCancelBulkDelete={() => setConfirmBulkDelete(false)}
        onConfirmBulkRecreate={() => handleBulkRecreate(confirmBulkRecreate!)}
        onCancelBulkRecreate={() => setConfirmBulkRecreate(null)}
        onConfirmAddVm={doAddVm}
        onCancelAddVm={() => { if (!creatingVm) setConfirmAddVm(null) }}
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
