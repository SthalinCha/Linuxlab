from sqlalchemy import Column, String, Text
from sqlalchemy.orm import relationship

from .base import BaseModel


class Role(BaseModel):
    __tablename__ = "roles"

    name = Column(String(50), unique=True, nullable=False)
    description = Column(Text)

    users = relationship("User", back_populates="role")

    def __repr__(self):
        return f"<Role(name={self.name})>"
