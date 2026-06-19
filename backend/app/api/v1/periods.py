from datetime import datetime, timezone, date
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.models import Period
from app.core.security import get_current_user
from app.models import User
from app.services.period_service import get_period_code, period_dates, display_name
from app.services.assignment_service import close_period as svc_close_period

router = APIRouter()


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("/current")
async def get_current_period(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    code = get_period_code()
    result = await session.execute(select(Period).where(Period.code == code))
    period = result.scalar_one_or_none()
    if not period:
        start, end = period_dates(code)
        await session.execute(
            Period.__table__.update().where(Period.is_active == True).values(is_active=False)
        )
        period = Period(
            code=code,
            name=display_name(code),
            start_date=start,
            end_date=end,
            is_active=True,
        )
        session.add(period)
        await session.commit()
        await session.refresh(period)
    elif not period.is_active:
        await session.execute(
            Period.__table__.update().where(Period.is_active == True).values(is_active=False)
        )
        period.is_active = True
        await session.commit()
    return period


@router.get("")
async def list_periods(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(Period).order_by(Period.code.desc())
    )
    items = list(result.scalars().all())
    existing_codes = {p.code for p in items}

    base = 1992
    today = date.today()
    created = []
    for year in [today.year, today.year + 1]:
        for offset in [0, 1]:
            code = f"P{(year - base) * 2 + offset}"
            if code not in existing_codes:
                start, end = period_dates(code)
                period = Period(
                    code=code,
                    name=display_name(code),
                    start_date=start,
                    end_date=end,
                )
                session.add(period)
                created.append(period)
                existing_codes.add(code)

    if created:
        await session.commit()
        for p in created:
            await session.refresh(p)
        items = created + items

    return {"items": items, "total": len(items)}


@router.post("/{period_id}/close")
async def close_period(
    period_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return await svc_close_period(
        session=session,
        period_id=period_id,
        ip=_ip(request),
        username=user.username,
    )


@router.put("/{period_id}/activate")
async def activate_period(
    period_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    period = await session.get(Period, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    await session.execute(
        Period.__table__.update().where(Period.is_active == True).values(is_active=False)
    )
    period.is_active = True
    period.closed_at = None
    await session.commit()
    await session.refresh(period)

    await _log_activate(session, period, user.username)

    return period


async def _log_activate(
    session: AsyncSession,
    period: Period,
    username: str,
):
    from app.core.audit import log_event
    await log_event(
        session, "period_activate", username,
        f"Activó período {period.code}",
        "period", period.id,
    )
