import type {
  DashboardData, DashboardHistory,
  TopConsumers,
  VirtualMachine, Student, VMAssignment, AuditLog, TokenResponse,
  HostInfo,
  PeriodInfo, Period, PortRangeConfig, PortRangeResult,
  BulkPortsRequest,
  UserResponse, UserCreate, UserUpdate,
  VMTemplateInfo,
} from '../types'
import { cachedRequest, invalidateCache } from './apiCache'

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

function getTokens() {
  const access = localStorage.getItem('access_token')
  const refresh = localStorage.getItem('refresh_token')
  return { access, refresh }
}

async function fetchWithAuth<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const { access, refresh } = getTokens()
  const isFormData = options.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  }
  if (access) {
    headers['Authorization'] = `Bearer ${access}`
  }

  const opts = { ...options, headers, ...(signal ? { signal } : {}) }

  let res = await fetch(`${API_BASE}${path}`, opts)

  if (res.status === 401 && refresh) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
      ...(signal ? { signal } : {}),
    })
    if (refreshRes.ok) {
      const data = await refreshRes.json()
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      headers['Authorization'] = `Bearer ${data.access_token}`
      res = await fetch(`${API_BASE}${path}`, { ...options, headers, ...(signal ? { signal } : {}) })
    } else {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      window.location.href = '/login'
      throw new Error('Sesión expirada')
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const detail = Array.isArray(err.detail) ? err.detail.map((e: any) => e.msg).join('; ') : err.detail
    throw new Error(detail || 'Error de red')
  }

  return res.json()
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
  ttl?: number,
): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase()
  const isMutation = method !== 'GET'

  if (isMutation) {
    const result = await fetchWithAuth<T>(path, options, signal)
    invalidateCache('/vms')
    invalidateCache('/dashboard')
    invalidateCache('/assignments')
    invalidateCache('/students')
    invalidateCache('/audit')
    invalidateCache('/periods')
    invalidateCache('/host')
    return result
  }

  return cachedRequest<T>(path, fetchWithAuth, options, signal, ttl)
}

type SignalOption = { signal?: AbortSignal }

