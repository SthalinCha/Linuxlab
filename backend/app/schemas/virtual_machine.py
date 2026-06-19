from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator
import re

MAC_PATTERN = r"^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$"


class VirtualMachineCreate(BaseModel):
    name: str
    template_id: int | None = None
    template_name: str | None = None
    ip_address: str | None = None
    mac_address: str
    vcpus: int = 1
    ram_mb: int = 2048
    disk_gb: int = 10
    current_state: str = "unknown"
    ports: list[dict] | None = None

    @field_validator("mac_address")
    @classmethod
    def validate_mac(cls, v: str) -> str:
        if not re.match(MAC_PATTERN, v):
            raise ValueError("Formato MAC inválido (ej: 52:54:00:35:E0:01)")
        return v

    @field_validator("vcpus")
    @classmethod
    def vcpus_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("vcpus debe ser al menos 1")
        return v

    @field_validator("ram_mb")
    @classmethod
    def ram_positive(cls, v: int) -> int:
        if v < 64:
            raise ValueError("ram_mb debe ser al menos 64")
        return v

    @field_validator("current_state")
    @classmethod
    def validate_state(cls, v: str) -> str:
        allowed = {"running", "stopped", "paused", "unknown", "shut off", "crashed", "suspended", "no state", "blocked"}
        if v not in allowed:
            raise ValueError(f"Estado inválido: {v}. Permitidos: {', '.join(sorted(allowed))}")
        return v


class VirtualMachineUpdate(BaseModel):
    name: str | None = None
    template_id: int | None = None
    template_name: str | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    vcpus: int | None = None
    ram_mb: int | None = None
    disk_gb: int | None = None
    current_state: str | None = None
    ports: list[dict] | None = None


class VirtualMachineResponse(BaseModel):
    id: int
    name: str
    template_id: int | None
    template_name: str | None
    ip_address: str | None
    mac_address: str
    vcpus: int
    ram_mb: int
    disk_gb: int
    current_state: str
    ports: list[dict] | None
    ram_used_mb: int | None = None
    ram_percent: float | None = None
    live_vcpus: int | None = None
    max_ram_mb: int | None = None
    cpu_usage_percent: float | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CloneRequest(BaseModel):
    number: int
    template_name: Optional[str] = None
    vcpus: Optional[int] = None
    ram_mb: Optional[int] = None


class CloneRangeRequest(BaseModel):
    from_number: int
    to_number: int
    template_name: Optional[str] = None
    vcpus: Optional[int] = None
    ram_mb: Optional[int] = None


class CreateLabRequest(BaseModel):
    count: int
    start_number: int
    prefix: str = "vhost"
    template_name: Optional[str] = None
    vcpus: Optional[int] = None
    ram_mb: Optional[int] = None


class BulkDeleteRequest(BaseModel):
    ids: list[int]


class AddPortRequest(BaseModel):
    service: str
    port: int


class BulkPortEntry(BaseModel):
    host: int
    vm: int
    service: str


class BulkPortsRequest(BaseModel):
    vm_id: int
    ports: list[BulkPortEntry]


class BulkActionRequest(BaseModel):
    ids: list[int]
    action: str


class RecreateRangeRequest(BaseModel):
    from_number: int
    to_number: int
