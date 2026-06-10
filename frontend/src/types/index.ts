export interface Admin {
  id: number
  username: string
  full_name: string
  is_active: boolean
}

export interface Student {
  id: number
  full_name: string
  email: string
  student_code: string
  is_active: boolean
  notes?: string
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
  current_state: string
  ports?: Port[]
  is_active: boolean
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
}

export interface AddPortRequest {
  service: string
  port: number
}

export interface VMAssignment {
  id: number
  id_vm: number
  id_student: number
  period_name: string
  assigned_at: string
  released_at?: string
  recreate_count: number
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
  swap_used_mb?: number
  swap_total_mb?: number
  swap_percent?: number
  has_libvirt?: boolean
}

export interface DashboardHistory {
  cpu_history: { time: string; cpu: number; ram: number }[]
  ram_history: { time: string; cpu: number; ram: number }[]
  disk_history: { time: string; disk: number }[]
  vm_distribution: { name: string; value: number }[]
}

export interface DashboardAlert {
  level: 'critical' | 'warning' | 'info'
  message: string
  resource: string
}

export interface DashboardAlerts {
  alerts: DashboardAlert[]
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

export interface ActivityItem {
  time: string
  event: string
  resource: string
  type: string
}

export interface RecentActivity {
  activity: ActivityItem[]
}

export interface CapacityInfo {
  free_vcpus: number
  free_ram_gb: number
  free_disk_gb: number
  estimated_vms: number
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

export interface PeriodInfo {
  period_name: string
  total: number
  active: number
  released: number
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
