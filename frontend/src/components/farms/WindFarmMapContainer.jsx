/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Button } from 'react-bootstrap';

import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import HeatmapLayer from 'ol/layer/Heatmap';
import ImageLayer from 'ol/layer/Image';
import ImageStatic from 'ol/source/ImageStatic';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj';
import Overlay from 'ol/Overlay';
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import { defaults as defaultControls, ScaleLine, FullScreen } from 'ol/control';

import { getWindFarmsMap } from '../../api/wind';
import { HEATMAP_METRICS, getHeatmapWeight } from '../../utils/WindFarmHeatmapUtils';
import { createInterpolationCanvas, interpolatePoint } from '../../utils/windInterpolation';
import WindFarmHeatmapControls from './WindFarmHeatmapControls';
import WindFarmMapLegend from './WindFarmMapLegend';

const DEFAULT_CENTER = [107.2, 19.5]; // Tâm Vịnh Bắc Bộ
const DEFAULT_ZOOM = 7;

const getPointColor = (power) => {
    if (power >= 50) return '#991b1b'; // Đỏ sẫm
    if (power >= 40) return '#ef4444'; // Đỏ
    if (power >= 25) return '#f97316'; // Cam
    return '#eab308'; // Vàng
};

const isPointMatch = (selected, feature) => {
    if (!selected || !feature) return false;
    const selId = selected.point_id ?? selected.id ?? null;
    const props = feature.getProperties ? feature.getProperties() : feature;
    const featId = props.point_id ?? props.id ?? null;
    return selId !== null && featId !== null && String(selId) === String(featId);
};

