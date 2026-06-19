from datetime import datetime, timezone
from sqlalchemy import Column, Integer, DateTime, func
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class BaseModel(Base):
    __abstract__ = True

    id = Column(Integer, primary_key=True, autoincrement=True)

    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False
    )

    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    deleted_at = Column(DateTime, nullable=True, index=True)

    def soft_delete(self):
        self.deleted_at = datetime.now(timezone.utc)

    def restore(self):
        self.deleted_at = None

    @property
    def is_active(self):
        return self.deleted_at is None
