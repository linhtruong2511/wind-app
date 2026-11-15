import os
import re
from datetime import datetime, timezone

# 2021-01-01_06, 20210101_06, 2021-01-01_06:00:00, wrfout_d01_2021-01-01_06:00:00
_SEPARATED = re.compile(r"(?<!\d)(\d{4})-?(\d{2})-?(\d{2})[_T ](\d{2})(?::?(\d{2}))?(?::?\d{2})?(?!\d)")
# 2021010106 (năm, tháng, ngày, giờ) hoặc 202101010630 (thêm phút)
_COMPACT = re.compile(r"(?<!\d)(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})?(?!\d)")


def parse_time_from_filename(name):
    """Trả về mốc giờ UTC suy ra từ tên tệp, hoặc None nếu tên không có mốc giờ hợp lệ."""
    stem = os.path.splitext(os.path.basename(name or ""))[0]
    for pattern in (_SEPARATED, _COMPACT):
        match = pattern.search(stem)
        if not match:
            continue
        year, month, day, hour, minute = (int(group) if group else 0 for group in match.groups())
        try:
            return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
        except ValueError:
            continue
    return None
