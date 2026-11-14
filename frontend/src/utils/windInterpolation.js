/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * Spatial Interpolation Engine for Offshore Wind Farms (IDW & Ordinary Kriging)
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
 * IDW (Inverse Distance Weighting) Interpolation
 */
export const computeIDW = (points, options = {}) => {
    const {
        bbox,
        width = 140,
        height = 160,
        power = 2,
        maxDistanceDeg = 1.0
    } = options;

    if (!bbox || !points || points.length === 0) {
        return { values: [], alphas: [], width, height, bbox };
    }

    const [minX, minY, maxX, maxY] = bbox;
    const dx = (maxX - minX) / (width - 1 || 1);
    const dy = (maxY - minY) / (height - 1 || 1);

    const values = [];
    const alphas = [];
    const eps = 1e-6;
    const maxDistSq = maxDistanceDeg * maxDistanceDeg;

    for (let r = 0; r < height; r++) {
        const rowVals = [];
        const rowAlphas = [];
        const y = maxY - r * dy; // Từ trên xuống dưới

        for (let c = 0; c < width; c++) {
            const x = minX + c * dx;

            let weightSum = 0;
            let valSum = 0;
            let minDistSq = Infinity;
            let exactVal = null;

            for (let i = 0; i < points.length; i++) {
                const pt = points[i];
                const dSq = (x - pt.x) * (x - pt.x) + (y - pt.y) * (y - pt.y);
                if (dSq < minDistSq) minDistSq = dSq;

                if (dSq < eps) {
                    exactVal = pt.val;
                    break;
                }

                const w = 1 / Math.pow(Math.sqrt(dSq), power);
                weightSum += w;
                valSum += w * pt.val;
            }

            if (exactVal !== null) {
                rowVals.push(exactVal);
                rowAlphas.push(1.0);
            } else if (weightSum > 0) {
                const z = valSum / weightSum;
                rowVals.push(z);

                // Alpha mask suy giảm theo khoảng cách tới điểm đo gần nhất
                if (minDistSq > maxDistSq) {
                    const decay = Math.max(0, 1 - (Math.sqrt(minDistSq) - maxDistanceDeg) / 0.35);
                    rowAlphas.push(decay);
                } else {
                    rowAlphas.push(1.0);
                }
            } else {
                rowVals.push(null);
                rowAlphas.push(0);
            }
        }
        values.push(rowVals);
        alphas.push(rowAlphas);
    }

    return { values, alphas, width, height, bbox };
};

/**
 * Ordinary Kriging with Local k-Nearest Neighbors
 */
