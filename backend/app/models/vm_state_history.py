from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import relationship

from .base import BaseModel


class VMStateHistory(BaseModel):
    __tablename__ = "vm_state_history"

    vm_id = Column(Integer, ForeignKey("virtual_machines.id"), nullable=False)
    old_state = Column(String(20), nullable=False)
    new_state = Column(String(20), nullable=False)
    changed_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    vm = relationship("VirtualMachine", back_populates="state_history")

    __table_args__ = (
        Index("ix_vm_state_history_vm_changed", "vm_id", "changed_at"),
        Index("ix_vm_state_history_state_transition", "old_state", "new_state"),
    )

    def __repr__(self):
        return f"<VMStateHistory(vm_id={self.vm_id}, {self.old_state}->{self.new_state})>"
