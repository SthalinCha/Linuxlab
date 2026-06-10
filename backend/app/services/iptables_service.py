import subprocess
from typing import Optional
from app.config import VM_SUBNET, get_host_ip
from app.services.vm_service import DEFAULT_PORT_MAP

# Alias para compatibilidad interna
PORT_MAP = DEFAULT_PORT_MAP


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


def _vm_rules(num: int) -> list[tuple[list[str], str]]:
    host_ip = get_host_ip()
    dest = f"{VM_SUBNET}.{num}"
    rules = []
    for name, base, vm_port in PORT_MAP:
        host_port = base + num
        rules.append(
            (["-p", "tcp", "-d", host_ip, "--dport", str(host_port), "-j", "DNAT", "--to-destination", f"{dest}:{vm_port}"],
             f"{name} vhost-{num} (:{host_port} → {dest}:{vm_port})")
        )
    # Reglas locales para ADMIN (Cockpit)
    admin_port = PORT_MAP[3][1] + num
    rules.append(
        (["-p", "tcp", "-d", "127.0.0.1", "--dport", str(admin_port), "-j", "DNAT", "--to-destination", f"{dest}:9090"],
         f"ADMIN vhost-{num} localhost")
    )
    rules.append(
        (["-p", "tcp", "-d", host_ip, "--dport", str(admin_port), "-j", "DNAT", "--to-destination", f"{dest}:9090"],
         f"ADMIN vhost-{num} local IP")
    )
    return rules


def forward_port(dest_ip: str, host_port: int, vm_port: int, desc: str) -> tuple[bool, str]:
    args = ["-p", "tcp", "-d", get_host_ip(), "--dport", str(host_port),
            "-j", "DNAT", "--to-destination", f"{dest_ip}:{vm_port}"]
    return _add_rule("nat", "PREROUTING", args)


def unforward_port(dest_ip: str, host_port: int, vm_port: int, desc: str) -> tuple[bool, str]:
    args = ["-p", "tcp", "-d", get_host_ip(), "--dport", str(host_port),
            "-j", "DNAT", "--to-destination", f"{dest_ip}:{vm_port}"]
    return _del_rule("nat", "PREROUTING", args)


def forward_range(from_num: int, to_num: int) -> dict:
    results = []
    _ensure_forwarding(results)
    for n in range(from_num, to_num + 1):
        for args, desc in _vm_rules(n):
            ok, msg = _add_rule("nat", "PREROUTING", args)
            results.append({"vm": n, "rule": desc, "status": "ok" if ok else "error", "message": msg})
    return {"success": True, "results": results, "total": len(results)}


def unforward_range(from_num: int, to_num: int) -> dict:
    results = []
    for n in range(from_num, to_num + 1):
        for args, desc in _vm_rules(n):
            ok, msg = _del_rule("nat", "PREROUTING", args)
            results.append({"vm": n, "rule": desc, "status": "ok" if ok else "error", "message": msg})
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