export const computeKriging = (points, options = {}) => {
    const {
        bbox,
        width = 140,
        height = 160,
        kNeighbors = 12,
        range = 1.5,
        nugget = 0.05,
        maxDistanceDeg = 1.0
    } = options;

    if (!bbox || !points || points.length === 0) {
        return { values: [], alphas: [], width, height, bbox };
    }

    const [minX, minY, maxX, maxY] = bbox;
    const dx = (maxX - minX) / (width - 1 || 1);
    const dy = (maxY - minY) / (height - 1 || 1);

    // Tính variance mẫu
    let mean = 0;
    for (let i = 0; i < points.length; i++) mean += points[i].val;
    mean /= points.length || 1;

    let variance = 0;
    for (let i = 0; i < points.length; i++) {
        const diff = points[i].val - mean;
        variance += diff * diff;
    }
    variance = (variance / (points.length || 1)) || 1.0;
    const sill = Math.max(variance, nugget * 1.5);

    // Spherical Variogram
    const semivariogram = (h) => {
        if (h <= 0) return 0;
        if (h >= range) return sill;
        const hr = h / range;
        return nugget + (sill - nugget) * (1.5 * hr - 0.5 * hr * hr * hr);
    };

    // Giải hệ phương trình tuyến tính Gaussian Elimination với Partial Pivoting
    const solveLinear = (A, b) => {
        const n = b.length;
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
            }
            const tmpA = A[i]; A[i] = A[maxRow]; A[maxRow] = tmpA;
            const tmpB = b[i]; b[i] = b[maxRow]; b[maxRow] = tmpB;

            if (Math.abs(A[i][i]) < 1e-12) continue;

            for (let k = i + 1; k < n; k++) {
                const factor = A[k][i] / A[i][i];
                b[k] -= factor * b[i];
                for (let j = i; j < n; j++) {
                    A[k][j] -= factor * A[i][j];
                }
            }
        }

        const x = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            let sum = b[i];
            for (let j = i + 1; j < n; j++) {
                sum -= A[i][j] * x[j];
            }
            x[i] = Math.abs(A[i][i]) > 1e-12 ? sum / A[i][i] : 0;
        }
        return x;
    };

    const values = [];
    const alphas = [];
    const maxDistSq = maxDistanceDeg * maxDistanceDeg;

    for (let r = 0; r < height; r++) {
        const rowVals = [];
        const rowAlphas = [];
        const y = maxY - r * dy;

        for (let c = 0; c < width; c++) {
            const x = minX + c * dx;

            // Tìm k điểm lân cận gần nhất
            const neighbors = points
                .map(p => ({
                    ...p,
                    distSq: (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y)
                }))
                .sort((a, b) => a.distSq - b.distSq)
                .slice(0, Math.min(kNeighbors, points.length));

            if (neighbors.length === 0) {
                rowVals.push(null);
                rowAlphas.push(0);
                continue;
            }

            const minDistSq = neighbors[0].distSq;
            if (minDistSq < 1e-6) {
                rowVals.push(neighbors[0].val);
                rowAlphas.push(1.0);
                continue;
            }

            const k = neighbors.length;
            // Xây dựng ma trận Ordinary Kriging (k + 1) x (k + 1)
            const A = Array.from({ length: k + 1 }, () => new Array(k + 1).fill(0));
            const b = new Array(k + 1).fill(0);

            for (let i = 0; i < k; i++) {
                for (let j = 0; j < k; j++) {
                    const dij = Math.sqrt(
                        (neighbors[i].x - neighbors[j].x) ** 2 +
                        (neighbors[i].y - neighbors[j].y) ** 2
                    );
                    A[i][j] = semivariogram(dij);
                }
                A[i][k] = 1;
                A[k][i] = 1;

                const di0 = Math.sqrt(neighbors[i].distSq);
                b[i] = semivariogram(di0);
            }
            A[k][k] = 0;
            b[k] = 1;

            const weights = solveLinear(A, b);

            let z = 0;
            for (let i = 0; i < k; i++) {
                z += weights[i] * neighbors[i].val;
            }

            rowVals.push(z);

            if (minDistSq > maxDistSq) {
                const decay = Math.max(0, 1 - (Math.sqrt(minDistSq) - maxDistanceDeg) / 0.35);
                rowAlphas.push(decay);
            } else {
                rowAlphas.push(1.0);
            }
        }
        values.push(rowVals);
        alphas.push(rowAlphas);
    }

    return { values, alphas, width, height, bbox };
};

/**
 * Creates an Offscreen Canvas with interpolated values rendered to RGBA pixels
 */
