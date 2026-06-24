import asyncio
import subprocess
from typing import Optional
from app.core.config import VM_SUBNET, get_host_ip
from app.services.config_service import get_port_map


logger = __import__("logging").getLogger(__name__)

_pending_batch: list[tuple[str, str]] = []
_batch_lock = asyncio.Lock()
_BATCH_FLUSH_THRESHOLD = 20


def _sudo(cmd: list[str]) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(["sudo", "-n"] + cmd, capture_output=True, text=True, timeout=30)
    except Exception:
        return subprocess.run(["sudo"] + cmd, capture_output=True, text=True, timeout=30)


def _rule_exists(table: str, chain: str, args: list[str]) -> bool:
    r = _sudo(["iptables", "-t", table, "-C", chain] + args)
    return r.returncode == 0


def _add_rule(table: str, chain: str, args: list[str]) -> tuple[bool, str]:
    desc = " ".join(args[-5:])
    if _rule_exists(table, chain, args):
        return True, f"Ya existe: {desc}"
    r = _sudo(["iptables", "-t", table, "-A", chain] + args)
    if r.returncode == 0:
        return True, f"Añadida: {desc}"
    return False, r.stderr.strip() or f"Error añadiendo: {desc}"


def _del_rule(table: str, chain: str, args: list[str]) -> tuple[bool, str]:
    desc = " ".join(args[-5:])
    if not _rule_exists(table, chain, args):
        return True, f"No existe: {desc}"
    r = _sudo(["iptables", "-t", table, "-D", chain] + args)
    if r.returncode == 0:
        return True, f"Eliminada: {desc}"
    return False, r.stderr.strip() or f"Error eliminando: {desc}"


async def _add_batch_rule(table: str, chain: str, args: list[str], vm_num: int, desc: str) -> tuple[bool, str]:
    global _pending_batch
    rule_text = f"-A {chain} {' '.join(args)}"
    async with _batch_lock:
        _pending_batch.append((table, rule_text))
        if len(_pending_batch) >= _BATCH_FLUSH_THRESHOLD:
            await _flush_batch()
    return True, f"batched: {desc}"

async def _del_batch_rule(table: str, chain: str, args: list[str], vm_num: int, desc: str) -> tuple[bool, str]:
    global _pending_batch
    rule_text = f"-D {chain} {' '.join(args)}"
    async with _batch_lock:
        _pending_batch.append((table, rule_text))
        if len(_pending_batch) >= _BATCH_FLUSH_THRESHOLD:
            await _flush_batch()
    return True, f"batch-del: {desc}"

def _run_iptables_restore(rules_text: str) -> None:
    """Ejecuta iptables-restore --noflush (EN UN THREAD para no bloquear el event loop)."""
    try:
        r = subprocess.run(
            ["sudo", "-n", "iptables-restore", "--noflush"],
            input=rules_text, text=True, capture_output=True, timeout=30,
        )
        if r.returncode != 0:
            logger.warning("iptables-restore batch error: %s", r.stderr[:300])
    except Exception as e:
        logger.warning("iptables-restore exception: %s", e)


async def _flush_batch() -> None:
    global _pending_batch
    if not _pending_batch:
        return

    batch = _pending_batch.copy()
    _pending_batch.clear()

    tables: dict[str, list[str]] = {}
    for table, rule_text in batch:
        tables.setdefault(table, []).append(rule_text)

    for table, rules in tables.items():
        rules_text = f"*{table}\n" + "\n".join(rules) + "\nCOMMIT\n"
        await asyncio.to_thread(_run_iptables_restore, rules_text)


