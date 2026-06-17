from datetime import datetime
from pydantic import BaseModel, ConfigDict


class VMAssignmentCreate(BaseModel):
    vm_id: int | None = None
    student_id: int
    period_id: int
    notes: str | None = None


class VMAssignmentUpdate(BaseModel):
    notes: str | None = None
    released_at: datetime | None = None


class VMAssignmentResponse(BaseModel):
    id: int
    vm_id: int | None
    student_id: int
    period_id: int
    assigned_by: int
    assigned_at: datetime
    released_at: datetime | None
    notes: str | None
    vm_name_snapshot: str | None
    recreation_count: int
    last_recreated_at: datetime | None
    last_recreated_by: int | None
    created_at: datetime
    updated_at: datetime
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
