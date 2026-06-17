from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from .base import BaseModel


class User(BaseModel):
    __tablename__ = "users"

    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)

    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False, index=True)

    role = relationship("Role", back_populates="users")
    audit_logs = relationship("AuditLog", back_populates="user")
    created_assignments = relationship(
        "VMAssignment",
        foreign_keys="[VMAssignment.assigned_by]",
        back_populates="assigner"
    )
    recreated_assignments = relationship(
        "VMAssignment",
        foreign_keys="[VMAssignment.last_recreated_by]",
        back_populates="last_recreated_by_user"
    )

    def __repr__(self):
        return f"<User(username={self.username}, full_name={self.full_name})>"
