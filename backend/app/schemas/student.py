from datetime import datetime
from pydantic import BaseModel, ConfigDict, model_validator


class StudentCreate(BaseModel):
    full_name: str
    email: str
    course_id: int | None = None
    period_id: int | None = None


class StudentUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    course_id: int | None = None


class StudentResponse(BaseModel):
    id: int
    full_name: str
    email: str
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True) 
