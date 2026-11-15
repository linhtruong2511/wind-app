/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * Tô màu lưới nội suy do máy chủ tính (IDW và Kriging) thành ảnh để phủ lên bản đồ.
 * Việc tính nội suy nằm ở máy chủ, xem getInterpolationGrid trong api/wind.js.
 */

import { HEATMAP_METRICS, clamp } from './WindFarmHeatmapUtils';

export const parseHexColor = (hex) => {
    let clean = (hex || '#000000').replace('#', '');
    if (clean.length === 3) {
        clean = clean.split('').map(c => c + c).join('');
    }
    const num = parseInt(clean, 16);
    return [
        (num >> 16) & 255,
        (num >> 8) & 255,
        num & 255
    ];
};

export const getColorAtNormalizedValue = (ratio, gradient) => {
    if (!gradient || gradient.length === 0) return [0, 0, 0, 0];
    const r = clamp(ratio, 0, 1);
    const n = gradient.length - 1;
    const index = r * n;
    const lowIdx = Math.floor(index);
    const highIdx = Math.min(n, lowIdx + 1);
    const fraction = index - lowIdx;

    const c1 = parseHexColor(gradient[lowIdx]);
    const c2 = parseHexColor(gradient[highIdx]);

    return [
        Math.round(c1[0] + (c2[0] - c1[0]) * fraction),
        Math.round(c1[1] + (c2[1] - c1[1]) * fraction),
        Math.round(c1[2] + (c2[2] - c1[2]) * fraction),
        255
    ];
};

/**
 * Tô màu lưới nội suy thành ảnh.
 *
 * grid là kết quả của getInterpolationGrid: values và alphas là mảng phẳng theo hàng, từ bắc xuống nam;
 * giá trị null là ô trống, alphas có giá trị từ 0 đến 255.
 * Trả về { canvas, bbox, width, height }, hoặc null nếu lưới không hợp lệ.
 */
export const createInterpolationCanvas = (grid, metricKey = 'predicted_power_mw') => {
    if (!grid || !Array.isArray(grid.values) || !Array.isArray(grid.alphas) || !grid.bbox) return null;
    const { values, alphas, bbox, width, height } = grid;
    if (values.length !== width * height || alphas.length !== values.length) return null;

    const { min, max, gradient } = HEATMAP_METRICS[metricKey] || HEATMAP_METRICS.predicted_power_mw;

    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let i = 0; i < values.length; i++) {
        const z = values[i];
        const alpha = alphas[i];
        if (z === null || z === undefined || alpha <= 0) continue; // giữ nguyên ô trong suốt

        const [red, green, blue] = getColorAtNormalizedValue((z - min) / (max - min), gradient);
        const p = i * 4;
        data[p] = red;
        data[p + 1] = green;
        data[p + 2] = blue;
        data[p + 3] = alpha;
    }

    ctx.putImageData(imgData, 0, 0);

    return { canvas, bbox, width, height };
};

export default {
    parseHexColor,
    getColorAtNormalizedValue,
    createInterpolationCanvas
};
