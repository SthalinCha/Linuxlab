import functools
from typing import Optional, Callable, Any
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import AuditLog, User


async def log_event(
    session: AsyncSession,
    event_type: str,
    username: str,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[int] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_id: Optional[int] = None,
) -> AuditLog:
    if user_id is None and username:
        result = await session.execute(
            select(User.id).where(User.username == username, User.deleted_at.is_(None))
        )
        user_id = result.scalar_one_or_none()

    entry = AuditLog(
        event_type=event_type,
        admin_username=username,
        user_id=user_id,
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


def audit_log(
    event_type: str,
    action_template: str,
    resource_type: Optional[str] = None,
    resource_id_param: Optional[str] = None,
):
    """
    Decorator that logs an audit event after the endpoint handler succeeds.

    Usage:
        @router.post("/{vm_id}/start")
        @audit_log("vm_start", "Inició VM {name}", "vm", resource_id_param="vm_id")
        async def start_vm(vm_id: int, ...):
            ...

    The action_template can use {param_name} placeholders from the endpoint kwargs.
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            result = await func(*args, **kwargs)
            request: Optional[Request] = kwargs.get("request")
            session: Optional[AsyncSession] = kwargs.get("session")
            user: Optional[User] = kwargs.get("user")

            if session is not None and user is not None:
                rid = None
                if resource_id_param and resource_id_param in kwargs:
                    rid = kwargs[resource_id_param]
                action = action_template.format(**kwargs)
                ip = request.client.host if request else None
                await log_event(
                    session=session,
                    event_type=event_type,
                    username=user.username,
                    action=action,
                    resource_type=resource_type,
                    resource_id=rid,
                    ip_address=ip,
                )
            return result
        return wrapper
    return decorator


async def log_login_event(
    session: AsyncSession,
    username: str,
    success: bool,
    ip_address: Optional[str] = None,
    details: Optional[dict] = None,
):
    event_type = "login" if success else "login_failed"
    action = f"Login {'exitoso' if success else 'fallido'} para {username}"
    await log_event(
        session=session,
        event_type=event_type,
        username=username,
        action=action,
        ip_address=ip_address,
        details=details,
    )
