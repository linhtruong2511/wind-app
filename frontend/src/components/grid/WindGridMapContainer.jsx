/*
 * Copyright 2026, GeoNode Project.
 * OpenLayers Wind Grid Full Map Container
 */

import React, { useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';

import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import { defaults as defaultControls, ScaleLine, FullScreen } from 'ol/control';

import { createOffscreenHeatmapCanvas } from './WindHeatmapCanvas';
import { WindParticleEngine } from './WindParticleEngine';
import { getStationsMap } from '../../api/wind';

const DEFAULT_CENTER = [107.5, 17.5]; // Longitude, Latitude (Vietnam / East Sea area)
const DEFAULT_ZOOM = 6;

const WindGridMapContainer = ({
    gridData = null,
    loading = false,
    layerSettings = {
        showHeatmap: true,
        heatmapOpacity: 0.6,
        showParticles: true,
        particleSpeed: 0.005,
        showStations: false
    },
    onHoverGrid = () => {},
    onMouseMove = () => {},
    onClickPoint = () => {}
}) => {
    const mapTargetRef = useRef(null);
    const heatmapCanvasRef = useRef(null);
    const particleCanvasRef = useRef(null);

    const mapInstanceRef = useRef(null);
    const vectorSourceRef = useRef(null);
    const vectorLayerRef = useRef(null);
    const particleEngineRef = useRef(null);
    const offscreenHeatmapRef = useRef(null);

    // Keep latest props in refs for event listeners
    const gridDataRef = useRef(gridData);
    gridDataRef.current = gridData;

    const layerSettingsRef = useRef(layerSettings);
    layerSettingsRef.current = layerSettings;

    const onHoverGridRef = useRef(onHoverGrid);
    onHoverGridRef.current = onHoverGrid;

    const onMouseMoveRef = useRef(onMouseMove);
    onMouseMoveRef.current = onMouseMove;

    const onClickPointRef = useRef(onClickPoint);
    onClickPointRef.current = onClickPoint;

    // Helper: Redraw Heatmap on the heatmap canvas based on current map extent
    const renderHeatmap = useCallback(() => {
        const map = mapInstanceRef.current;
        const canvas = heatmapCanvasRef.current;
        const offscreenData = offscreenHeatmapRef.current;
        const settings = layerSettingsRef.current;

        if (!map || !canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!settings.showHeatmap || !offscreenData || !offscreenData.canvas || !offscreenData.bounds) {
            return;
        }

        const { minLon, maxLon, minLat, maxLat } = offscreenData.bounds;

        const pNW = map.getPixelFromCoordinate(fromLonLat([minLon, maxLat]));
        const pSE = map.getPixelFromCoordinate(fromLonLat([maxLon, minLat]));

        if (!pNW || !pSE) return;

        const x1 = pNW[0];
        const y1 = pNW[1];
        const width = pSE[0] - pNW[0];
        const height = pSE[1] - pNW[1];

        ctx.save();
        ctx.globalAlpha = settings.heatmapOpacity !== undefined ? settings.heatmapOpacity : 0.6;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(offscreenData.canvas, x1, y1, width, height);
        ctx.restore();
    }, []);

    // 1. Initialize OpenLayers Map & Canvases
    useEffect(() => {
        if (!mapTargetRef.current) {
            return () => {};
        }

        const initialWidth = mapTargetRef.current.clientWidth || 800;
        const initialHeight = mapTargetRef.current.clientHeight || 600;
        if (heatmapCanvasRef.current) {
            heatmapCanvasRef.current.width = initialWidth;
            heatmapCanvasRef.current.height = initialHeight;
        }
        if (particleCanvasRef.current) {
            particleCanvasRef.current.width = initialWidth;
            particleCanvasRef.current.height = initialHeight;
        }

        const vectorSource = new VectorSource();
        vectorSourceRef.current = vectorSource;

        const vectorLayer = new VectorLayer({
            source: vectorSource,
            visible: !!layerSettingsRef.current.showStations,
            style: new Style({
                image: new CircleStyle({
                    radius: 5,
                    fill: new Fill({ color: '#10b981' }),
                    stroke: new Stroke({ color: '#ffffff', width: 2 })
                })
            }),
            zIndex: 30
        });
        vectorLayerRef.current = vectorLayer;

        const map = new Map({
            target: mapTargetRef.current,
            layers: [
                new TileLayer({
                    source: new OSM()
                }),
                vectorLayer
            ],
            view: new View({
                center: fromLonLat(DEFAULT_CENTER),
                zoom: DEFAULT_ZOOM,
                minZoom: 4,
                maxZoom: 18
            }),
            controls: defaultControls({
                zoom: true,
                attribution: true
            }).extend([
                new ScaleLine({ units: 'metric' }),
                new FullScreen()
            ])
        });
        mapInstanceRef.current = map;

        // Initialize Particle Engine on particle canvas
        if (particleCanvasRef.current) {
            const engine = new WindParticleEngine(particleCanvasRef.current, {
                velocityScale: layerSettingsRef.current.particleSpeed || 0.005
            });

            engine.setProjections(
                (lon, lat) => map.getPixelFromCoordinate(fromLonLat([lon, lat])),
                (px, py) => {
                    const coord = map.getCoordinateFromPixel([px, py]);
                    return coord ? toLonLat(coord) : null;
                }
            );

            particleEngineRef.current = engine;
        }

        // Synchronize Canvases on Map Resize & Pan/Zoom
        const syncSize = () => {
            const size = map.getSize();
            if (size && size[0] && size[1]) {
                if (heatmapCanvasRef.current) {
                    heatmapCanvasRef.current.width = size[0];
                    heatmapCanvasRef.current.height = size[1];
                }
                if (particleCanvasRef.current) {
                    particleCanvasRef.current.width = size[0];
                    particleCanvasRef.current.height = size[1];
                    if (particleEngineRef.current) {
                        particleEngineRef.current.resize(size[0], size[1]);
                    }
                }
                renderHeatmap();
            }
        };

        map.on('change:size', syncSize);
        map.on('postrender', renderHeatmap);

        map.on('movestart', () => {
            if (particleEngineRef.current) {
                particleEngineRef.current.clear();
            }
        });

        // Pointer move event: calculate interpolated wind value
        map.on('pointermove', (evt) => {
            if (evt.dragging) return;

            const lonLat = toLonLat(evt.coordinate);
            const lng = lonLat[0];
            const lat = lonLat[1];

            onMouseMoveRef.current({ lat, lng });

            const data = gridDataRef.current;
            if (!data || !data.lats || !data.lons || !data.u || !data.v) {
                onHoverGridRef.current(null);
                return;
            }

            const { lats, lons, u, v } = data;
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLon = Math.min(...lons);
            const maxLon = Math.max(...lons);

            if (lng < minLon || lng > maxLon || lat < minLat || lat > maxLat) {
                onHoverGridRef.current(null);
                return;
            }

            // Find closest matrix indices
            let closestR = 0;
            let minLatDiff = Infinity;
            for (let r = 0; r < lats.length; r++) {
                const diff = Math.abs(lats[r] - lat);
                if (diff < minLatDiff) {
                    minLatDiff = diff;
                    closestR = r;
                }
            }

            let closestC = 0;
            let minLonDiff = Infinity;
            for (let c = 0; c < lons.length; c++) {
                const diff = Math.abs(lons[c] - lng);
                if (diff < minLonDiff) {
                    minLonDiff = diff;
                    closestC = c;
                }
            }

            const uVal = u[closestR] ? u[closestR][closestC] : 0;
            const vVal = v[closestR] ? v[closestR][closestC] : 0;

            if (uVal === undefined || uVal === null) {
                onHoverGridRef.current(null);
                return;
            }

            const speed = Math.sqrt(uVal * uVal + vVal * vVal);
            const directionDeg = Math.round((Math.atan2(-uVal, -vVal) * 180 / Math.PI + 360) % 360);

            onHoverGridRef.current({
                speed,
                directionDeg,
                lat: lats[closestR],
                lon: lons[closestC]
            });
        });

        // Single click event
        map.on('singleclick', (evt) => {
            const lonLat = toLonLat(evt.coordinate);
            onClickPointRef.current({ lat: lonLat[1], lng: lonLat[0] });
        });

        // Initial sync
        setTimeout(syncSize, 100);

        // Load station markers
        getStationsMap()
            .then(res => {
                if (res && res.type === 'FeatureCollection' && vectorSourceRef.current) {
                    const format = new GeoJSON({ featureProjection: 'EPSG:3857' });
                    const features = format.readFeatures(res);
                    vectorSourceRef.current.clear();
                    vectorSourceRef.current.addFeatures(features);
                }
            })
            .catch(err => {
                console.error('Error fetching stations for grid overlay:', err);
            });

        return () => {
            if (particleEngineRef.current) {
                particleEngineRef.current.destroy();
            }
            map.setTarget(null);
        };
    }, [renderHeatmap]);

    // 2. Handle Grid Data Changes (Rebuild Heatmap Offscreen & Update Particle Engine)
    useEffect(() => {
        if (gridData && gridData.lats && gridData.lons) {
            const offscreen = createOffscreenHeatmapCanvas(gridData, 25, 0.6);
            offscreenHeatmapRef.current = offscreen;
            renderHeatmap();

            if (particleEngineRef.current) {
                particleEngineRef.current.setData(gridData);
                if (layerSettings.showParticles) {
                    particleEngineRef.current.start();
                }
            }
        } else {
            offscreenHeatmapRef.current = null;
            renderHeatmap();
            if (particleEngineRef.current) {
                particleEngineRef.current.setData(null);
                particleEngineRef.current.stop();
            }
        }
    }, [gridData, renderHeatmap, layerSettings.showParticles]);

    // 3. Handle Layer Settings Changes
    useEffect(() => {
        renderHeatmap();

        if (particleEngineRef.current) {
            particleEngineRef.current.setOptions({
                velocityScale: layerSettings.particleSpeed || 0.005
            });
            if (layerSettings.showParticles) {
                particleEngineRef.current.start();
            } else {
                particleEngineRef.current.stop();
                particleEngineRef.current.clear();
            }
        }

        if (vectorLayerRef.current) {
            vectorLayerRef.current.setVisible(!!layerSettings.showStations);
        }
    }, [layerSettings, renderHeatmap]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* Custom OpenLayers Controls Layout Styling */}
            <style>{`
                .ol-zoom {
                    top: auto !important;
                    bottom: 215px !important;
                    right: 28px !important;
                    left: auto !important;
                }
                .ol-zoom button {
                    background-color: rgba(255, 255, 255, 0.95) !important;
                    color: #1e293b !important;
                    border: 1px solid #cbd5e1 !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12) !important;
                    border-radius: 8px !important;
                    font-size: 16px !important;
                    font-weight: 700 !important;
                    width: 34px !important;
                    height: 34px !important;
                    line-height: 32px !important;
                    margin-bottom: 4px !important;
                    cursor: pointer !important;
                }
                .ol-zoom button:hover {
                    background-color: #f8fafc !important;
                    color: #2563eb !important;
                }
                .ol-full-screen {
                    top: auto !important;
                    bottom: 295px !important;
                    right: 28px !important;
                    left: auto !important;
                }
                .ol-full-screen button {
                    background-color: rgba(255, 255, 255, 0.95) !important;
                    color: #1e293b !important;
                    border: 1px solid #cbd5e1 !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12) !important;
                    border-radius: 8px !important;
                    font-size: 14px !important;
                    width: 34px !important;
                    height: 34px !important;
                    cursor: pointer !important;
                }
                .ol-scale-line {
                    bottom: 24px !important;
                    right: 28px !important;
                    left: auto !important;
                    background: rgba(255, 255, 255, 0.92) !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 6px !important;
                    padding: 3px 8px !important;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
                }
                .ol-scale-line-inner {
                    border: 1px solid #334155 !important;
                    border-top: none !important;
                    color: #334155 !important;
                    font-weight: 600 !important;
                    font-size: 10px !important;
                }
                .ol-attribution {
                    bottom: 4px !important;
                    right: 28px !important;
                    font-size: 10px !important;
                }
            `}</style>

            {/* OpenLayers Map Target */}
            <div
                ref={mapTargetRef}
                style={{ width: '100%', height: '100%', backgroundColor: '#e2e8f0' }}
            />

            {/* Heatmap Overlay Canvas */}
            <canvas
                ref={heatmapCanvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 10
                }}
            />

            {/* Particle Flow Animation Overlay Canvas */}
            <canvas
                ref={particleCanvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 20
                }}
            />

            {/* Loading Indicator Spinner */}
            {loading && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 1002,
                        backgroundColor: 'rgba(255, 255, 255, 0.92)',
                        padding: '16px 24px',
                        borderRadius: '10px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontWeight: 600,
                        color: '#1e293b'
                    }}
                >
                    <i className="fa fa-spinner fa-spin fa-2x" style={{ color: '#2563eb' }} />
                    <span>Đang tải ma trận dữ liệu lưới...</span>
                </div>
            )}
        </div>
    );
};

WindGridMapContainer.propTypes = {
    gridData: PropTypes.object,
    loading: PropTypes.bool,
    layerSettings: PropTypes.shape({
        showHeatmap: PropTypes.bool,
        heatmapOpacity: PropTypes.number,
        showParticles: PropTypes.bool,
        particleSpeed: PropTypes.number,
        showStations: PropTypes.bool
    }),
    onHoverGrid: PropTypes.func,
    onMouseMove: PropTypes.func,
    onClickPoint: PropTypes.func
};

export default WindGridMapContainer;
