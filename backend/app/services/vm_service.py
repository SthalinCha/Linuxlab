DEFAULT_PORT_MAP = [
    ("SSH", 2200, 22),
    ("HTTP", 8000, 80),
    ("WEB", 8080, 8081),
    ("Cockpit", 9000, 9090),
    ("FTP", 2100, 21),
]


def build_ports(num: int) -> list[dict]:
    return [
        {"host": base + num, "vm": vm_port, "service": name}
        for name, base, vm_port in DEFAULT_PORT_MAP
    ]
