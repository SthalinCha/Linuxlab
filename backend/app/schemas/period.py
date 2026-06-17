from datetime import datetime
from pydantic import BaseModel, ConfigDict


class PeriodCreate(BaseModel):
    code: str
    name: str | None = None
    start_date: datetime
    end_date: datetime
    is_active: bool = False


class PeriodUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class PeriodResponse(BaseModel):
    id: int
    code: str
    name: str | None
    start_date: datetime
    end_date: datetime
    is_active: bool
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
