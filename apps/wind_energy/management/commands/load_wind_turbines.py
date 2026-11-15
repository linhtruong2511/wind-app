import json
from pathlib import Path

from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Sum

from wind_energy.models import WindFarm, WindTurbine

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "fixtures" / "wind_turbines_vbb.json"

# Mỗi vùng biển tương ứng một trang trại
ZONE_FARMS = {
    "Bắc Vịnh Bắc Bộ": ("VBB_BAC", "Khu vực khảo sát Bắc Vịnh Bắc Bộ"),
    "Trung Vịnh Bắc Bộ": ("VBB_TRUNG", "Khu vực khảo sát Trung Vịnh Bắc Bộ"),
    "Nam Vịnh Bắc Bộ": ("VBB_NAM", "Khu vực khảo sát Nam Vịnh Bắc Bộ"),
}


class Command(BaseCommand):
    help = "Nạp danh sách điểm đặt tuabin gió ngoài khơi Vịnh Bắc Bộ từ tệp JSON vào cơ sở dữ liệu."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=str(DEFAULT_FILE), help="Đường dẫn tệp JSON.")
        parser.add_argument(
            "--clear", action="store_true", help="Xóa tuabin hiện có của các trang trại khảo sát trước khi nạp."
        )

    @transaction.atomic
    def handle(self, *args, **options):
        path = Path(options["file"])
        if not path.exists():
            raise CommandError(f"Không tìm thấy tệp: {path}")
        with path.open(encoding="utf-8") as fh:
            items = json.load(fh)

        farms = {}
        for zone, (code, name) in ZONE_FARMS.items():
            farm, _ = WindFarm.objects.get_or_create(
                code=code,
                defaults={"name": name, "location_name": zone, "status": "ASSESSMENT"},
            )
            farms[zone] = farm

        if options["clear"]:
            deleted, _ = WindTurbine.objects.filter(farm__in=farms.values()).delete()
            self.stdout.write(f"Đã xóa {deleted} tuabin cũ.")

        created = updated = skipped = 0
        for item in items:
            farm = farms.get(item.get("zone"))
            if farm is None:
                skipped += 1
                continue
            lon, lat = float(item["longitude"]), float(item["latitude"])
            _, is_new = WindTurbine.objects.update_or_create(
                farm=farm,
                point_id=item["point_id"],
                defaults={
                    "name": item.get("name", ""),
                    "zone": item["zone"],
                    "geom": Point(lon, lat, srid=4326),
                    "latitude": lat,
                    "longitude": lon,
                    "wind_speed_100m": item.get("wind_speed_100m"),
                    "wind_direction": item.get("wind_direction"),
                    "sea_depth": item["depth_m"],
                    "predicted_power_mw": item["predicted_power_mw"],
                    "capacity_factor": item.get("capacity_factor"),
                    "status": "PROPOSED",
                },
            )
            if is_new:
                created += 1
            else:
                updated += 1

        for farm in farms.values():
            total = farm.turbines.aggregate(total=Sum("predicted_power_mw"))["total"]
            farm.total_capacity_mw = round(total, 2) if total is not None else None
            farm.save(update_fields=["total_capacity_mw", "updated_at"])

        self.stdout.write(
            self.style.SUCCESS(f"Hoàn tất: tạo mới {created}, cập nhật {updated}, bỏ qua {skipped} điểm.")
        )
