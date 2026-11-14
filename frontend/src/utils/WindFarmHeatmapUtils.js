/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * Tiện ích hỗ trợ cấu hình và chuẩn hóa trọng số cho Heatmap trang trại gió Vịnh Bắc Bộ
 */

export const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

export const HEATMAP_METRICS = {
    predicted_power_mw: {
        id: 'predicted_power_mw',
        label: 'Công suất dự báo',
        unit: 'MW',
        icon: 'fa-bolt',
        min: 0,
        max: 60,
        ticks: ['0 MW', '15 MW', '30 MW', '45 MW', '≥ 60 MW'],
        gradient: ['#fef08a', '#facc15', '#f97316', '#ef4444', '#991b1b']
    },
    wind_speed_100m: {
        id: 'wind_speed_100m',
        label: 'Tốc độ gió ở 100 m',
        unit: 'm/s',
        icon: 'fa-dashboard',
        min: 4.0,
        max: 11.0,
        ticks: ['4 m/s', '6 m/s', '8 m/s', '10 m/s', '≥ 11 m/s'],
        gradient: ['#67e8f9', '#38bdf8', '#3b82f6', '#facc15', '#ef4444']
    },
    depth_m: {
        id: 'depth_m',
        label: 'Độ sâu địa hình',
        unit: 'm',
        icon: 'fa-tint',
        min: 10,
        max: 100,
        ticks: ['10 m, nông', '30 m', '50 m, móng cố định', '75 m', '≥ 100 m, sâu'],
        gradient: ['#a5f3fc', '#38bdf8', '#0284c7', '#1e3a8a', '#312e81']
    }
};

export const getHeatmapWeight = (feature, metricKey = 'predicted_power_mw') => {
    if (!feature) return 0.05;
    const props = feature.getProperties ? feature.getProperties() : feature;
    const metricConfig = HEATMAP_METRICS[metricKey] || HEATMAP_METRICS.predicted_power_mw;

    const rawVal = Number(props[metricKey]);
    if (isNaN(rawVal) || rawVal === null || rawVal === undefined) {
        return 0.05;
    }

    const { min, max } = metricConfig;
    const normalized = (rawVal - min) / (max - min);
    return clamp(normalized, 0.05, 1.0);
};

export default {
    clamp,
    HEATMAP_METRICS,
    getHeatmapWeight
};
