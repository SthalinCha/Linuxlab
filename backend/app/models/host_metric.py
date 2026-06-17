from sqlalchemy import Column, Integer, Float, DateTime, Index, text
from .base import Base


class HostMetric(Base):
    __tablename__ = "host_metrics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    cpu_percent = Column(Float, nullable=False)
    ram_percent = Column(Float, nullable=False)
    disk_percent = Column(Float, nullable=False)

    __table_args__ = (
        Index("ix_host_metrics_timestamp", "timestamp"),
    )
