import type {
  DashboardData, DashboardHistory,
  TopConsumers,
  VirtualMachine, Student, VMAssignment, AuditLog, TokenResponse,
  HostInfo, AdminCreateRequest, AdminCreateResponse, Admin,
  PeriodInfo, AddPortRequest,
} from '../types'

const API_BASE = '/api/v1'

function getTokens() {
  const access = localStorage.getItem('access_token')
  const refresh = localStorage.getItem('refresh_token')
  return { access, refresh }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { access, refresh } = getTokens()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (access) {
    headers['Authorization'] = `Bearer ${access}`
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401 && refresh) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (refreshRes.ok) {
      const data = await refreshRes.json()
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      headers['Authorization'] = `Bearer ${data.access_token}`
      res = await fetch(`${API_BASE}${path}`, { ...options, headers })
    } else {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      window.location.href = '/login'
      throw new Error('Sesión expirada')
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Error de red')
  }

  return res.json()
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<TokenResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    register: (data: AdminCreateRequest) =>
      request<AdminCreateResponse>('/auth/register', {
        method: 'POST', body: JSON.stringify(data),
      }),
    changePassword: (current_password: string, new_password: string) =>
      request<{ message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password, new_password }),
      }),
  },
  dashboard: {
    get: () => request<DashboardData>('/dashboard'),
    history: () => request<DashboardHistory>('/dashboard/history'),
    topConsumers: () => request<TopConsumers>('/dashboard/top-consumers'),
  },
  host: {
    get: () => request<HostInfo>('/host'),
  },
  ports: {
    add: (vmId: number, data: AddPortRequest) =>
      request<VirtualMachine>(`/vms/${vmId}/ports`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    remove: (vmId: number, portIndex: number) =>
      request<VirtualMachine>(`/vms/${vmId}/ports/${portIndex}`, {
        method: 'DELETE',
      }),
  },
  vms: {
    list: (state?: string) =>
      request<VirtualMachine[]>(`/vms${state ? `?state=${state}` : ''}`),
    listTemplates: () =>
      request<VirtualMachine[]>('/vms?include_templates=true'),
    get: (id: number) => request<VirtualMachine>(`/vms/${id}`),
    start: (id: number) =>
      request<{ message: string }>(`/vms/${id}/start`, { method: 'POST' }),
    shutdown: (id: number) =>
      request<{ message: string }>(`/vms/${id}/shutdown`, { method: 'POST' }),
    reboot: (id: number) =>
      request<{ message: string }>(`/vms/${id}/reboot`, { method: 'POST' }),
    destroy: (id: number) =>
      request<{ message: string }>(`/vms/${id}/destroy`, { method: 'POST' }),
    delete: (id: number) =>
      request<{ message: string }>(`/vms/${id}`, { method: 'DELETE' }),
    recreate: (id: number) =>
      request<{ message: string; recreate_count: number }>(`/vms/${id}/recreate`, { method: 'POST' }),
    bulkAction: (ids: number[], action: string) =>
      request<Array<{ id: number; name: string; status: string }>>('/vms/bulk-action', {
        method: 'POST',
        body: JSON.stringify({ ids, action }),
      }),
    bulkDelete: (ids: number[]) =>
      request<Array<{ id: number; name: string; status: string }>>('/vms/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    clone: (data: { number: number; template_name?: string; vcpus?: number; ram_mb?: number }) =>
      request<VirtualMachine>('/vms/clone', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    createLab: (data: { count: number; start_number: number; prefix: string }) =>
      request<Array<{ number: number; name: string; status: string; reason?: string }>>('/vms/create-lab', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    recreateRange: (from_number: number, to_number: number) =>
      request<Array<{ number: number; name: string; status: string; reason?: string }>>('/vms/recreate-range', {
        method: 'POST',
        body: JSON.stringify({ from_number, to_number }),
      }),
  },
  students: {
    list: (search?: string) =>
      request<Student[]>(`/students${search ? `?search=${search}` : ''}`),
    create: (data: { full_name: string; email: string; student_code: string }) =>
      request<Student>('/students', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: { full_name?: string; email?: string; student_code?: string; is_active?: boolean }) =>
      request<Student>(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<{ message: string }>(`/students/${id}`, { method: 'DELETE' }),
    importCsv: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const { access } = getTokens()
      return fetch(`${API_BASE}/students/import-csv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}` },
        body: formData,
      }).then((r) => r.json())
    },
    history: (id: number) => request<VMAssignment[]>(`/students/${id}/history`),
  },
  assignments: {
    list: (activeOnly = true, period?: string) => {
      const params = new URLSearchParams()
      params.set('active_only', String(activeOnly))
      if (period) params.set('period', period)
      return request<VMAssignment[]>(`/assignments?${params}`)
    },
    periods: () => request<PeriodInfo[]>('/assignments/periods'),
    create: (data: { id_vm: number; id_student: number; period_name: string }) =>
      request<VMAssignment>('/assignments', { method: 'POST', body: JSON.stringify(data) }),
    release: (id: number) =>
      request<{ message: string }>(`/assignments/${id}/release`, { method: 'POST' }),
    autoAssign: (period_name: string) =>
      request<{ created: number; assignments: Array<{ student: string; vm: string }>; unassigned_students: number }>(
        '/assignments/auto-assign', { method: 'POST', body: JSON.stringify({ period_name }) }
      ),
    bulkRelease: (ids: number[]) =>
      request<{ released: number }>('/assignments/bulk-release', {
        method: 'POST', body: JSON.stringify({ ids }),
      }),
  },
  audit: {
    list: (eventType?: string, limit = 50, offset = 0) => {
      const params = new URLSearchParams()
      if (eventType) params.set('event_type', eventType)
      params.set('limit', String(limit))
      params.set('offset', String(offset))
      return request<{ items: AuditLog[]; total: number; limit: number; offset: number }>(`/audit?${params}`)
    },
  },
  iptables: {
    list: () => request<{ success: boolean; rules: Array<Record<string, unknown>>; output: string; stderr?: string }>('/host/iptables'),
    forward: (from: number, to: number) =>
      request<{ success: boolean; results: Array<{ vm: number; rule: string; status: string; message: string }> }>('/host/iptables/forward', {
        method: 'POST',
        body: JSON.stringify({ from_number: from, to_number: to }),
      }),
    unforward: (from: number, to: number) =>
      request<{ success: boolean }>('/host/iptables/unforward', {
        method: 'POST',
        body: JSON.stringify({ from_number: from, to_number: to }),
      }),
    save: () =>
      request<{ success: boolean; message: string }>('/host/iptables/save', { method: 'POST' }),
  },
}
