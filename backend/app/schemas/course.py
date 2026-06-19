from datetime import datetime
from pydantic import BaseModel, ConfigDict


class CourseCreate(BaseModel):
    name: str
    code: str | None = None
    description: str | None = None


class CourseUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None


class CourseResponse(BaseModel):
    id: int
    name: str
    code: str | None
    description: str | None
    profesor_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CourseWithCounts(CourseResponse):
    period_count: int = 0
    student_count: int = 0
