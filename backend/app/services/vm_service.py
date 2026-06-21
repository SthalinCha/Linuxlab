from app.services.config_service import get_port_map


def build_ports(num: int) -> list[dict]:
    return [
        {"host": base + num, "vm": vm_port, "service": name}
        for name, base, vm_port in get_port_map()
    ]
