/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Label, Button } from 'react-bootstrap';

const getPowerBadgeColor = (power) => {
    if (power >= 50) return '#b91c1c'; // Đỏ đậm
    if (power >= 40) return '#ea580c'; // Cam đỏ
    if (power >= 30) return '#d97706'; // Vàng cam
    return '#16a34a'; // Xanh lá
};

const WindFarmRow = ({ item, isSelected = false, onSelectPoint }) => {
    const pointId = item.point_id ?? item.id;
    const power = item.predicted_power_mw ?? 0;
    const cf = item.capacity_factor ?? 0;
    const depth = item.depth_m ?? 0;
    const windSpeed = item.wind_speed_100m ?? 0;
    const windDir = item.wind_direction ?? 0;
    const lat = item.latitude ?? 0;
    const lon = item.longitude ?? 0;
    const isFixed = depth <= 50;

    return (
        <div
            className={`wind-farm-row ${isSelected ? 'selected' : ''}`}
            style={{
                padding: '12px 14px',
                borderBottom: '1px solid #e2e8f0',
                background: isSelected ? '#eff6ff' : '#ffffff',
                borderLeft: isSelected ? '4px solid #3b82f6' : '4px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
            }}
            onClick={() => onSelectPoint(item)}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '13px', color: '#1e3a8a' }}>
                        <i className="fa fa-bolt" style={{ color: '#eab308', marginRight: '4px' }} />
                        Điểm tua-bin #{pointId}
                    </strong>
                    <Label bsStyle={isFixed ? 'primary' : 'warning'} style={{ fontSize: '10px' }}>
                        {isFixed ? 'Móng cố định (≤50m)' : 'Móng nổi (>50m)'}
                    </Label>
                    {item.zone && (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                            • {item.zone}
                        </span>
                    )}
                </div>
                <div>
                    <Button
                        bsStyle={isSelected ? 'primary' : 'default'}
                        bsSize="xs"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelectPoint(item);
                        }}
                        title="Định vị trên bản đồ"
                    >
                        <i className="fa fa-crosshairs" /> Bản đồ
                    </Button>
                </div>
            </div>

            {/* Các thông số kỹ thuật then chốt */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                <div>
                    Công suất: <strong style={{ color: getPowerBadgeColor(power) }}>{power.toFixed(1)} MW</strong>
                </div>
                <div>
                    Hệ số CF: <strong style={{ color: '#0369a1' }}>{cf.toFixed(1)}%</strong>
                </div>
                <div>
                    Độ sâu đáy biển: <strong>{depth.toFixed(0)} m</strong>
                </div>
                <div>
                    Gió 100m: <strong>{windSpeed.toFixed(1)} m/s</strong> ({windDir.toFixed(0)}°)
                </div>
                <div style={{ marginLeft: 'auto', color: '#94a3b8' }}>
                    {lat.toFixed(3)}°N, {lon.toFixed(3)}°E
                </div>
            </div>
        </div>
    );
};

WindFarmRow.propTypes = {
    item: PropTypes.object.isRequired,
    isSelected: PropTypes.bool,
    onSelectPoint: PropTypes.func.isRequired
};

export default WindFarmRow;
