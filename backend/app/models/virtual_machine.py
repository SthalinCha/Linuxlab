from sqlalchemy import (
    Column, Integer, String, JSON,
    ForeignKey, CheckConstraint, Index
)
from sqlalchemy.orm import relationship

from .base import BaseModel


class VirtualMachine(BaseModel):
    __tablename__ = "virtual_machines"

    name = Column(String(100), nullable=False, index=True, unique=True)

    template_id = Column(
        Integer,
        ForeignKey("vm_templates.id"),
        nullable=True
    )

    template_name = Column(String(50), nullable=True)

    ip_address = Column(String(45), unique=True, nullable=True)
    mac_address = Column(String(17), unique=True, nullable=False)

    vcpus = Column(Integer, nullable=False, default=1)
    ram_mb = Column(Integer, nullable=False, default=2048)
    disk_gb = Column(Integer, nullable=False, default=10)

    current_state = Column(
        String(20),
        nullable=False,
        default="unknown",
        index=True
    )

    ports = Column(JSON, nullable=True)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    template = relationship("VMTemplate", back_populates="virtual_machines")
    owner = relationship("User", back_populates="virtual_machines")
    assignments = relationship("VMAssignment", back_populates="vm")
    state_history = relationship("VMStateHistory", back_populates="vm", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "current_state IN ('running','stopped','paused','unknown','shut off','crashed','suspended','no state','blocked')",
            name="ck_virtual_machine_state"
        ),
        Index("ix_vm_template_state", "template_id", "current_state"),
        Index("ix_vm_dashboard_sum", "deleted_at", "template_id", "vcpus"),
    )

    def __repr__(self):
        return f"<VirtualMachine(name={self.name}, ip={self.ip_address}, state={self.current_state})>"
