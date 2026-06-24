import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'
import type { VirtualMachine, DashboardData, VMDisplay, VMStatus, VMState } from '../types'

function toVMStatus(raw: VMState): VMStatus {
  if (raw === 'running') return 'running'
  if (raw === 'paused') return 'shutoff'
  return 'shutoff'
}

function toVMDisplay(vm: VirtualMachine): VMDisplay {
  const status = toVMStatus(vm.current_state)
  return {
    id: vm.id, name: vm.name, status,
    ip: vm.ip_address || '', mac: vm.mac_address,
    cpuAlloc: vm.vcpus, ramAlloc: vm.ram_mb, diskAlloc: vm.disk_gb,
    cpuUsage: status === 'running' && vm.cpu_usage_percent != null
      ? Math.min(100, Math.round(vm.cpu_usage_percent)) : 0,
    ramUsage: status === 'running' && vm.ram_used_mb != null
      ? Math.min(100, Math.round((vm.ram_used_mb / (vm.max_ram_mb || vm.ram_mb)) * 100)) : 0,
    ramRssMb: vm.ram_rss_mb,
    ramMaxMb: vm.max_ram_mb ?? vm.ram_mb,
    templateName: vm.template_name,
    ownerName: vm.owner_name,
  }
}

export function useVMs(statusFilter: string) {
  const [allVms, setAllVms] = useState<VMDisplay[]>([])
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setLoading(true)
    setError(null)
    try {
      const [data, dash] = await Promise.all([
        api.vms.list(statusFilter || undefined, { signal }),
        api.dashboard.get({ signal }).catch(() => null),
      ])
      if (signal.aborted) return
      setDashboardData(dash)
      if (Array.isArray(data)) {
        setAllVms(data.map(v => toVMDisplay(v)))
      } else {
        console.warn('useVMs: vms data no es un array', data)
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al cargar VMs')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load(); return () => abortRef.current?.abort() }, [load])

  return { allVms, dashboardData, loading, error, refetch: load }
}
