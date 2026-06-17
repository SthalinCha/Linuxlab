import re


def num_from_name(name: str) -> int:
    match = re.search(r'\d+', name)
    if match:
        return int(match.group())
    return 0
