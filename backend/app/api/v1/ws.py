import asyncio
import json
import pexpect
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from app.database.session import async_session
from app.models import VirtualMachine
from app.services.host_service import get_host_metrics_async as get_host_metrics
from app.core.security import decode_token
from app.core.config import VM_SSH_USER

router = APIRouter()


def _verify_ws_token(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        return payload
    except Exception:
        return None


@router.websocket("/dashboard")
async def dashboard_ws(websocket: WebSocket):
    payload = _verify_ws_token(websocket.query_params.get("token"))
    if not payload:
        await websocket.close(code=4001, reason="Token inválido")
        return

    await websocket.accept()
    try:
        while True:
            try:
                data = await get_host_metrics()
                await websocket.send_text(json.dumps(data))
            except Exception:
                break
            await asyncio.sleep(10)
    except WebSocketDisconnect:
        pass


@router.websocket("/terminal/{vm_id}")
async def terminal_ws(websocket: WebSocket, vm_id: int):
    payload = _verify_ws_token(websocket.query_params.get("token"))
    if not payload:
        await websocket.close(code=4001, reason="Token inválido")
        return

    # Verificar rol desde el payload del token
    role = payload.get("role", "")
    username = payload.get("sub", "")

    ssh_user = VM_SSH_USER

    async with async_session() as session:
        from sqlalchemy.orm import selectinload
        result = await session.execute(
            select(VirtualMachine)
            .options(selectinload(VirtualMachine.owner))
            .where(VirtualMachine.id == vm_id, VirtualMachine.deleted_at.is_(None))
        )
        vm = result.scalar_one_or_none()
        if not vm:
            await websocket.close(code=4004, reason="VM no encontrada")
            return

        # Ownership check for profesor role
        if role == "profesor" and vm.owner_id is not None:
            # Look up user by username to get their ID
            from app.models import User
            user_result = await session.execute(
                select(User.id).where(User.username == username, User.deleted_at.is_(None))
            )
            user_row = user_result.scalar_one_or_none()
            if not user_row or vm.owner_id != user_row:
                await websocket.close(code=4003, reason="No autorizado para esta VM")
                return

        if vm.current_state != "running":
            await websocket.close(code=4004, reason="VM no está encendida")
            return

        vm_ip = getattr(vm, "ip_address", None)
        if not vm_ip:
            await websocket.close(code=4004, reason="VM sin IP asignada")
            return
        ssh_target = (vm_ip, 22)

    if not ssh_target:
        await websocket.close(code=4004, reason="VM sin dirección SSH")
        return

    await websocket.accept()

    child = None
    try:
        cmd = "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ServerAliveInterval=30 -o LogLevel=ERROR -p {} {}@{}".format(
            ssh_target[1], ssh_user, ssh_target[0]
        )
        child = pexpect.spawn(cmd, timeout=None, encoding="utf-8", codec_errors="replace")
        child.delaybeforesend = 0.01

        async def read_child():
            try:
                while True:
                    try:
                        data = child.read_nonblocking(size=4096, timeout=0.1)
                        if data:
                            await websocket.send_text(data)
                    except pexpect.TIMEOUT:
                        await asyncio.sleep(0.05)
                    except pexpect.EOF:
                        break
                    except Exception:
                        break
            except Exception:
                pass

        async def read_ws():
            try:
                while True:
                    data = await websocket.receive_text()
                    child.send(data)
            except WebSocketDisconnect:
                pass
            except Exception:
                pass

        await asyncio.gather(read_child(), read_ws())
    except Exception:
        pass
    finally:
        if child:
            try:
                child.terminate(force=True)
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
