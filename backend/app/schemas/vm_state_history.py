from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator


ALLOWED_VM_STATES = {"running", "stopped", "paused", "unknown", "shut off", "crashed", "suspended", "no state", "blocked"}


class VMStateHistoryCreate(BaseModel):
    vm_id: int
    old_state: str
    new_state: str

    @field_validator("old_state", "new_state")
    @classmethod
    def validate_state(cls, v: str) -> str:
        if v not in ALLOWED_VM_STATES:
            raise ValueError(f"Estado inválido: {v}")
        return v


class VMStateHistoryUpdate(BaseModel):
    pass


class VMStateHistoryResponse(BaseModel):
    id: int
    vm_id: int
    old_state: str
    new_state: str
    changed_at: datetime
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
