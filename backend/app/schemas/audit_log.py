from datetime import datetime
from pydantic import BaseModel, ConfigDict


class AuditLogCreate(BaseModel):
    event_type: str
    user_id: int
    action: str
    resource_type: str | None = None
    resource_id: int | None = None
    details: dict | None = None
    ip_address: str | None = None


class AuditLogUpdate(BaseModel):
    pass


class AuditLogResponse(BaseModel):
    id: int
    created_at: datetime
    event_type: str
    user_id: int
    admin_username: str | None
    action: str
    resource_type: str | None
    resource_id: int | None
    details: dict | None
    ip_address: str | None

    model_config = ConfigDict(from_attributes=True)
