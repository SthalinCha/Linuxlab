from datetime import date, datetime


def get_period_code(ref_date: date | None = None) -> str:
    if ref_date is None:
        ref_date = date.today()

    month = ref_date.month
    year = ref_date.year

    if 3 <= month <= 8:
        period_type = 0
    elif month <= 2:
        period_type = 1
        year -= 1
    else:
        period_type = 1

    base = 1992
    number = (year - base) * 2 + period_type

    if number < 1:
        number = 1

    return f"P{number}"


def get_period_type(ref_date: date | None = None) -> str:
    if ref_date is None:
        ref_date = date.today()
    month = ref_date.month
    return 'even' if 3 <= month <= 8 else 'odd'


def period_dates(code: str) -> tuple[datetime, datetime]:
    number = int(code[1:])

    base = 1992
    year = base + number // 2
    is_even = number % 2 == 0

    if is_even:
        start = datetime(year, 3, 1)
        end = datetime(year, 8, 31)
    else:
        start = datetime(year, 10, 1)
        end_year = year + 1
        if end_year % 4 == 0 and (end_year % 100 != 0 or end_year % 400 == 0):
            end = datetime(end_year, 2, 29)
        else:
            end = datetime(end_year, 2, 28)

    return start, end


def display_name(code: str) -> str:
    num = code[1:]
    return f"Per\u00edodo {num}"
