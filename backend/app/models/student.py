from sqlalchemy import Column, String, Index
from sqlalchemy.orm import relationship

from .base import BaseModel


class Student(BaseModel):
    __tablename__ = "students"

    full_name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)

    assignments = relationship("VMAssignment", back_populates="student")

    __table_args__ = (
        Index("ix_students_full_name_ft", "full_name", mariadb_prefix="FULLTEXT"),
    )

    def __repr__(self):
        return f"<Student(full_name={self.full_name})>"
