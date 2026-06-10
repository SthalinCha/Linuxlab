from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, JSON, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(150), nullable=False)
    is_active = Column(Boolean, default=True)


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, autoincrement=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    student_code = Column(String(30), unique=True, nullable=False)
    is_active = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)

    assignments = relationship("VMAssignment", back_populates="student")


class VirtualMachine(Base):
    __tablename__ = "virtual_machines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    template_name = Column(String(50), default="ubuntu-server-main")
    mac_address = Column(String(17), nullable=False, unique=True)
    ip_address = Column(String(45), nullable=True)
    vcpus = Column(Integer, default=1)
    ram_mb = Column(Integer, default=2048)
    disk_gb = Column(Integer, default=10)
    current_state = Column(String(20), default="unknown", index=True)
    ports = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    is_template = Column(Boolean, default=False)

    assignments = relationship("VMAssignment", back_populates="vm")


class VMAssignment(Base):
    __tablename__ = "vm_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    id_vm = Column(Integer, ForeignKey("virtual_machines.id"), nullable=False)
    id_student = Column(Integer, ForeignKey("students.id"), nullable=False)
    period_name = Column(String(50), nullable=False, index=True)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    released_at = Column(DateTime, nullable=True)
    recreate_count = Column(Integer, default=0)
    notes = Column(Text, nullable=True)

    vm = relationship("VirtualMachine", back_populates="assignments")
    student = relationship("Student", back_populates="assignments")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(String(30), nullable=False)
    admin_username = Column(String(50), nullable=False)
    action = Column(String(255), nullable=False)
    resource_type = Column(String(30), nullable=True)
    resource_id = Column(Integer, nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