const WindFarmMapContainer = ({
    filters = {},
    selectedPoint = null,
    onSelectPoint = () => {}
}) => {
    const mapTargetRef = useRef(null);
    const popupTargetRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const vectorSourceRef = useRef(null);
    const vectorLayerRef = useRef(null);
    const heatmapLayerRef = useRef(null);
    const interpolationLayerRef = useRef(null);
    const overlayRef = useRef(null);
    const osmLayerRef = useRef(null);
    const satLayerRef = useRef(null);

    const selectedPointRef = useRef(selectedPoint);
    selectedPointRef.current = selectedPoint;

    const onSelectPointRef = useRef(onSelectPoint);
    onSelectPointRef.current = onSelectPoint;

    const [popupPoint, setPopupPoint] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pointCount, setPointCount] = useState(0);
    const [basemap, setBasemap] = useState('osm'); // 'osm' or 'satellite'

    // Heatmap & Interpolation states
    const [viewMode, setViewMode] = useState('both'); // 'both', 'heatmap', 'points'
    const [heatmapMetric, setHeatmapMetric] = useState('predicted_power_mw');
    const [interpolationMethod, setInterpolationMethod] = useState('kde'); // 'kde', 'idw', 'kriging'
    const [heatmapOpacity, setHeatmapOpacity] = useState(0.8);

    const viewModeRef = useRef(viewMode);
    viewModeRef.current = viewMode;

    const heatmapMetricRef = useRef(heatmapMetric);
    heatmapMetricRef.current = heatmapMetric;

    const interpolationMethodRef = useRef(interpolationMethod);
    interpolationMethodRef.current = interpolationMethod;

    // 1. Initialize OpenLayers Map (Mount once)
    useEffect(() => {
        let timer = null;
        let handleResize = null;
        let map = null;

        if (mapTargetRef.current) {
            const vectorSource = new VectorSource();
            vectorSourceRef.current = vectorSource;

            const vectorLayer = new VectorLayer({
                source: vectorSource,
                style: (feature) => {
                    const props = feature.getProperties();
                    const power = Number(props.predicted_power_mw) || 0;
                    const isSelected = isPointMatch(selectedPointRef.current, feature);

                    if (isSelected) {
                        return new Style({
                            image: new CircleStyle({
                                radius: 10,
                                fill: new Fill({ color: '#2563eb' }),
                                stroke: new Stroke({ color: '#ffffff', width: 3 })
                            }),
                            zIndex: 100
                        });
                    }

                    const fillColor = getPointColor(power);
                    return new Style({
                        image: new CircleStyle({
                            radius: 5.5,
                            fill: new Fill({ color: fillColor }),
                            stroke: new Stroke({ color: '#ffffff', width: 1.2 })
                        }),
                        zIndex: 10
                    });
                },
                visible: true
            });
            vectorLayerRef.current = vectorLayer;

            const metricConfig = HEATMAP_METRICS[heatmapMetricRef.current] || HEATMAP_METRICS.predicted_power_mw;
            const heatmapLayer = new HeatmapLayer({
                source: vectorSource,
                blur: 24,
                radius: 16,
                weight: (feature) => getHeatmapWeight(feature, heatmapMetricRef.current),
                gradient: metricConfig.gradient,
                opacity: 0.8,
                visible: true,
                zIndex: 5
            });
            heatmapLayerRef.current = heatmapLayer;

            const interpolationLayer = new ImageLayer({
                opacity: 0.8,
                visible: false,
                zIndex: 5
            });
            interpolationLayerRef.current = interpolationLayer;

            const overlay = new Overlay({
                element: popupTargetRef.current,
                positioning: 'bottom-center',
                stopEvent: false,
                offset: [0, -12],
                autoPan: {
                    animation: {
                        duration: 250
                    }
                }
            });
            overlayRef.current = overlay;

            const osmLayer = new TileLayer({
                source: new OSM(),
                visible: true
            });
            osmLayerRef.current = osmLayer;

            const satLayer = new TileLayer({
                source: new XYZ({
                    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    attributions: 'Tiles © Esri'
                }),
                visible: false
            });
            satLayerRef.current = satLayer;

            map = new Map({
                target: mapTargetRef.current,
                layers: [
                    osmLayer,
                    satLayer,
                    interpolationLayer,
                    heatmapLayer,
                    vectorLayer
                ],
                overlays: [overlay],
                view: new View({
                    center: fromLonLat(DEFAULT_CENTER),
                    zoom: DEFAULT_ZOOM,
                    minZoom: 5,
                    maxZoom: 16
                }),
                controls: defaultControls().extend([
                    new ScaleLine(),
                    new FullScreen()
                ])
            });

            // Hover pointer detection (supporting nearest snapping and interpolation inspection)
            map.on('pointermove', (evt) => {
                if (evt.dragging) return;
                let hit = map.hasFeatureAtPixel(evt.pixel);
                if (!hit && vectorSourceRef.current) {
                    const closest = vectorSourceRef.current.getClosestFeatureToCoordinate(evt.coordinate);
                    if (closest && closest.getGeometry()) {
                        const featCoord = closest.getGeometry().getCoordinates();
                        const featPixel = map.getPixelFromCoordinate(featCoord);
                        if (featPixel) {
                            const dx = evt.pixel[0] - featPixel[0];
                            const dy = evt.pixel[1] - featPixel[1];
                            if (Math.sqrt(dx * dx + dy * dy) <= 35) {
                                hit = true;
                            }
                        }
                    }
                }
                // When in IDW or Kriging mode, show pointer if inside surveyed marine area
                if (!hit && interpolationMethodRef.current !== 'kde' && viewModeRef.current !== 'points' && vectorSourceRef.current) {
                    const extent = vectorSourceRef.current.getExtent();
                    if (extent && isFinite(extent[0])) {
                        const [minX, minY, maxX, maxY] = extent;
                        const [x, y] = evt.coordinate;
                        const pad = 35000;
                        if (x >= minX - pad && x <= maxX + pad && y >= minY - pad && y <= maxY + pad) {
                            hit = true;
                        }
                    }
                }
                const targetEl = map.getTargetElement();
                if (targetEl) {
                    targetEl.style.cursor = hit ? 'pointer' : '';
                }
            });

            // Single click feature with Nearest Feature Snapping & Continuous Interpolation Evaluation
            map.on('singleclick', (evt) => {
                if (popupTargetRef.current && popupTargetRef.current.contains(evt.originalEvent.target)) {
                    return;
                }

                let feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);
                let isSnapped = false;
                let snapDistanceKm = 0;

                // 1. Exact hit on a turbine feature
                if (feature) {
                    const featProps = feature.getProperties();
                    const coords = feature.getGeometry().getCoordinates();
                    overlay.setPosition(coords);
                    setPopupPoint({
                        ...featProps,
                        _isSnapped: false
                    });
                    if (onSelectPointRef.current) {
                        onSelectPointRef.current(featProps);
                    }
                    return;
                }

                // 2. When IDW or Kriging is active and Heatmap is visible, evaluate interpolated value at clicked coordinate
                const currentMethod = interpolationMethodRef.current;
                const currentViewMode = viewModeRef.current;
                if (currentMethod !== 'kde' && currentViewMode !== 'points' && vectorSourceRef.current) {
                    const lonLat = toLonLat(evt.coordinate);
                    const features = vectorSourceRef.current.getFeatures();
                    const interpolated = interpolatePoint(features, lonLat[0], lonLat[1], currentMethod);

                    if (interpolated) {
                        overlay.setPosition(evt.coordinate);
                        setPopupPoint({
                            _isInterpolated: true,
                            method: currentMethod,
                            latitude: lonLat[1],
                            longitude: lonLat[0],
                            predicted_power_mw: interpolated.predicted_power_mw,
                            wind_speed_100m: interpolated.wind_speed_100m,
                            depth_m: interpolated.depth_m,
                            closestPoint: interpolated.closestPoint,
                            _closestDistanceKm: interpolated.closestDistanceKm
                        });
                        return;
                    }
                }

                // 3. Fallback: Snap to nearest feature within 40px
                if (vectorSourceRef.current) {
                    const closest = vectorSourceRef.current.getClosestFeatureToCoordinate(evt.coordinate);
                    if (closest && closest.getGeometry()) {
                        const featCoord = closest.getGeometry().getCoordinates();
                        const featPixel = map.getPixelFromCoordinate(featCoord);
                        if (featPixel) {
                            const dx = evt.pixel[0] - featPixel[0];
                            const dy = evt.pixel[1] - featPixel[1];
                            const distPx = Math.sqrt(dx * dx + dy * dy);
                            if (distPx <= 40) {
                                feature = closest;
                                isSnapped = true;
                                const mapDx = evt.coordinate[0] - featCoord[0];
                                const mapDy = evt.coordinate[1] - featCoord[1];
                                snapDistanceKm = (Math.sqrt(mapDx * mapDx + mapDy * mapDy) / 1000).toFixed(1);
                            }
                        }
                    }
                }

                if (feature) {
                    const featProps = feature.getProperties();
                    const coords = feature.getGeometry().getCoordinates();
                    overlay.setPosition(coords);
                    setPopupPoint({
                        ...featProps,
                        _isSnapped: isSnapped,
                        _snapDistanceKm: snapDistanceKm
                    });
                    if (onSelectPointRef.current) {
                        onSelectPointRef.current(featProps);
                    }
                } else {
                    overlay.setPosition(undefined);
                    setPopupPoint(null);
                }
            });

            mapInstanceRef.current = map;

            timer = setTimeout(() => {
                map.updateSize();
            }, 200);

            handleResize = () => {
                map.updateSize();
            };
            window.addEventListener('resize', handleResize);
        }

        return () => {
            if (timer) clearTimeout(timer);
            if (handleResize) window.removeEventListener('resize', handleResize);
            if (map) {
                map.setTarget(null);
                mapInstanceRef.current = null;
            }
        };
    }, []);

    // 2. Basemap Switcher
    const handleToggleBasemap = (type) => {
        setBasemap(type);
        if (osmLayerRef.current && satLayerRef.current) {
            osmLayerRef.current.setVisible(type === 'osm');
            satLayerRef.current.setVisible(type === 'satellite');
        }
    };

    // Helper: Update IDW / Kriging Interpolation Image Layer
    const updateInterpolation = useCallback(() => {
        if (!interpolationLayerRef.current || !vectorSourceRef.current) return;
        const currentMethod = interpolationMethodRef.current;

        if (currentMethod === 'kde') {
            if (heatmapLayerRef.current) {
                heatmapLayerRef.current.setVisible(viewMode === 'heatmap' || viewMode === 'both');
            }
            interpolationLayerRef.current.setVisible(false);
            return;
        }

        // Hide KDE layer when IDW or Kriging is active
        if (heatmapLayerRef.current) {
            heatmapLayerRef.current.setVisible(false);
        }

        if (viewMode === 'points') {
            interpolationLayerRef.current.setVisible(false);
            return;
        }

        const features = vectorSourceRef.current.getFeatures();
        if (!features || features.length === 0) {
            interpolationLayerRef.current.setVisible(false);
            return;
        }

        const result = createInterpolationCanvas(features, heatmapMetricRef.current, currentMethod);
        if (!result || !result.canvas || !result.bbox) {
            interpolationLayerRef.current.setVisible(false);
            return;
        }

        const { canvas, bbox } = result;
        const [minLon, minLat, maxLon, maxLat] = bbox;
        const extent3857 = transformExtent([minLon, minLat, maxLon, maxLat], 'EPSG:4326', 'EPSG:3857');

        const source = new ImageStatic({
            url: canvas.toDataURL(),
            imageExtent: extent3857
        });

        interpolationLayerRef.current.setSource(source);
        interpolationLayerRef.current.setOpacity(heatmapOpacity);
        interpolationLayerRef.current.setVisible(true);
    }, [viewMode, heatmapOpacity]);

    // 3. React on ViewMode changes
    useEffect(() => {
        if (vectorLayerRef.current) {
            vectorLayerRef.current.setVisible(viewMode === 'points' || viewMode === 'both');
        }
        updateInterpolation();
    }, [viewMode, updateInterpolation]);

    // 4. React on Heatmap Metric or Interpolation Method changes
    useEffect(() => {
        const metricConfig = HEATMAP_METRICS[heatmapMetric] || HEATMAP_METRICS.predicted_power_mw;
        if (heatmapLayerRef.current) {
            heatmapLayerRef.current.setGradient(metricConfig.gradient);
            if (vectorSourceRef.current) {
                vectorSourceRef.current.changed();
            }
        }
        updateInterpolation();
    }, [heatmapMetric, interpolationMethod, updateInterpolation]);

    // 5. React on Heatmap Opacity changes
    useEffect(() => {
        if (heatmapLayerRef.current) {
            heatmapLayerRef.current.setOpacity(heatmapOpacity);
        }
        if (interpolationLayerRef.current) {
            interpolationLayerRef.current.setOpacity(heatmapOpacity);
        }
    }, [heatmapOpacity]);

    // 6. Re-render VectorLayer styles when selected point changes
    useEffect(() => {
        if (vectorSourceRef.current) {
            vectorSourceRef.current.changed();
        }
    }, [selectedPoint]);

    // 7. Pan map to selected point when changed from external list
    useEffect(() => {
        if (!selectedPoint || !mapInstanceRef.current) return;
        let lon = null;
        let lat = null;
        if (selectedPoint.geometry?.coordinates) {
            lon = selectedPoint.geometry.coordinates[0];
            lat = selectedPoint.geometry.coordinates[1];
        } else if (selectedPoint.longitude !== undefined && selectedPoint.latitude !== undefined) {
            lon = selectedPoint.longitude;
            lat = selectedPoint.latitude;
        }

        if (lon !== null && lat !== null && !isNaN(Number(lon)) && !isNaN(Number(lat))) {
            const coords = fromLonLat([Number(lon), Number(lat)]);
            mapInstanceRef.current.getView().animate({
                center: coords,
                zoom: Math.max(mapInstanceRef.current.getView().getZoom(), 8.5),
                duration: 400
            });
            if (overlayRef.current) {
                overlayRef.current.setPosition(coords);
                const props = selectedPoint.properties || selectedPoint;
                setPopupPoint(props);
            }
        }
    }, [selectedPoint]);

    // 8. Load Map GeoJSON points
    const loadMapData = useCallback(() => {
        if (!vectorSourceRef.current) return;
        setLoading(true);

        getWindFarmsMap(filters)
            .then((geojsonData) => {
                if (!vectorSourceRef.current) return;
                vectorSourceRef.current.clear();

                if (geojsonData && geojsonData.type === 'FeatureCollection' && Array.isArray(geojsonData.features)) {
                    const geojsonFormat = new GeoJSON();
                    const features = geojsonFormat.readFeatures(geojsonData, {
                        featureProjection: 'EPSG:3857',
                        dataProjection: 'EPSG:4326'
                    });

                    vectorSourceRef.current.addFeatures(features);
                    setPointCount(features.length);
                    updateInterpolation();
                }
            })
            .catch((err) => {
                console.error('Error fetching wind farms map data:', err);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [filters, updateInterpolation]);

    useEffect(() => {
        loadMapData();
    }, [loadMapData]);

    const handleClosePopup = () => {
        if (overlayRef.current) {
            overlayRef.current.setPosition(undefined);
        }
        setPopupPoint(null);
    };

    const handleZoomToExtents = () => {
        if (mapInstanceRef.current && vectorSourceRef.current) {
            const extent = vectorSourceRef.current.getExtent();
            if (extent && isFinite(extent[0])) {
                mapInstanceRef.current.getView().fit(extent, {
                    padding: [40, 40, 40, 40],
                    duration: 500,
                    maxZoom: 10
                });
            }
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 170px)', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
            {/* OpenLayers Map Canvas */}
            <div ref={mapTargetRef} style={{ width: '100%', height: '100%', background: '#f8fafc' }} />

            {/* Top-Left Heatmap & Layer Controls */}
            <WindFarmHeatmapControls
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                metricKey={heatmapMetric}
                onMetricChange={setHeatmapMetric}
                method={interpolationMethod}
                onMethodChange={setInterpolationMethod}
                opacity={heatmapOpacity}
                onOpacityChange={setHeatmapOpacity}
            />

            {/* Loading Indicator */}
            {loading && (
                <div
                    style={{
                        position: 'absolute',
                        top: '12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(15, 23, 42, 0.85)',
                        color: '#fff',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <i className="fa fa-spinner fa-spin" /> Đang tải điểm tiềm năng...
                </div>
            )}

            {/* Top Right Toolbars (Basemap switcher & Zoom to extent) */}
            <div
                style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    alignItems: 'flex-end'
                }}
            >
                <div className="btn-group" style={{ background: '#fff', borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                    <Button
                        bsSize="xs"
                        bsStyle={basemap === 'osm' ? 'primary' : 'default'}
                        onClick={() => handleToggleBasemap('osm')}
                    >
                        Bản đồ chuẩn
                    </Button>
                    <Button
                        bsSize="xs"
                        bsStyle={basemap === 'satellite' ? 'primary' : 'default'}
                        onClick={() => handleToggleBasemap('satellite')}
                    >
                        Vệ tinh
                    </Button>
                </div>

                <Button
                    bsSize="xs"
                    bsStyle="default"
                    onClick={handleZoomToExtents}
                    style={{ background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', fontSize: '11px' }}
                    title="Phóng to toàn bộ điểm"
                >
                    <i className="fa fa-arrows-alt" /> Vừa khung hình ({pointCount})
                </Button>
            </div>

            {/* Bottom-left Dynamic Map Legend */}
            <WindFarmMapLegend
                viewMode={viewMode}
                metricKey={heatmapMetric}
                method={interpolationMethod}
            />

            {/* Click/Hover Popup Overlay */}
            <div
                ref={popupTargetRef}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    background: '#ffffff',
                    padding: '12px 14px',
                    borderRadius: '6px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                    border: '1px solid #cbd5e1',
                    minWidth: '240px',
                    maxWidth: '300px',
                    fontSize: '12px',
                    pointerEvents: 'auto',
                    cursor: 'default'
                }}
            >
                {popupPoint && (
                    popupPoint._isInterpolated ? (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '10px', background: '#0284c7', color: '#fff', padding: '1px 5px', borderRadius: '3px', fontWeight: 600, textTransform: 'uppercase' }}>
                                        {popupPoint.method}
                                    </span>
                                    <strong style={{ color: '#0f172a', fontSize: '12px' }}>
                                        Điểm nội suy tiềm năng
                                    </strong>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleClosePopup}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px', padding: 0 }}
                                >
                                    &times;
                                </button>
                            </div>

                            {popupPoint.closestPoint && (
                                <div style={{ fontSize: '11px', color: '#0369a1', background: '#f0f9ff', padding: '4px 8px', borderRadius: '4px', marginBottom: '6px', border: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <i className="fa fa-crosshairs" />
                                    <span>
                                        Gần {popupPoint.closestPoint.name || `Tua-bin #${popupPoint.closestPoint.point_id || popupPoint.closestPoint.id}`} (cách ~{popupPoint._closestDistanceKm} km)
                                    </span>
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#334155' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span><i className="fa fa-bolt" style={{ width: '14px', color: '#f59e0b' }} /> Công suất ước tính:</span>
                                    <strong style={{ color: '#b91c1c' }}>{Number(popupPoint.predicted_power_mw || 0).toFixed(2)} MW</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span><i className="fa fa-dashboard" style={{ width: '14px', color: '#0284c7' }} /> Tốc độ gió 100m:</span>
                                    <strong style={{ color: '#0369a1' }}>{Number(popupPoint.wind_speed_100m || 0).toFixed(2)} m/s</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span><i className="fa fa-tint" style={{ width: '14px', color: '#0ea5e9' }} /> Độ sâu ước tính:</span>
                                    <strong style={{ color: '#1e3a8a' }}>{Number(popupPoint.depth_m || 0).toFixed(1)} m</strong>
                                </div>
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', borderTop: '1px dashed #e2e8f0', paddingTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Tọa độ: {Number(popupPoint.latitude || 0).toFixed(4)}°N, {Number(popupPoint.longitude || 0).toFixed(4)}°E</span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '6px' }}>
                                <strong style={{ color: '#1e3a8a', fontSize: '13px' }}>
                                    Điểm tua-bin #{popupPoint.point_id || popupPoint.id}
                                </strong>
                                <button
                                    type="button"
                                    onClick={handleClosePopup}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px', padding: 0 }}
                                >
                                    &times;
                                </button>
                            </div>

                            {popupPoint._isSnapped && (
                                <div style={{ fontSize: '11px', color: '#0369a1', background: '#f0f9ff', padding: '4px 8px', borderRadius: '4px', marginBottom: '6px', border: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <i className="fa fa-crosshairs" />
                                    <span>Khảo sát gần nhất (cách ~{popupPoint._snapDistanceKm} km)</span>
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#334155' }}>
                                <div>
                                    <strong>Công suất:</strong> <span style={{ color: '#b91c1c', fontWeight: 600 }}>{Number(popupPoint.predicted_power_mw || 0).toFixed(2)} MW</span>
                                </div>
                                <div>
                                    <strong>Hệ số công suất:</strong> {Number(popupPoint.capacity_factor || 0).toFixed(2)}%
                                </div>
                                <div>
                                    <strong>Độ sâu GEBCO:</strong> {Number(popupPoint.depth_m || 0).toFixed(0)} m ({popupPoint.foundation_type || (popupPoint.depth_m <= 50 ? 'Móng cố định' : 'Móng nổi')})
                                </div>
                                <div>
                                    <strong>Gió 100m:</strong> {Number(popupPoint.wind_speed_100m || 0).toFixed(2)} m/s ({Number(popupPoint.wind_direction || 0).toFixed(1)}°)
                                </div>
                                {popupPoint.zone && (
                                    <div>
                                        <strong>Khu vực:</strong> {popupPoint.zone}
                                    </div>
                                )}
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                                    Tọa độ: {Number(popupPoint.latitude || 0).toFixed(4)}°N, {Number(popupPoint.longitude || 0).toFixed(4)}°E
                                </div>
                            </div>
                        </>
                    )
                )}
            </div>
        </div>
    );
};

WindFarmMapContainer.propTypes = {
    filters: PropTypes.object,
    selectedPoint: PropTypes.object,
    onSelectPoint: PropTypes.func
};

export default WindFarmMapContainer;