def _vm_rules(num: int) -> list[tuple[list[str], str]]:
    host_ip = get_host_ip()
    dest = f"{VM_SUBNET}.{num}"
    port_map = get_port_map()
    rules = []
    for name, base, vm_port in port_map:
        host_port = base + num
        rules.append(
            (["-p", "tcp", "-d", host_ip, "--dport", str(host_port), "-j", "DNAT", "--to-destination", f"{dest}:{vm_port}"],
             f"{name} vhost-{num} (:{host_port} → {dest}:{vm_port})")
        )
    # Reglas locales para ADMIN (Cockpit)
    cockpit_entry = next(((n, b, v) for n, b, v in port_map if n == "Cockpit"), ("Cockpit", 9000, 9090))
    _, cockpit_base, cockpit_vm_port = cockpit_entry
    admin_port = cockpit_base + num
    rules.append(
        (["-p", "tcp", "-d", "127.0.0.1", "--dport", str(admin_port), "-j", "DNAT", "--to-destination", f"{dest}:{cockpit_vm_port}"],
         f"ADMIN vhost-{num} localhost")
    )
    rules.append(
        (["-p", "tcp", "-d", host_ip, "--dport", str(admin_port), "-j", "DNAT", "--to-destination", f"{dest}:{cockpit_vm_port}"],
         f"ADMIN vhost-{num} local IP")
    )
    return rules


def _nat_args(host_ip: str, dest_ip: str, host_port: int, vm_port: int) -> list[str]:
    return ["-p", "tcp", "-d", host_ip, "--dport", str(host_port),
            "-j", "DNAT", "--to-destination", f"{dest_ip}:{vm_port}"]


def forward_port(dest_ip: str, host_port: int, vm_port: int, desc: str) -> tuple[bool, str]:
    host_ip = get_host_ip()
    args = _nat_args(host_ip, dest_ip, host_port, vm_port)
    ok, msg = _add_rule("nat", "PREROUTING", args)
    _add_rule("nat", "OUTPUT", args)  # Best-effort; local connections need OUTPUT
    return ok, msg


def unforward_port(dest_ip: str, host_port: int, vm_port: int, desc: str) -> tuple[bool, str]:
    host_ip = get_host_ip()
    args = _nat_args(host_ip, dest_ip, host_port, vm_port)
    ok, msg = _del_rule("nat", "PREROUTING", args)
    _del_rule("nat", "OUTPUT", args)  # Best-effort cleanup
    return ok, msg


async def _add_prerouting_and_output(args: list[str], results: list, vm_label: int, desc: str):
    """Add a DNAT rule to both PREROUTING (external) and OUTPUT (local) chains via batch."""
    ok_prerouting, msg_prerouting = await _add_batch_rule("nat", "PREROUTING", args, vm_label, desc)
    results.append({"vm": vm_label, "rule": desc, "chain": "PREROUTING",
                    "status": "ok" if ok_prerouting else "error", "message": msg_prerouting})
    ok_output, msg_output = await _add_batch_rule("nat", "OUTPUT", args, vm_label, desc)
    results.append({"vm": vm_label, "rule": desc, "chain": "OUTPUT",
                    "status": "ok" if ok_output else "error", "message": msg_output})


async def _del_prerouting_and_output(args: list[str], results: list, vm_label: int, desc: str):
    ok_prerouting, msg_prerouting = await _del_batch_rule("nat", "PREROUTING", args, vm_label, desc)
    results.append({"vm": vm_label, "rule": desc, "chain": "PREROUTING",
                    "status": "ok" if ok_prerouting else "error", "message": msg_prerouting})
    ok_output, msg_output = await _del_batch_rule("nat", "OUTPUT", args, vm_label, desc)
    results.append({"vm": vm_label, "rule": desc, "chain": "OUTPUT",
                    "status": "ok" if ok_output else "error", "message": msg_output})


async def forward_range(from_num: int, to_num: int) -> dict:
    results = []
    await asyncio.to_thread(_ensure_forwarding, results)
    for n in range(from_num, to_num + 1):
        for args, desc in _vm_rules(n):
            await _add_prerouting_and_output(args, results, n, desc)

    await _flush_batch()
    return {"success": True, "results": results, "total": len(results)}


async def unforward_range(from_num: int, to_num: int) -> dict:
    results = []
    for n in range(from_num, to_num + 1):
        for args, desc in _vm_rules(n):
            await _del_prerouting_and_output(args, results, n, desc)
    await _flush_batch()
    return {"success": True, "results": results, "total": len(results)}