export const createInterpolationCanvas = (features, metricKey = 'predicted_power_mw', method = 'idw', options = {}) => {
    if (!features || features.length === 0) return null;

    const metricConfig = HEATMAP_METRICS[metricKey] || HEATMAP_METRICS.predicted_power_mw;
    const { min, max, gradient } = metricConfig;

    // Trích xuất danh sách điểm hợp lệ
    const points = [];
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    for (let i = 0; i < features.length; i++) {
        const feat = features[i];
        const geom = feat.getGeometry ? feat.getGeometry() : feat.geometry;
        const props = feat.getProperties ? feat.getProperties() : (feat.properties || feat);

        if (!geom) continue;
        const coords = geom.getCoordinates ? geom.getCoordinates() : geom.coordinates;
        if (!coords || coords.length < 2) continue;

        const val = Number(props[metricKey]);
        if (isNaN(val) || val === null || val === undefined) continue;

        // Tọa độ đầu vào (lon, lat)
        let lon = coords[0];
        let lat = coords[1];

        // Nếu tọa độ đang ở EPSG:3857, chuyển về WGS84 EPSG:4326
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
            lon = (lon / 20037508.34) * 180;
            lat = (lat / 20037508.34) * 180;
            lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
        }

        points.push({ x: lon, y: lat, val });
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
    }

    if (points.length === 0) return null;

    // Mở rộng padding 0.15 độ xung quanh
    const pad = 0.15;
    const bbox = [minLon - pad, minLat - pad, maxLon + pad, maxLat + pad];

    const width = options.width || 140;
    const height = options.height || 160;

    const gridResult = method === 'kriging'
        ? computeKriging(points, { bbox, width, height, ...options })
        : computeIDW(points, { bbox, width, height, ...options });

    const { values, alphas } = gridResult;

    // Tạo Canvas
    if (typeof document === 'undefined') {
        return { values, alphas, bbox, width, height };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            const z = values[r][c];
            const alphaRatio = alphas[r][c];
            const pIdx = (r * width + c) * 4;

            if (z === null || alphaRatio <= 0) {
                data[pIdx] = 0;
                data[pIdx + 1] = 0;
                data[pIdx + 2] = 0;
                data[pIdx + 3] = 0;
                continue;
            }

            const normalized = clamp((z - min) / (max - min), 0, 1);
            const [red, green, blue] = getColorAtNormalizedValue(normalized, gradient);

            data[pIdx] = red;
            data[pIdx + 1] = green;
            data[pIdx + 2] = blue;
            data[pIdx + 3] = Math.round(255 * alphaRatio);
        }
    }

    ctx.putImageData(imgData, 0, 0);

    return {
        canvas,
        bbox,
        width,
        height
    };
};

/**
 * Interpolates all wind metrics at a specific coordinate [targetLon, targetLat]
 */
