from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.rbac import admin_only
from app.models import User
from app.schemas.vm_rule import PortRangeConfig
from app.services.iptables_service import (
    list_rules as svc_list,
    forward_range,
    unforward_range,
    save_rules,
    forward_port_range_config,
)

router = APIRouter()


class RangeRequest(BaseModel):
    from_number: int
    to_number: int


@router.get("")
async def get_rules(    user: User = Depends(admin_only)):
    result = svc_list()
    return result


@router.post("/forward")
async def forward(body: RangeRequest,     user: User = Depends(admin_only)):
    if body.from_number < 1 or body.to_number > 254 or body.from_number > body.to_number:
        raise HTTPException(status_code=422, detail="Rango inválido (1-254, from <= to)")
    result = forward_range(body.from_number, body.to_number)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["stderr"] or "Error al añadir reglas")
    return result


@router.post("/unforward")
async def unforward(body: RangeRequest,     user: User = Depends(admin_only)):
    if body.from_number < 1 or body.to_number > 254 or body.from_number > body.to_number:
        raise HTTPException(status_code=422, detail="Rango inválido (1-254, from <= to)")
    result = unforward_range(body.from_number, body.to_number)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["stderr"] or "Error al eliminar reglas")
    return result


@router.post("/save")
async def save(    user: User = Depends(admin_only)):
    result = save_rules()
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["stderr"] or "Error al guardar reglas")
    return result


@router.post("/forward-range")
async def forward_range_config(body: PortRangeConfig,     user: User = Depends(admin_only)):
    if not body.vms:
        raise HTTPException(status_code=422, detail="Lista de VMs vacía")
    vms = [{"id": v.id, "name": v.name, "ip": v.ip} for v in body.vms]
    result = forward_port_range_config(
        vms=vms,
        mode=body.mode,
        base_port=body.base_port,
        ports_per_vm=body.ports_per_vm,
        guest_port_start=body.guest_port_start,
        protocol=body.protocol,
        description=body.description,
    )
    if not result["success"]:
        raise HTTPException(status_code=500, detail="Error al configurar reglas de rango")
    return result
