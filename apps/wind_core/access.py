from django.db.models import Q

from wind_core.models import Dataset, DatasetAccessPolicy


def is_staff_user(user):
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


def _group_ids(user):
    return list(user.groups.values_list("id", flat=True))


def accessible_datasets(user, queryset=None):
    """Các bộ dữ liệu mà người dùng được phép xem. Quản trị viên xem được tất cả."""
    datasets = Dataset.objects.all() if queryset is None else queryset
    if is_staff_user(user):
        return datasets

    condition = Q(access_level="PUBLIC")
    if user is not None and user.is_authenticated:
        allowed = DatasetAccessPolicy.objects.filter(group_id__in=_group_ids(user), can_view=True)
        condition |= Q(access_level="INTERNAL")
        condition |= Q(access_level="RESTRICTED", id__in=allowed.values("dataset_id"))
    return datasets.filter(condition)


def can_download_dataset(user, dataset):
    """Quyền tải về một bộ dữ liệu. Chưa có API tải về nào gọi hàm này, dùng khi bổ sung API đó."""
    if is_staff_user(user):
        return True
    if dataset.access_level == "PUBLIC":
        return True
    if user is None or not user.is_authenticated:
        return False
    if dataset.access_level == "INTERNAL":
        return True
    return DatasetAccessPolicy.objects.filter(
        dataset=dataset, group_id__in=_group_ids(user), can_download=True
    ).exists()