export const api = {
  auth: {
    login: (username: string, password: string, opts?: SignalOption) =>
      request<TokenResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }, opts?.signal),
    changePassword: (current_password: string, new_password: string, opts?: SignalOption) =>
      request<{ message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password, new_password }),
      }, opts?.signal),
  },
  dashboard: {
    get: (opts?: SignalOption) => request<DashboardData>('/dashboard', undefined, opts?.signal),
    history: (opts?: SignalOption) => request<DashboardHistory>('/dashboard/history', undefined, opts?.signal),
    topConsumers: (opts?: SignalOption) => request<TopConsumers>('/dashboard/top-consumers', undefined, opts?.signal),
  },
  host: {
    get: (opts?: SignalOption) => request<HostInfo>('/host', undefined, opts?.signal),
    forwardRange: (cfg: PortRangeConfig, opts?: SignalOption) =>
      request<PortRangeResult>('/host/iptables/forward-range', {
        method: 'POST',
        body: JSON.stringify(cfg),
      }, opts?.signal),
  },
  ports: {
    remove: (vmId: number, portIndex: number, opts?: SignalOption) =>
      request<VirtualMachine>(`/vms/${vmId}/ports/${portIndex}`, {
        method: 'DELETE',
      }, opts?.signal),
  },
  vms: {
    list: async (state?: string, opts?: SignalOption) => {
      const res = await request<{ items: VirtualMachine[] }>(`/vms${state ? `?state=${state}` : ''}`, undefined, opts?.signal)
      return res.items
    },
    listLight: async (opts?: SignalOption) => {
      const res = await request<{ items: VirtualMachine[] }>('/vms/light', undefined, opts?.signal)
      return res.items
    },
    get: (id: number, opts?: SignalOption) => request<VirtualMachine>(`/vms/${id}`, undefined, opts?.signal),
    start: (id: number, opts?: SignalOption) =>
      request<{ message: string }>(`/vms/${id}/start`, { method: 'POST' }, opts?.signal),
    shutdown: (id: number, opts?: SignalOption) =>
      request<{ message: string }>(`/vms/${id}/shutdown`, { method: 'POST' }, opts?.signal),
    reboot: (id: number, opts?: SignalOption) =>
      request<{ message: string }>(`/vms/${id}/reboot`, { method: 'POST' }, opts?.signal),
    destroy: (id: number, opts?: SignalOption) =>
      request<{ message: string }>(`/vms/${id}/destroy`, { method: 'POST' }, opts?.signal),
    delete: (id: number, opts?: SignalOption) =>
      request<{ message: string }>(`/vms/${id}`, { method: 'DELETE' }, opts?.signal),
    recreate: (id: number, opts?: SignalOption) =>
      request<{ message: string; recreate_count: number }>(`/vms/${id}/recreate`, { method: 'POST' }, opts?.signal),
    bulkAction: (ids: number[], action: string, opts?: SignalOption) =>
      request<Array<{ id: number; name: string; status: string }>>('/vms/bulk-action', {
        method: 'POST',
        body: JSON.stringify({ ids, action }),
      }, opts?.signal),
    bulkDelete: (ids: number[], opts?: SignalOption) =>
      request<Array<{ id: number; name: string; status: string }>>('/vms/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }, opts?.signal),
    clone: (data: { number: number; template_name?: string; vcpus?: number; ram_mb?: number }, opts?: SignalOption) =>
      request<VirtualMachine>('/vms/clone', {
        method: 'POST',
        body: JSON.stringify(data),
      }, opts?.signal),
    templates: (opts?: SignalOption) =>
      request<{ items: VMTemplateInfo[] }>('/vms/templates', undefined, opts?.signal),
    createLab: (data: { count: number; start_number: number; prefix: string; template_name?: string }, opts?: SignalOption) =>
      request<Array<{ number: number; name: string; status: string; reason?: string }>>('/vms/create-lab', {
        method: 'POST',
        body: JSON.stringify(data),
      }, opts?.signal),
    nextNumber: (opts?: SignalOption) =>
      request<{ next_number: number }>('/vms/next-number', undefined, opts?.signal),
    bulkSavePorts: (data: BulkPortsRequest, opts?: SignalOption) =>
      request<VirtualMachine>('/vms/bulk-ports', {
        method: 'POST',
        body: JSON.stringify(data),
      }, opts?.signal),
  },
  students: {
    list: async (search?: string, opts?: SignalOption) => {
      const res = await request<{ items: Student[] }>(`/students${search ? `?search=${search}` : ''}`, undefined, opts?.signal)
      return res.items
    },
    delete: (id: number, opts?: SignalOption) =>
      request<{ message: string }>(`/students/${id}`, { method: 'DELETE' }, opts?.signal),
    undoImport: (data: { student_ids: number[]; period_id?: number }, opts?: SignalOption) =>
      request<{ deleted_assignments: number; deleted_students: number }>('/students/undo-import', {
        method: 'POST',
        body: JSON.stringify(data),
      }, opts?.signal),
    importCsv: (file: File, periodId?: number, opts?: SignalOption) => {
      const formData = new FormData()
      formData.append('file', file)
      const url = `/students/import-csv${periodId ? `?period_id=${periodId}` : ''}`
      return request<{ created: number; assigned: number; unassigned: number; errors: string[]; created_ids: number[] }>(url, {
        method: 'POST',
        body: formData,
      }, opts?.signal)
    },
  },
  assignments: {
    list: async (activeOnly = true, periodId?: number, opts?: SignalOption & { limit?: number; offset?: number }) => {
      const params = new URLSearchParams()
      params.set('active_only', String(activeOnly))
      if (periodId) params.set('period_id', String(periodId))
      if (opts?.limit) params.set('limit', String(opts.limit))
      if (opts?.offset) params.set('offset', String(opts.offset))
      const res = await request<{ items: VMAssignment[]; total: number }>(`/assignments?${params}`, undefined, opts?.signal)
      return res
    },
    periods: async (opts?: SignalOption) => {
      const res = await request<{ items: PeriodInfo[] }>('/assignments/periods', undefined, opts?.signal)
      return res.items
    },
    create: (data: { vm_id?: number; student_id: number; period_id: number; notes?: string }, opts?: SignalOption) =>
      request<VMAssignment>('/assignments', { method: 'POST', body: JSON.stringify(data) }, opts?.signal),
    release: (id: number, opts?: SignalOption) =>
      request<{ message: string }>(`/assignments/${id}/release`, { method: 'POST' }, opts?.signal),
    bulkRelease: (ids: number[], opts?: SignalOption) =>
      request<{ released: number }>('/assignments/bulk-release', {
        method: 'POST', body: JSON.stringify({ ids }),
      }, opts?.signal),
    delete: (id: number, opts?: SignalOption) =>
      request<{ message: string }>('/assignments/' + id, {
        method: 'DELETE',
      }, opts?.signal),
    bulkDelete: (ids: number[], opts?: SignalOption) =>
      request<{ deleted: number }>('/assignments/bulk-delete', {
        method: 'POST', body: JSON.stringify({ ids }),
      }, opts?.signal),
    export: async (periodId?: number, opts?: SignalOption) => {
      const params = new URLSearchParams()
      if (periodId) params.set('period_id', String(periodId))
      const { access } = getTokens()
      const headers: Record<string, string> = {}
      if (access) headers['Authorization'] = `Bearer ${access}`
      const res = await fetch(`${API_BASE}/assignments/export?${params}`, {
        headers,
        ...(opts?.signal ? { signal: opts.signal } : {}),
      })
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
          throw new Error('Sesión expirada')
        }
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Error al exportar CSV')
      }
      return res.blob()
    },
  },
  periods: {
    current: (opts?: SignalOption) =>
      request<Period>('/periods/current', undefined, opts?.signal),
    list: async (opts?: SignalOption) => {
      const res = await request<{ items: Period[]; total: number }>('/periods', undefined, opts?.signal)
      return res.items
    },
    close: (id: number, opts?: SignalOption) =>
      request<{ message: string; released_count: number }>(`/periods/${id}/close`, { method: 'POST' }, opts?.signal),
    activate: (id: number, opts?: SignalOption) =>
      request<Period>(`/periods/${id}/activate`, { method: 'PUT' }, opts?.signal),
    delete: (id: number, opts?: SignalOption) =>
      request<{ message: string }>(`/periods/${id}`, { method: 'DELETE' }, opts?.signal),
  },
  audit: {
    list: (eventType?: string, limit = 50, offset = 0, opts?: SignalOption) => {
      const params = new URLSearchParams()
      if (eventType) params.set('event_type', eventType)
      params.set('limit', String(limit))
      params.set('offset', String(offset))
      return request<{ items: AuditLog[]; total: number; limit: number; offset: number }>(`/audit?${params}`, undefined, opts?.signal)
    },
  },
  users: {
    list: async (opts?: SignalOption) => {
      const res = await request<{ items: UserResponse[] }>('/users', undefined, opts?.signal)
      return res.items
    },
    create: (data: UserCreate, opts?: SignalOption) =>
      request<UserResponse>('/users', { method: 'POST', body: JSON.stringify(data) }, opts?.signal),
    update: (id: number, data: UserUpdate, opts?: SignalOption) =>
      request<UserResponse>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }, opts?.signal),
    delete: (id: number, opts?: SignalOption) =>
      request<{ message: string }>(`/users/${id}`, { method: 'DELETE' }, opts?.signal),
  },
}
