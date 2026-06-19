from fastapi import Depends, HTTPException, status
from app.core.security import get_current_user
from app.models.user import User


class RoleChecker:
    def __init__(self, *allowed_roles: str):
        self.allowed_roles = allowed_roles

    async def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.name not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para esta acción",
            )
        return current_user


admin_only = RoleChecker("admin")
admin_profesor = RoleChecker("admin", "profesor")
profesor_only = RoleChecker("profesor")