export const interpolatePoint = (features, targetLon, targetLat, method = 'idw', options = {}) => {
    if (!features || features.length === 0) return null;
    const { maxDistanceDeg = 1.2 } = options;

    const validPoints = [];
    let closestPoint = null;
    let minDistanceDeg = Infinity;

    for (let i = 0; i < features.length; i++) {
        const feat = features[i];
        const geom = feat.getGeometry ? feat.getGeometry() : feat.geometry;
        const props = feat.getProperties ? feat.getProperties() : (feat.properties || feat);

        if (!geom) continue;
        const coords = geom.getCoordinates ? geom.getCoordinates() : geom.coordinates;
        if (!coords || coords.length < 2) continue;

        let lon = coords[0];
        let lat = coords[1];

        // Convert EPSG:3857 to EPSG:4326 if needed
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
            lon = (lon / 20037508.34) * 180;
            lat = (lat / 20037508.34) * 180;
            lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
        }

        const distSq = (targetLon - lon) ** 2 + (targetLat - lat) ** 2;
        const distDeg = Math.sqrt(distSq);

        if (distDeg < minDistanceDeg) {
            minDistanceDeg = distDeg;
            closestPoint = { ...props, _lon: lon, _lat: lat };
        }

        validPoints.push({
            x: lon,
            y: lat,
            distSq,
            distDeg,
            power: Number(props.predicted_power_mw) || 0,
            wind: Number(props.wind_speed_100m) || 0,
            depth: Number(props.depth_m) || 0
        });
    }

    if (validPoints.length === 0 || minDistanceDeg > maxDistanceDeg) {
        return null;
    }

    const closestDistanceKm = (minDistanceDeg * 111).toFixed(1);

    // If extremely close to an existing point (within ~50m)
    if (minDistanceDeg < 0.0005 && closestPoint) {
        return {
            predicted_power_mw: Number(closestPoint.predicted_power_mw) || 0,
            wind_speed_100m: Number(closestPoint.wind_speed_100m) || 0,
            depth_m: Number(closestPoint.depth_m) || 0,
            closestPoint,
            closestDistanceKm: '0.0',
            method
        };
    }

    // 1. IDW point calculation
    if (method === 'idw') {
        const powerP = options.power || 2;
        let weightSum = 0;
        let sumPower = 0;
        let sumWind = 0;
        let sumDepth = 0;

        for (let i = 0; i < validPoints.length; i++) {
            const p = validPoints[i];
            const w = 1 / Math.pow(Math.max(p.distDeg, 1e-6), powerP);
            weightSum += w;
            sumPower += w * p.power;
            sumWind += w * p.wind;
            sumDepth += w * p.depth;
        }

        return {
            predicted_power_mw: weightSum > 0 ? sumPower / weightSum : 0,
            wind_speed_100m: weightSum > 0 ? sumWind / weightSum : 0,
            depth_m: weightSum > 0 ? sumDepth / weightSum : 0,
            closestPoint,
            closestDistanceKm,
            method: 'idw'
        };
    }

    // 2. Kriging point calculation
    if (method === 'kriging') {
        const kNeighbors = options.kNeighbors || 12;
        const range = options.range || 1.5;
        const nugget = options.nugget || 0.05;

        // Take k nearest neighbors
        const neighbors = [...validPoints]
            .sort((a, b) => a.distSq - b.distSq)
            .slice(0, Math.min(kNeighbors, validPoints.length));

        const k = neighbors.length;

        // Calculate variance for power
        let meanPower = 0;
        for (let i = 0; i < neighbors.length; i++) meanPower += neighbors[i].power;
        meanPower /= k || 1;
        let variance = 0;
        for (let i = 0; i < neighbors.length; i++) {
            variance += (neighbors[i].power - meanPower) ** 2;
        }
        variance = (variance / (k || 1)) || 1.0;
        const sill = Math.max(variance, nugget * 1.5);

        const semivariogram = (h) => {
            if (h <= 0) return 0;
            if (h >= range) return sill;
            const hr = h / range;
            return nugget + (sill - nugget) * (1.5 * hr - 0.5 * hr * hr * hr);
        };

        const A = Array.from({ length: k + 1 }, () => new Array(k + 1).fill(0));
        const b = new Array(k + 1).fill(0);

        for (let i = 0; i < k; i++) {
            for (let j = 0; j < k; j++) {
                const dij = Math.sqrt(
                    (neighbors[i].x - neighbors[j].x) ** 2 +
                    (neighbors[i].y - neighbors[j].y) ** 2
                );
                A[i][j] = semivariogram(dij);
            }
            A[i][k] = 1;
            A[k][i] = 1;

            const di0 = neighbors[i].distDeg;
            b[i] = semivariogram(di0);
        }
        A[k][k] = 0;
        b[k] = 1;

        // Solve linear system
        const solveLinear = (matA, vecB) => {
            const n = vecB.length;
            const M = matA.map(row => [...row]);
            const B = [...vecB];
            for (let i = 0; i < n; i++) {
                let maxRow = i;
                for (let r = i + 1; r < n; r++) {
                    if (Math.abs(M[r][i]) > Math.abs(M[maxRow][i])) maxRow = r;
                }
                const tmpM = M[i]; M[i] = M[maxRow]; M[maxRow] = tmpM;
                const tmpB = B[i]; B[i] = B[maxRow]; B[maxRow] = tmpB;

                if (Math.abs(M[i][i]) < 1e-12) continue;

                for (let r = i + 1; r < n; r++) {
                    const factor = M[r][i] / M[i][i];
                    B[r] -= factor * B[i];
                    for (let c = i; c < n; c++) {
                        M[r][c] -= factor * M[i][c];
                    }
                }
            }

            const res = new Array(n).fill(0);
            for (let i = n - 1; i >= 0; i--) {
                let sum = B[i];
                for (let c = i + 1; c < n; c++) {
                    sum -= M[i][c] * res[c];
                }
                res[i] = Math.abs(M[i][i]) > 1e-12 ? sum / M[i][i] : 0;
            }
            return res;
        };

        const weights = solveLinear(A, b);

        let predPower = 0;
        let predWind = 0;
        let predDepth = 0;

        for (let i = 0; i < k; i++) {
            predPower += weights[i] * neighbors[i].power;
            predWind += weights[i] * neighbors[i].wind;
            predDepth += weights[i] * neighbors[i].depth;
        }

        return {
            predicted_power_mw: Math.max(0, predPower),
            wind_speed_100m: Math.max(0, predWind),
            depth_m: Math.max(0, predDepth),
            closestPoint,
            closestDistanceKm,
            method: 'kriging'
        };
    }

    return null;
};

export default {
    parseHexColor,
    getColorAtNormalizedValue,
    computeIDW,
    computeKriging,
    createInterpolationCanvas,
    interpolatePoint
};
