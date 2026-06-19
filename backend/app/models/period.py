from sqlalchemy import Column, String, DateTime, Boolean, Integer, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship

from .base import BaseModel


class Period(BaseModel):
    __tablename__ = "periods"

    code = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=True)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=False, index=True)
    closed_at = Column(DateTime, nullable=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)

    course = relationship("Course", back_populates="periods")
    assignments = relationship("VMAssignment", back_populates="period")

    __table_args__ = (
        CheckConstraint("start_date < end_date", name="ck_period_dates"),
    )

    def __repr__(self):
        return f"<Period(code={self.code}, start={self.start_date}, end={self.end_date}, active={self.is_active})>"
