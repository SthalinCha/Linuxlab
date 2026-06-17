from typing import Literal
from pydantic import BaseModel, Field


class VMInfo(BaseModel):
    id: int
    name: str
    ip: str


class PortRangeConfig(BaseModel):
    vms: list[VMInfo]
    mode: Literal["block", "linear"] = "block"
    base_port: int = Field(default=4010, ge=1, le=65535)
    ports_per_vm: int = Field(default=20, ge=1, le=1000)
    guest_port_start: int | None = None
    protocol: Literal["tcp", "udp"] = "tcp"
    description: str = ""
