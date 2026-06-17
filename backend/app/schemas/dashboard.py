from pydantic import BaseModel


class DashboardResponse(BaseModel):
    hostname: str
    os: str
    cpu_percent: float
    cpu_temp: float | None
    cpu_count: int
    ram_percent: float
    ram_used_gb: float
    ram_total_gb: float
    disk_percent: float
    disk_used_gb: float
    disk_total_gb: float
    uptime: str
    load_1: float
    load_5: float
    load_15: float
    total_vms: int
    running_vms: int
    stopped_vms: int
    health_score: float
    vcpu_assigned: int
    alerts_count: int


class CpuHistoryPoint(BaseModel):
    time: str
    cpu: float


class RamHistoryPoint(BaseModel):
    time: str
    ram: float


class DashboardHistoryResponse(BaseModel):
    cpu_history: list[CpuHistoryPoint]
    ram_history: list[RamHistoryPoint]


class AlertItem(BaseModel):
    level: str
    message: str
    resource: str


class DashboardAlertsResponse(BaseModel):
    alerts: list[AlertItem]


class TopConsumerItem(BaseModel):
    name: str
    cpu_percent: float | None = None
    ram_gb: float | None = None


class TopConsumersResponse(BaseModel):
    top_cpu: list[TopConsumerItem]
    top_ram: list[TopConsumerItem]


class ActivityItem(BaseModel):
    time: str
    event: str
    resource: str
    type: str


class RecentActivityResponse(BaseModel):
    activity: list[ActivityItem]


class CapacityResponse(BaseModel):
    free_vcpus: int
    free_ram_gb: float
    free_disk_gb: float
    estimated_vms: int
