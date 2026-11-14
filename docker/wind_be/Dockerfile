FROM geonode/geonode-base:latest-ubuntu-26.04

ENV LC_ALL=C.UTF-8 \
    LANG=C.UTF-8 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /usr/src/apps

# Cập nhật pip và công cụ build cơ bản
RUN python -m pip install --no-cache-dir -U pip setuptools wheel

# Cài đặt requirements trước để tận dụng Docker layer cache
COPY apps/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Sao chép mã nguồn apps vào image
COPY apps/ /usr/src/apps/

EXPOSE 8001
