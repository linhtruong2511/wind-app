/*
 * Copyright 2026, GeoNode Project.
 * OpenLayers Canvas Wind Particle Flow Animation Engine
 */

export class WindParticleEngine {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.options = {
            numParticles: 2000,
            maxAge: 80,
            velocityScale: 0.005,
            particleLineWidth: 1.6,
            fadeOpacity: 0.93,
            color: 'rgba(255, 255, 255, 0.85)',
            ...options
        };

        this.gridData = null;
        this.particles = [];
        this.animationFrameId = null;
        this.isRunning = false;
        this.projectFn = null; // (lon, lat) => [px, py]
        this.unprojectFn = null; // (px, py) => [lon, lat]
    }

    setProjections(projectFn, unprojectFn) {
        this.projectFn = projectFn;
        this.unprojectFn = unprojectFn;
        if (this.isRunning && this.gridData) {
            this.restart();
        }
    }

    setData(gridData) {
        this.gridData = gridData;
        if (gridData && gridData.lats && gridData.lons && gridData.u && gridData.v) {
            this.minLat = Math.min(...gridData.lats);
            this.maxLat = Math.max(...gridData.lats);
            this.minLon = Math.min(...gridData.lons);
            this.maxLon = Math.max(...gridData.lons);
            this.nx = gridData.lons.length;
            this.ny = gridData.lats.length;
            this.initParticles();
            if (this.isRunning) {
                this.restart();
            }
        } else {
            this.particles = [];
            this.clear();
        }
    }

    setOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
        if (newOptions.numParticles && this.particles.length !== newOptions.numParticles) {
            this.initParticles();
        }
    }

    initParticles() {
        if (!this.canvas) return;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const count = this.options.numParticles || 2000;

        this.particles = [];
        for (let i = 0; i < count; i++) {
            this.particles.push(this.createParticle(width, height));
        }
    }

    createParticle(width, height) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const maxAge = Math.floor(Math.random() * (this.options.maxAge || 80)) + 20;
        return {
            x,
            y,
            oldX: x,
            oldY: y,
            age: Math.floor(Math.random() * maxAge),
            maxAge
        };
    }

    interpolateWind(lon, lat) {
        if (!this.gridData || lon < this.minLon || lon > this.maxLon || lat < this.minLat || lat > this.maxLat) {
            return null;
        }

        const { lats, u, v } = this.gridData;
        const fx = ((lon - this.minLon) / (this.maxLon - this.minLon)) * (this.nx - 1);
        const isLatDesc = lats[0] > lats[this.ny - 1];
        const fy = isLatDesc
            ? ((this.maxLat - lat) / (this.maxLat - this.minLat)) * (this.ny - 1)
            : ((lat - this.minLat) / (this.maxLat - this.minLat)) * (this.ny - 1);

        const x0 = Math.floor(fx);
        const x1 = Math.min(x0 + 1, this.nx - 1);
        const y0 = Math.floor(fy);
        const y1 = Math.min(y0 + 1, this.ny - 1);

        const dx = fx - x0;
        const dy = fy - y0;

        const getVal = (matrix, r, c) => {
            return (matrix && matrix[r] && matrix[r][c] !== undefined && matrix[r][c] !== null) ? matrix[r][c] : 0;
        };

        const u00 = getVal(u, y0, x0);
        const u10 = getVal(u, y0, x1);
        const u01 = getVal(u, y1, x0);
        const u11 = getVal(u, y1, x1);

        const v00 = getVal(v, y0, x0);
        const v10 = getVal(v, y0, x1);
        const v01 = getVal(v, y1, x0);
        const v11 = getVal(v, y1, x1);

        const uVal = (1 - dx) * (1 - dy) * u00 + dx * (1 - dy) * u10 + (1 - dx) * dy * u01 + dx * dy * u11;
        const vVal = (1 - dx) * (1 - dy) * v00 + dx * (1 - dy) * v10 + (1 - dx) * dy * v01 + dx * dy * v11;
        const speed = Math.sqrt(uVal * uVal + vVal * vVal);

        return { u: uVal, v: vVal, speed };
    }

    step() {
        this.animationFrameId = null;
        if (!this.ctx || !this.isRunning || !this.gridData || !this.unprojectFn) {
            return;
        }

        const width = this.canvas.width;
        const height = this.canvas.height;
        const ctx = this.ctx;

        // Trail fading
        ctx.fillStyle = `rgba(0, 0, 0, ${this.options.fadeOpacity})`;
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';

        ctx.lineWidth = this.options.particleLineWidth || 1.6;
        ctx.lineCap = 'round';

        const scale = (this.options.velocityScale || 0.005) * 100;

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];

            if (p.age >= p.maxAge || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
                this.particles[i] = this.createParticle(width, height);
                continue;
            }

            const geoCoord = this.unprojectFn(p.x, p.y);
            if (!geoCoord) {
                p.age = p.maxAge;
                continue;
            }

            const wind = this.interpolateWind(geoCoord[0], geoCoord[1]);
            if (!wind || (wind.u === 0 && wind.v === 0)) {
                p.age = p.maxAge;
                continue;
            }

            p.oldX = p.x;
            p.oldY = p.y;

            // Step in screen pixels based on wind components (u: east +, v: north - in screen coords)
            p.x += wind.u * scale;
            p.y -= wind.v * scale;
            p.age += 1;

            // Speed-based color
            const speedRatio = Math.min(1, wind.speed / 25);
            const hue = Math.max(0, Math.round(240 - speedRatio * 240));
            const alpha = (1 - (p.age / p.maxAge)) * 0.9;

            ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(p.oldX, p.oldY);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        }

        if (this.isRunning) {
            this.animationFrameId = requestAnimationFrame(() => this.step());
        }
    }

    start() {
        this.isRunning = true;
        if (!this.animationFrameId && this.gridData && this.unprojectFn) {
            this.step();
        }
    }

    restart() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.isRunning && this.gridData && this.unprojectFn) {
            this.step();
        }
    }

    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    clear() {
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    resize(width, height) {
        if (this.canvas) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.initParticles();
            if (this.isRunning && this.gridData) {
                this.restart();
            }
        }
    }

    destroy() {
        this.stop();
        this.clear();
        this.particles = [];
        this.gridData = null;
    }
}

export default WindParticleEngine;

