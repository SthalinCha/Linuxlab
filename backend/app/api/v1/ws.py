import asyncio
import json
import os
import pty
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

    master_fd = slave_fd = None
    process = None
    try:
        master_fd, slave_fd = pty.openpty()
        process = await asyncio.create_subprocess_exec(
            "ssh", "-tt",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ServerAliveInterval=30",
            "-o", "LogLevel=ERROR",
            "-p", str(ssh_target[1]),
            f"{ssh_user}@{ssh_target[0]}",
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
        )
        os.close(slave_fd)
        slave_fd = None

        loop = asyncio.get_event_loop()

        async def read_pty():
            try:
                while True:
                    data = await loop.run_in_executor(None, os.read, master_fd, 4096)
                    if not data:
                        break
                    await websocket.send_text(data.decode("utf-8", errors="replace"))
            except Exception:
                pass

        async def write_pty():
            try:
                while True:
                    data = await websocket.receive_text()
                    os.write(master_fd, data.encode())
            except WebSocketDisconnect:
                pass
            except Exception:
                pass

        await asyncio.gather(read_pty(), write_pty())
    except Exception:
        pass
    finally:
        if master_fd is not None:
            try:
                os.close(master_fd)
            except Exception:
                pass
        if slave_fd is not None:
            try:
                os.close(slave_fd)
            except Exception:
                pass
        if process:
            try:
                process.terminate()
                await asyncio.wait_for(process.wait(), timeout=5)
            except Exception:
                try:
                    process.kill()
                    await process.wait()
                except Exception:
                    pass
        try:
            await websocket.close()
        except Exception:
            pass
