import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'
import type { VirtualMachine, DashboardData, VMDisplay, VMStatus, VMState } from '../types'

function toVMStatus(raw: VMState): VMStatus {
  if (raw === 'running') return 'running'
  if (raw === 'paused') return 'shutoff'
  return 'shutoff'
}

function toVMDisplay(vm: VirtualMachine, cpuCount: number, ramTotalGb: number): VMDisplay {
  const status = toVMStatus(vm.current_state)
  const cpuUsage = vm.cpu_usage_percent != null
    ? Math.min(100, Math.round(vm.cpu_usage_percent))
    : cpuCount > 0 ? Math.min(100, Math.round((vm.vcpus / cpuCount) * 100)) : 0
  const ramUsage = vm.ram_percent != null
    ? Math.min(100, Math.round(vm.ram_percent))
    : ramTotalGb > 0 ? Math.min(100, Math.round((vm.ram_mb / 1024 / ramTotalGb) * 100)) : 0
  return {
    id: vm.id, name: vm.name, status,
    ip: vm.ip_address || '', mac: vm.mac_address,
    cpuAlloc: vm.vcpus, ramAlloc: vm.ram_mb, diskAlloc: vm.disk_gb,
    cpuUsage: status === 'running' ? cpuUsage : 0,
    ramUsage: status === 'running' ? ramUsage : 0,
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
        const cpuCount = dash?.cpu_count ?? 0
        const ramGb = dash?.ram_total_gb ?? 0
        setAllVms(data.map(v => toVMDisplay(v, cpuCount, ramGb)))
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
