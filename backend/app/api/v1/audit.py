from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.models import AuditLog
from app.core.rbac import admin_only
from app.models import User
from app.core.dates import utc_iso

router = APIRouter()


@router.get("")
async def list_audit(
    event_type: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(admin_only),
):
    base_query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))

    if event_type:
        base_query = base_query.where(AuditLog.event_type == event_type)
        count_query = count_query.where(AuditLog.event_type == event_type)

    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    base_query = base_query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    result = await session.execute(base_query)
    logs = result.scalars().all()

    return {
        "items": [
            {
                "id": log.id,
                "created_at": utc_iso(log.created_at),
                "event_type": log.event_type,
                "user_id": log.user_id,
                "admin_username": log.admin_username,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "details": log.details,
                "ip_address": log.ip_address,
            }
            for log in logs
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
