from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, Index, text
from sqlalchemy.orm import relationship

from .base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, server_default=text("CURRENT_TIMESTAMP"), nullable=False, index=True)

    event_type = Column(String(50), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(255), nullable=False)
    resource_type = Column(String(50), nullable=True, index=True)
    resource_id = Column(Integer, nullable=True, index=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)

    admin_username = Column(String(50), nullable=True, index=True)

    user = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index("ix_audit_event_created", "event_type", "created_at"),
        Index("ix_audit_resource_created", "resource_type", "resource_id", "created_at"),
        Index("ix_audit_user_date", "user_id", "created_at"),
    )

    def __repr__(self):
        return f"<AuditLog(event_type={self.event_type}, user_id={self.user_id}, action={self.action})>"
