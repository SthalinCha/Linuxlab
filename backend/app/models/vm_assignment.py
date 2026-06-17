from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, DateTime, Text, ForeignKey,
    CheckConstraint, Index, text
)
from sqlalchemy.orm import relationship

from .base import BaseModel


class VMAssignment(BaseModel):
    __tablename__ = "vm_assignments"

    vm_id = Column(Integer, ForeignKey("virtual_machines.id"), nullable=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    period_id = Column(Integer, ForeignKey("periods.id"), nullable=False)

    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    released_at = Column(DateTime, nullable=True)
    notes = Column(Text)

    vm_name_snapshot = Column(String(100), nullable=True)

    recreation_count = Column(Integer, default=0, nullable=False)
    last_recreated_at = Column(DateTime, nullable=True)
    last_recreated_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    vm = relationship("VirtualMachine", back_populates="assignments")
    student = relationship("Student", back_populates="assignments")
    period = relationship("Period", back_populates="assignments")
    assigner = relationship("User", foreign_keys=[assigned_by], back_populates="created_assignments")
    last_recreated_by_user = relationship("User", foreign_keys=[last_recreated_by], back_populates="recreated_assignments")

    __table_args__ = (
        CheckConstraint(
            "(released_at IS NULL) OR (released_at > assigned_at)",
            name="ck_release_after_assign"
        ),
        Index("ix_assignments_period_student", "period_id", "student_id"),
        Index("ix_assignments_period_vm", "period_id", "vm_id"),
        Index("ix_assignments_active", "period_id", "student_id", "released_at"),
        Index("ix_assignments_recreated_by", "last_recreated_by"),
        Index("ix_assignments_period_active", "period_id", "released_at"),
    )

    @property
    def is_current(self):
        return self.released_at is None

    @property
    def is_active(self):
        return self.released_at is None and self.deleted_at is None

    def recreate(self, user_id, note=None):
        self.recreation_count = (self.recreation_count or 0) + 1
        self.last_recreated_at = datetime.now(timezone.utc)
        self.last_recreated_by = user_id
        if note:
            new_entry = f"[Recreaci\u00f3n {self.recreation_count}]: {note}"
            self.notes = new_entry if not self.notes else f"{self.notes}\n{new_entry}"

    def __repr__(self):
        return f"<VMAssignment(vm_id={self.vm_id}, student_id={self.student_id}, period_id={self.period_id}, recreations={self.recreation_count}, current={self.is_current})>"
