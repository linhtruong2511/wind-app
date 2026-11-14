/*
 * Copyright 2026, GeoNode Project.
 * Wind Grid Heatmap Canvas Rendering Engine
 */

/**
 * Maps wind speed (m/s) to HSL color string with smooth gradient
 * 0 m/s -> Blue (hue 240)
 * 12.5 m/s -> Green/Yellow (hue 120-60)
 * 25+ m/s -> Red/Purple (hue 0)
 */
export const getColorForSpeed = (speed, maxSpeed = 25, opacity = 0.55) => {
    if (speed === null || speed === undefined || isNaN(speed)) {
        return 'rgba(0, 0, 0, 0)';
    }
    const s = Math.min(maxSpeed, Math.max(0, speed));
    const ratio = s / maxSpeed;
    const hue = Math.max(0, Math.round(240 - ratio * 240));
    return `hsla(${hue}, 85%, 50%, ${opacity})`;
};

/**
 * Pre-computes speeds matrix and returns offscreen canvas representing the grid
 */
export const createOffscreenHeatmapCanvas = (gridData, maxSpeed = 25, opacity = 0.6) => {
    if (!gridData || !gridData.lats || !gridData.lons) {
        return null;
    }

    const { lats, lons, u, v } = gridData;
    const nx = lons.length;
    const ny = lats.length;

    if (nx === 0 || ny === 0) {
        return null;
    }

    const hasU = Array.isArray(u) && u.length > 0;
    const hasV = Array.isArray(v) && v.length > 0;

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = nx;
    offscreenCanvas.height = ny;
    const ctx = offscreenCanvas.getContext('2d');

    if (!ctx) return null;

    const imgData = ctx.createImageData(nx, ny);
    const data = imgData.data;

    // Check if lat is descending or ascending
    const isLatDesc = lats[0] > lats[ny - 1];

    for (let r = 0; r < ny; r++) {
        const rowIdx = isLatDesc ? r : (ny - 1 - r);
        for (let c = 0; c < nx; c++) {
            const uVal = hasU && u[rowIdx] ? (u[rowIdx][c] || 0) : 0;
            const vVal = hasV && v[rowIdx] ? (v[rowIdx][c] || 0) : 0;

            let speed = 0;
            if (hasU && hasV) {
                speed = Math.sqrt(uVal * uVal + vVal * vVal);
            } else {
                speed = hasU ? Math.abs(uVal) : Math.abs(vVal);
            }

            const s = Math.min(maxSpeed, Math.max(0, speed));
            const ratio = s / maxSpeed;
            const hue = Math.max(0, 240 - ratio * 240);

            // Convert HSL to RGB
            const hNorm = hue / 360;
            const sNorm = 0.85;
            const lNorm = 0.50;

            const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
            const p = 2 * lNorm - q;

            const hue2rgb = (pVal, qVal, tVal) => {
                let t = tVal;
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return pVal + (qVal - pVal) * 6 * t;
                if (t < 1 / 2) return qVal;
                if (t < 2 / 3) return pVal + (qVal - pVal) * (2 / 3 - t) * 6;
                return pVal;
            };

            const red = Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255);
            const green = Math.round(hue2rgb(p, q, hNorm) * 255);
            const blue = Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255);
            const alpha = Math.round(opacity * 255);

            const pixelIdx = (r * nx + c) * 4;
            data[pixelIdx] = red;
            data[pixelIdx + 1] = green;
            data[pixelIdx + 2] = blue;
            data[pixelIdx + 3] = alpha;
        }
    }

    ctx.putImageData(imgData, 0, 0);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    return {
        canvas: offscreenCanvas,
        bounds: { minLat, maxLat, minLon, maxLon },
        nx,
        ny
    };
};

export default {
    getColorForSpeed,
    createOffscreenHeatmapCanvas
};
