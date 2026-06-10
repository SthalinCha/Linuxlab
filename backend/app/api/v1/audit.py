from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.database.models import AuditLog
from app.core.security import get_current_admin
from app.database.models import Admin

router = APIRouter()


@router.get("")
async def list_audit(
    event_type: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
    admin: Admin = Depends(get_current_admin),
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
        "items": logs,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
