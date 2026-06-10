import json
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.models import AuditLog


async def log_event(
    session: AsyncSession,
    event_type: str,
    admin_username: str,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[int] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    entry = AuditLog(
        event_type=event_type,
        admin_username=admin_username,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        ip_address=ip_address,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry
