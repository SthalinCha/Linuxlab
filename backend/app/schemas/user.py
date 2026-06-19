from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    email: str = ""
    role_name: str = "profesor"

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        return v


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    role_name: str | None = None


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    email: str
    role_id: int
    role_name: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserLogin(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def new_password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La nueva contraseña debe tener al menos 8 caracteres")
        return v
