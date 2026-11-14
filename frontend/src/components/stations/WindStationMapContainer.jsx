/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Button, Label, Badge } from 'react-bootstrap';

import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';
import Overlay from 'ol/Overlay';
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import { defaults as defaultControls, ScaleLine, FullScreen } from 'ol/control';

import { getStationsMap } from '../../api/wind';

const DEFAULT_VIETNAM_CENTER = [106.5, 16.0]; // Longitude, Latitude
const DEFAULT_ZOOM = 6;

const isStationMatch = (selected, feature) => {
    if (!selected || !feature) return false;

    const selId = selected.id ?? selected.properties?.id ?? selected.pk ?? null;
    const selCode = selected.station_code ?? selected.properties?.station_code ?? null;

    const props = feature.getProperties ? feature.getProperties() : feature;
    const featId = (feature.getId && feature.getId()) ?? props.id ?? props.pk ?? null;
    const featCode = props.station_code ?? null;

    if (selId !== null && featId !== null && String(selId) === String(featId)) {
        return true;
    }
    if (selCode !== null && featCode !== null && String(selCode) === String(featCode)) {
        return true;
    }
    return false;
};

const WindStationMapContainer = ({
    filters = {},
    selectedStation = null,
    onSelectStation = () => {},
    onViewDetail = () => {}
}) => {
    const mapTargetRef = useRef(null);
    const popupTargetRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const vectorSourceRef = useRef(null);
    const overlayRef = useRef(null);

    const selectedStationRef = useRef(selectedStation);
    selectedStationRef.current = selectedStation;

    const onSelectStationRef = useRef(onSelectStation);
    onSelectStationRef.current = onSelectStation;

    const [popupStation, setPopupStation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [stationCount, setStationCount] = useState(0);

    // 1. Initialize Map Instance (Runs ONCE on Mount)
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
                    const currentSelected = selectedStationRef.current;
                    const props = feature.getProperties();
                    const type = (props.station_type || '').toLowerCase();
                    const isSelected = isStationMatch(currentSelected, feature);

                    if (isSelected) {
                        return new Style({
                            image: new CircleStyle({
                                radius: 10,
                                fill: new Fill({ color: '#ef4444' }),
                                stroke: new Stroke({ color: '#ffffff', width: 3 })
                            }),
                            zIndex: 100
                        });
                    }

                    const fillColor = type === 'synop' ? '#2563eb' : '#f59e0b';
                    return new Style({
                        image: new CircleStyle({
                            radius: 6.5,
                            fill: new Fill({ color: fillColor }),
                            stroke: new Stroke({ color: '#ffffff', width: 2 })
                        }),
                        zIndex: 10
                    });
                }
            });

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

            map = new Map({
                target: mapTargetRef.current,
                layers: [
                    new TileLayer({
                        source: new OSM()
                    }),
                    vectorLayer
                ],
                overlays: [overlay],
                view: new View({
                    center: fromLonLat(DEFAULT_VIETNAM_CENTER),
                    zoom: DEFAULT_ZOOM,
                    minZoom: 4,
                    maxZoom: 18
                }),
                controls: defaultControls().extend([
                    new ScaleLine(),
                    new FullScreen()
                ])
            });

            // Hover cursor effect
            map.on('pointermove', (evt) => {
                if (evt.dragging) return;
                const hit = map.hasFeatureAtPixel(evt.pixel);
                const targetEl = map.getTargetElement();
                if (targetEl) {
                    targetEl.style.cursor = hit ? 'pointer' : '';
                }
            });

            // Click feature on map
            map.on('singleclick', (evt) => {
                // If clicked inside the popup, do not process map click
                if (popupTargetRef.current && popupTargetRef.current.contains(evt.originalEvent.target)) {
                    return;
                }

                const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);
                if (feature) {
                    const featProps = feature.getProperties();
                    const featId = (feature.getId && feature.getId()) ?? featProps.id ?? featProps.pk;
                    const props = {
                        ...featProps,
                        id: featId
                    };
                    const coords = feature.getGeometry().getCoordinates();
                    overlay.setPosition(coords);
                    setPopupStation(props);
                    if (onSelectStationRef.current) {
                        onSelectStationRef.current(props);
                    }
                } else {
                    overlay.setPosition(undefined);
                    setPopupStation(null);
                }
            });

            mapInstanceRef.current = map;

            // Force update map size after rendering to ensure proper dimensions
            timer = setTimeout(() => {
                map.updateSize();
            }, 150);

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

    // 2. Update Feature Styles whenever selectedStation changes
    useEffect(() => {
        if (vectorSourceRef.current) {
            vectorSourceRef.current.changed();
        }
    }, [selectedStation]);

    // 3. Fetch Map Stations GeoJSON based on filters
    const loadMapData = useCallback(() => {
        if (!vectorSourceRef.current) return;
        setLoading(true);
        const params = {};
        if (filters.search) params.search = filters.search;
        if (filters.station_type) params.station_type = filters.station_type;
        if (filters.province_id) params.province_id = filters.province_id;

        getStationsMap(params)
            .then((data) => {
                if (!vectorSourceRef.current) return;
                vectorSourceRef.current.clear();

                let geojsonData = data;
                if (Array.isArray(data)) {
                    geojsonData = {
                        type: 'FeatureCollection',
                        features: data
                    };
                }

                if (geojsonData && geojsonData.type === 'FeatureCollection' && Array.isArray(geojsonData.features)) {
                    const geojsonFormat = new GeoJSON();
                    const features = geojsonFormat.readFeatures(geojsonData, {
                        featureProjection: 'EPSG:3857',
                        dataProjection: 'EPSG:4326'
                    });

                    vectorSourceRef.current.addFeatures(features);
                    setStationCount(features.length);

                    if (features.length > 0 && mapInstanceRef.current) {
                        const extent = vectorSourceRef.current.getExtent();
                        if (extent && isFinite(extent[0])) {
                            mapInstanceRef.current.getView().fit(extent, {
                                padding: [50, 50, 50, 50],
                                maxZoom: 12,
                                duration: 500
                            });
                        }
                    }
                }
            })
            .catch((err) => {
                console.error('Error fetching map stations:', err);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [filters]);

    useEffect(() => {
        loadMapData();
    }, [loadMapData]);

    // 4. Center & Show Popup when selectedStation changes from outside (e.g. List click)
    useEffect(() => {
        if (!selectedStation || !mapInstanceRef.current) return;

        let lon = null;
        let lat = null;
        if (selectedStation.geometry?.coordinates) {
            lon = selectedStation.geometry.coordinates[0];
            lat = selectedStation.geometry.coordinates[1];
        } else if (selectedStation.lon !== undefined && selectedStation.lat !== undefined) {
            lon = selectedStation.lon;
            lat = selectedStation.lat;
        } else if (selectedStation.longitude !== undefined && selectedStation.latitude !== undefined) {
            lon = selectedStation.longitude;
            lat = selectedStation.latitude;
        }

        if (lon !== null && lat !== null && !isNaN(Number(lon)) && !isNaN(Number(lat))) {
            const coord = fromLonLat([Number(lon), Number(lat)]);
            mapInstanceRef.current.getView().animate({
                center: coord,
                zoom: Math.max(mapInstanceRef.current.getView().getZoom(), 11),
                duration: 500
            });

            if (overlayRef.current) {
                overlayRef.current.setPosition(coord);
                const props = selectedStation.properties || selectedStation;
                setPopupStation(props);
            }
        }
    }, [selectedStation]);

    // Reset view to all features / Vietnam
    const handleResetView = () => {
        if (!mapInstanceRef.current) return;
        if (vectorSourceRef.current && vectorSourceRef.current.getFeatures().length > 0) {
            const extent = vectorSourceRef.current.getExtent();
            if (extent && isFinite(extent[0])) {
                mapInstanceRef.current.getView().fit(extent, {
                    padding: [50, 50, 50, 50],
                    maxZoom: 12,
                    duration: 600
                });
                return;
            }
        }
        mapInstanceRef.current.getView().animate({
            center: fromLonLat(DEFAULT_VIETNAM_CENTER),
            zoom: DEFAULT_ZOOM,
            duration: 600
        });
    };

    const handleClosePopup = () => {
        if (overlayRef.current) {
            overlayRef.current.setPosition(undefined);
        }
        setPopupStation(null);
    };

    const obs = popupStation?.latest_observation;
    const stationType = (popupStation?.station_type || 'N/A').toUpperCase();
    const stationId = popupStation?.id ?? popupStation?.pk ?? popupStation?.properties?.id ?? popupStation?.properties?.pk;

    return (
        <div
            style={{
                height: 'calc(100vh - 180px)',
                minHeight: '450px',
                margin: 0,
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#e2e8f0'
            }}
        >
            {/* Header info badge */}
            <div style={{
                position: 'absolute',
                top: '5px',
                left: '35px',
                zIndex: 10,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                padding: '6px 14px',
                borderRadius: '4px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <i className="fa fa-map-marker" style={{ color: '#ef4444', fontSize: '14px' }} />
                <span>Bản đồ trạm quan trắc</span>
                <Badge style={{ backgroundColor: '#2563eb', fontWeight: 'bold' }}>{stationCount}</Badge>
                {loading && <i className="fa fa-spinner fa-spin" style={{ color: '#3b82f6' }} />}
            </div>

            {/* Reset View Button */}
            <div style={{
                position: 'absolute',
                top: '5px',
                right: '35px',
                zIndex: 10
            }}>
                <Button
                    bsSize="xs"
                    bsStyle="default"
                    onClick={handleResetView}
                    title="Về toàn cảnh Việt Nam"
                    style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #cbd5e1',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        fontWeight: 600
                    }}
                >
                    <i className="fa fa-crosshairs" style={{ marginRight: '4px', color: '#2563eb' }} />
                    Toàn cảnh
                </Button>
            </div>

            {/* Legend Box */}
            <div style={{
                position: 'absolute',
                bottom: '5px',
                left: '10px',
                zIndex: 10,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                padding: '8px 12px',
                borderRadius: '4px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                border: '1px solid #cbd5e1',
                fontSize: '11px',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px'
            }}>
                <div style={{ fontWeight: 600, color: '#334155', marginBottom: '2px' }}>Chú giải trạm:</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2563eb', border: '1px solid #fff' }} />
                    <span>SYNOP (Khí tượng bề mặt)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', border: '2px solid #fff' }} />
                    <span>Đang chọn</span>
                </div>
            </div>

            {/* OpenLayers Map Target DIV */}
            <div
                ref={mapTargetRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    width: '100%',
                    height: '100%'
                }}
            />

            {/* OpenLayers Popup Overlay Container */}
            <div
                ref={popupTargetRef}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: '#ffffff',
                    padding: '12px 14px',
                    borderRadius: '6px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                    border: '1px solid #cbd5e1',
                    minWidth: '240px',
                    maxWidth: '300px',
                    fontSize: '12px',
                    position: 'relative',
                    pointerEvents: 'auto',
                    cursor: 'default'
                }}
            >
                {popupStation && (
                    <div>
                        {/* Close button */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleClosePopup();
                            }}
                            style={{
                                position: 'absolute',
                                top: '6px',
                                right: '8px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#94a3b8',
                                fontSize: '14px',
                                fontWeight: 'bold'
                            }}
                            title="Đóng"
                        >
                            &times;
                        </button>

                        {/* Title & Type */}
                        <div style={{ paddingRight: '16px', marginBottom: '8px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1e3a8a' }}>
                                {popupStation.name || `Trạm #${popupStation.id}`}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                <span style={{ color: '#64748b', fontSize: '11px' }}>Mã: {popupStation.station_code || 'N/A'}</span>
                                <Label bsStyle={stationType === 'SYNOP' ? 'info' : 'warning'} style={{ fontSize: '9px', padding: '2px 5px' }}>
                                    {stationType}
                                </Label>
                            </div>
                        </div>

                        {/* Weather Data */}
                        <div style={{
                            backgroundColor: '#f8fafc',
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #e2e8f0',
                            marginBottom: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748b' }}><i className="fa fa-flag" style={{ color: '#3b82f6', marginRight: '4px' }} />Tốc độ gió:</span>
                                <strong>{obs?.wind_speed !== null && obs?.wind_speed !== undefined ? `${obs.wind_speed} m/s` : 'N/A'}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748b' }}><i className="fa fa-compass" style={{ color: '#8b5cf6', marginRight: '4px' }} />Hướng gió:</span>
                                <strong>{obs?.wind_dir !== null && obs?.wind_dir !== undefined ? `${obs.wind_dir}°` : 'N/A'}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748b' }}><i className="fa fa-thermometer-half" style={{ color: '#ef4444', marginRight: '4px' }} />Nhiệt độ:</span>
                                <strong>{obs?.temp_2m !== null && obs?.temp_2m !== undefined ? `${obs.temp_2m} °C` : 'N/A'}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748b' }}><i className="fa fa-tint" style={{ color: '#06b6d4', marginRight: '4px' }} />Độ ẩm:</span>
                                <strong>{obs?.humidity !== null && obs?.humidity !== undefined ? `${obs.humidity}%` : 'N/A'}</strong>
                            </div>
                        </div>

                        {/* Action Button */}
                        <Button
                            bsStyle="primary"
                            bsSize="xs"
                            block
                            onClick={(e) => {
                                if (e) {
                                    e.stopPropagation();
                                }
                                const targetId = stationId;
                                if (targetId && onViewDetail) {
                                    onViewDetail(targetId);
                                }
                            }}
                        >
                            <i className="fa fa-line-chart" style={{ marginRight: '4px' }} />
                            Xem chi tiết & Biểu đồ
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

WindStationMapContainer.propTypes = {
    filters: PropTypes.object,
    selectedStation: PropTypes.object,
    onSelectStation: PropTypes.func,
    onViewDetail: PropTypes.func
};

export default WindStationMapContainer;
