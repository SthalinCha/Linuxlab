from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator


class SystemParameterCreate(BaseModel):
    name: str
    value: str
    value_type: str = "string"
    description: str | None = None

    @field_validator("value_type")
    @classmethod
    def validate_value_type(cls, v: str) -> str:
        allowed = {"string", "int", "bool", "float", "json"}
        if v not in allowed:
            raise ValueError(f"value_type debe ser uno de: {', '.join(sorted(allowed))}")
        return v


class SystemParameterUpdate(BaseModel):
    value: str | None = None
    value_type: str | None = None
    description: str | None = None


class SystemParameterResponse(BaseModel):
    id: int
    name: str
    value: str
    value_type: str
    description: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
