export type VMState = 'running' | 'shut off' | 'paused' | 'crashed' | 'unknown'
export type VMStatus = 'running' | 'shutoff'

export interface VMDisplay {
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

export interface Student {
  id: number
  full_name: string
  email: string
  is_active: boolean
}

export interface VirtualMachine {
  id: number
  name: string
  template_name: string
  mac_address: string
  ip_address?: string
  vcpus: number
  ram_mb: number
  disk_gb: number
  current_state: VMState
  ports?: Port[]
  is_template?: boolean
  ram_used_mb?: number
  ram_percent?: number
  live_vcpus?: number
  max_ram_mb?: number
  cpu_usage_percent?: number
}

export interface Port {
  host: number
  vm: number
  service: string
  serviceName?: string
}

export interface AddPortRequest {
  service: string
  port: number
}

export interface BulkPortEntry {
  host: number
  vm: number
  service: string
  serviceName?: string
}

export interface BulkPortsRequest {
  vm_id: number
  ports: BulkPortEntry[]
}

export interface VMAssignment {
  id: number
  vm_id: number | null
  student_id: number
  period_id: number
  period_name?: string
  assigned_at: string
  released_at?: string
  recreation_count: number
  vm_name_snapshot?: string
  notes?: string
  vm?: VirtualMachine
  student?: Student
}

export interface AuditLog {
  id: number
  event_type: string
  admin_username: string
  action: string
  resource_type?: string
  resource_id?: number
  details?: Record<string, unknown>
  ip_address?: string
  created_at: string
}

export interface DashboardData {
  hostname: string
  os: string
  cpu_percent: number
  cpu_temp: number | null
  cpu_count: number
  ram_percent: number
  ram_used_gb: number
  ram_total_gb: number
  disk_percent: number
  disk_used_gb: number
  disk_total_gb: number
  uptime: string
  load_1: number
  load_5: number
  load_15: number
  total_vms: number
  running_vms: number
  stopped_vms: number
  health_score: number
  alerts_count: number
}

export interface DashboardHistory {
  cpu_history: { time: string; cpu: number }[]
  ram_history: { time: string; ram: number }[]
}

export interface TopConsumer {
  name: string
  cpu_percent?: number
  ram_gb?: number
}

export interface TopConsumers {
  top_cpu: TopConsumer[]
  top_ram: TopConsumer[]
}

export interface HostInfo {
  hostname: string
  uptime: string
  os: string
  kernel: string
  ip_principal: string
  bridge: string
  hypervisor: string
  has_libvirt: boolean
  cpu_percent: number
  cpu_count: number
  vcpu_allocated: number
  ram_used_gb: number
  ram_total_gb: number
  ram_percent: number
  disk_used_gb: number
  disk_total_gb: number
  disk_percent: number
  swap_used_gb: number
  swap_total_gb: number
  load_1: number
  load_5: number
  load_15: number
  services: Record<string, string>
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface Period {
  id: number
  code: string
  name: string | null
  start_date: string
  end_date: string
  is_active: boolean
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface PeriodInfo {
  id: number
  period_name: string
  name?: string
  start_date: string
  end_date: string
  is_active?: boolean
  closed_at: string | null
  total: number
  active: number
  released: number
  student_count: number
}

export interface PortRangeVM {
  id: number
  name: string
  ip: string
}

export interface PortRangeConfig {
  vms: PortRangeVM[]
  mode: 'block' | 'linear'
  base_port: number
  ports_per_vm: number
  guest_port_start?: number
  protocol: 'tcp' | 'udp'
  description?: string
}

export interface PortRangeResultItem {
  vm: string
  id: number
  host_ports: string
  status: string
  message: string
}

export interface PortRangeResult {
  success: boolean
  total: number
  results: PortRangeResultItem[]
}

export interface AdminCreateRequest {
  username: string
  password: string
  full_name: string
}

export interface AdminCreateResponse {
  id: number
  username: string
  full_name: string
}
