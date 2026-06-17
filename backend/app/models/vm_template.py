from sqlalchemy import Column, String, Text, Integer
from sqlalchemy.orm import relationship

from .base import BaseModel


class VMTemplate(BaseModel):
    __tablename__ = "vm_templates"

    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text)
    vcpus = Column(Integer, default=1, nullable=False)
    ram_mb = Column(Integer, default=2048, nullable=False)
    disk_gb = Column(Integer, default=10, nullable=False)

    virtual_machines = relationship("VirtualMachine", back_populates="template")

    def __repr__(self):
        return f"<VMTemplate(name={self.name}, vcpus={self.vcpus}, ram={self.ram_mb}MB)>"
