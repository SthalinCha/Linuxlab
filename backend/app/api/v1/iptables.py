from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.core.security import get_current_admin
from app.database.models import Admin
from app.services.iptables_service import (
    list_rules as svc_list,
    forward_range,
    unforward_range,
    save_rules,
)

router = APIRouter()


class RangeRequest(BaseModel):
    from_number: int
    to_number: int


@router.get("")
async def get_rules(admin: Admin = Depends(get_current_admin)):
    result = svc_list()
    return result


@router.post("/forward")
async def forward(body: RangeRequest, admin: Admin = Depends(get_current_admin)):
    if body.from_number < 1 or body.to_number > 254 or body.from_number > body.to_number:
        raise HTTPException(status_code=422, detail="Rango inválido (1-254, from <= to)")
    result = forward_range(body.from_number, body.to_number)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["stderr"] or "Error al añadir reglas")
    return result


@router.post("/unforward")
async def unforward(body: RangeRequest, admin: Admin = Depends(get_current_admin)):
    if body.from_number < 1 or body.to_number > 254 or body.from_number > body.to_number:
        raise HTTPException(status_code=422, detail="Rango inválido (1-254, from <= to)")
    result = unforward_range(body.from_number, body.to_number)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["stderr"] or "Error al eliminar reglas")
    return result


@router.post("/save")
async def save(admin: Admin = Depends(get_current_admin)):
    result = save_rules()
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["stderr"] or "Error al guardar reglas")
    return result
