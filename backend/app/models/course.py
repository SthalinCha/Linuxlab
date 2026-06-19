from sqlalchemy import Column, String, Text, Integer, ForeignKey
from sqlalchemy.orm import relationship

from .base import BaseModel


class Course(BaseModel):
    __tablename__ = "courses"

    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=True)
    description = Column(Text, nullable=True)
    profesor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    profesor = relationship("User", back_populates="courses")
    periods = relationship("Period", back_populates="course")
    students = relationship("Student", back_populates="course")

    def __repr__(self):
        return f"<Course(name={self.name}, code={self.code})>"