def list_rules() -> dict:
    r = _sudo(["iptables", "-t", "nat", "-L", "PREROUTING", "-n", "--line-numbers"])
    lines = r.stdout.strip().split("\n")
    if len(lines) <= 2:
        rules_raw = []
    else:
        rules_raw = lines[2:]

    rules = []
    for line in rules_raw:
        parts = line.strip().split()
        if len(parts) >= 2 and parts[0].isdigit():
            rules.append({
                "num": int(parts[0]),
                "target": parts[1],
                "source": parts[3] if len(parts) > 3 else "",
                "destination": parts[4] if len(parts) > 4 else "",
                "detail": " ".join(parts[5:]) if len(parts) > 5 else "",
            })
        else:
            rules.append({"raw": line.strip()})

    return {"success": r.returncode == 0, "rules": rules, "output": r.stdout.strip()}


def save_rules() -> dict:
    r = _sudo(["iptables-save"])
    if r.returncode != 0:
        return {"success": False, "error": r.stderr.strip()}
    try:
        with open("/etc/iptables/rules.v4", "w") as f:
            f.write(r.stdout)
        return {"success": True, "message": "Reglas guardadas en /etc/iptables/rules.v4"}
    except PermissionError:
        # Fallback si no podemos escribir
        return {"success": False, "error": "Permiso denegado al escribir /etc/iptables/rules.v4"}


def forward_port_range_config(
    vms: list[dict],
    mode: str,
    base_port: int,
    ports_per_vm: int,
    guest_port_start: int | None = None,
    protocol: str = "tcp",
    description: str = "",
) -> dict:
    results = []
    _ensure_forwarding(results)

    for idx, vm in enumerate(vms):
        dest_ip = vm["ip"]
        vm_name = vm["name"]
        guest_start = guest_port_start if guest_port_start is not None else base_port
        host_ports_assigned = []

        if mode == "block":
            host_base = base_port + idx * ports_per_vm
            for offset in range(ports_per_vm):
                host_port = host_base + offset
                guest_port = guest_start + offset
                if host_port > 65535 or guest_port > 65535:
                    results.append({
                        "vm": vm_name, "id": vm["id"],
                        "host_ports": "", "status": "error",
                        "message": "Rango excede puerto máximo 65535",
                    })
                    break
                ok, msg = forward_port(dest_ip, host_port, guest_port,
                                       f"{description} {vm_name} port-{offset}")
                if ok:
                    host_ports_assigned.append(str(host_port))
                results.append({
                    "vm": vm_name, "id": vm["id"],
                    "host_ports": str(host_port),
                    "status": "ok" if ok else "error",
                    "message": msg,
                })
        else:
            host_port = base_port + idx
            guest_port = guest_start
            if host_port > 65535 or guest_port > 65535:
                results.append({
                    "vm": vm_name, "id": vm["id"],
                    "host_ports": "", "status": "error",
                    "message": "Puerto excede 65535",
                })
                continue
            ok, msg = forward_port(dest_ip, host_port, guest_port,
                                   f"{description} {vm_name} linear")
            results.append({
                "vm": vm_name, "id": vm["id"],
                "host_ports": str(host_port),
                "status": "ok" if ok else "error",
                "message": msg,
            })

    return {"success": True, "results": results, "total": len(results)}


def _ensure_forwarding(results: list):
    rule = ["-m", "state", "-d", f"{VM_SUBNET}.0/24", "--state", "NEW,RELATED,ESTABLISHED", "-j", "ACCEPT"]
    if not _rule_exists("filter", "FORWARD", rule):
        r = _sudo(["iptables", "-I", "FORWARD"] + rule)
        if r.returncode == 0:
            results.append({"vm": 0, "rule": "FORWARD state", "status": "ok", "message": "Regla FORWARD añadida"})
        else:
            results.append({"vm": 0, "rule": "FORWARD state", "status": "error", "message": r.stderr.strip()})
    else:
        results.append({"vm": 0, "rule": "FORWARD state", "status": "ok", "message": "FORWARD ya existe"})
