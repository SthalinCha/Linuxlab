from sqlalchemy import Column, Integer, String, ForeignKey, Index
from sqlalchemy.orm import relationship

from .base import BaseModel


class Student(BaseModel):
    __tablename__ = "students"

    full_name = Column(String(150), nullable=False)
    email = Column(String(150), nullable=False, index=True)
    student_code = Column(String(30), nullable=False)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)

    course = relationship("Course", back_populates="students")
    assignments = relationship("VMAssignment", back_populates="student")
    creator = relationship("User", back_populates="created_students")

    __table_args__ = (
        Index("ix_students_full_name_ft", "full_name", mariadb_prefix="FULLTEXT"),
    )

    def __repr__(self):
        return f"<Student(full_name={self.full_name})>"
