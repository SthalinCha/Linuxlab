from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator


class VMTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    vcpus: int = 1
    ram_mb: int = 2048
    disk_gb: int = 10

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

    @field_validator("disk_gb")
    @classmethod
    def disk_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("disk_gb debe ser al menos 1")
        return v


class VMTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    vcpus: int | None = None
    ram_mb: int | None = None
    disk_gb: int | None = None


class VMTemplateResponse(BaseModel):
    id: int
    name: str
    description: str | None
    vcpus: int
    ram_mb: int
    disk_gb: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
