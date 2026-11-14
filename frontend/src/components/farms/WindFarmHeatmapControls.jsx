/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Button, ButtonGroup } from 'react-bootstrap';
import { HEATMAP_METRICS } from '../../utils/WindFarmHeatmapUtils';

const WindFarmHeatmapControls = ({
    viewMode = 'both',
    onViewModeChange = () => {},
    metricKey = 'predicted_power_mw',
    onMetricChange = () => {},
    method = 'kde',
    onMethodChange = () => {},
    opacity = 0.8,
    onOpacityChange = () => {}
}) => {
    const showHeatmapSettings = viewMode !== 'points';

    return (
        <div
            style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 1000,
                background: 'rgba(255, 255, 255, 0.95)',
                padding: '10px 12px',
                borderRadius: '6px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                minWidth: '240px',
                pointerEvents: 'auto'
            }}
        >
            {/* 1. Chọn chế độ xem */}
            <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Chế độ hiển thị
                </div>
                <ButtonGroup bsSize="xs" style={{ width: '100%', display: 'flex' }}>
                    <Button
                        bsStyle={viewMode === 'both' ? 'primary' : 'default'}
                        onClick={() => onViewModeChange('both')}
                        style={{ flex: 1 }}
                    >
                        Cả hai
                    </Button>
                    <Button
                        bsStyle={viewMode === 'heatmap' ? 'primary' : 'default'}
                        onClick={() => onViewModeChange('heatmap')}
                        style={{ flex: 1 }}
                    >
                        Heatmap
                    </Button>
                    <Button
                        bsStyle={viewMode === 'points' ? 'primary' : 'default'}
                        onClick={() => onViewModeChange('points')}
                        style={{ flex: 1 }}
                    >
                        Điểm
                    </Button>
                </ButtonGroup>
            </div>

            {/* 2. Cài đặt Heatmap (Phương pháp nội suy, Chỉ số & Độ mờ) */}
            {showHeatmapSettings && (
                <>
                    {/* 2.1 Phương pháp nội suy */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                            Phương pháp nội suy
                        </div>
                        <ButtonGroup bsSize="xs" style={{ width: '100%', display: 'flex' }}>
                            <Button
                                bsStyle={method === 'kde' ? 'primary' : 'default'}
                                onClick={() => onMethodChange('kde')}
                                style={{ flex: 1, padding: '3px 2px', fontSize: '10.5px' }}
                                title="Kernel Density Estimation - Mật độ tập trung"
                            >
                                KDE
                            </Button>
                            <Button
                                bsStyle={method === 'idw' ? 'primary' : 'default'}
                                onClick={() => onMethodChange('idw')}
                                style={{ flex: 1, padding: '3px 2px', fontSize: '10.5px' }}
                                title="Inverse Distance Weighting - Khoảng cách nghịch đảo"
                            >
                                IDW
                            </Button>
                            <Button
                                bsStyle={method === 'kriging' ? 'primary' : 'default'}
                                onClick={() => onMethodChange('kriging')}
                                style={{ flex: 1, padding: '3px 2px', fontSize: '10.5px' }}
                                title="Ordinary Kriging - Nội suy địa thống kê tối ưu"
                            >
                                Kriging
                            </Button>
                        </ButtonGroup>
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', fontStyle: 'italic', lineHeight: '1.2' }}>
                            {method === 'kde' && 'Mật độ điểm nhiệt (Gaussian blur)'}
                            {method === 'idw' && 'Khoảng cách nghịch đảo (1/d²)'}
                            {method === 'kriging' && 'Nội suy địa thống kê (BLUE)'}
                        </div>
                    </div>

                    {/* 3. Chọn chỉ số nhiệt */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                            Chỉ số nhiệt
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {Object.values(HEATMAP_METRICS).map((m) => {
                                const isActive = metricKey === m.id;
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => onMetricChange(m.id)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '5px 8px',
                                            borderRadius: '4px',
                                            border: isActive ? '1px solid #0284c7' : '1px solid #e2e8f0',
                                            background: isActive ? '#f0f9ff' : '#ffffff',
                                            color: isActive ? '#0369a1' : '#334155',
                                            fontWeight: isActive ? 600 : 400,
                                            cursor: 'pointer',
                                            fontSize: '11px',
                                            textAlign: 'left',
                                            outline: 'none'
                                        }}
                                    >
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <i className={`fa ${m.icon}`} style={{ width: '14px', color: isActive ? '#0284c7' : '#64748b' }} />
                                            {m.label}
                                        </span>
                                        <span style={{ fontSize: '10px', color: '#64748b' }}>({m.unit})</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 4. Thanh trượt Độ mờ đục */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>
                                Độ mờ đục Heatmap
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#0284c7' }}>
                                {Math.round(opacity * 100)}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0.2"
                            max="1.0"
                            step="0.05"
                            value={opacity}
                            onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                            style={{ width: '100%', cursor: 'pointer', margin: '2px 0' }}
                        />
                    </div>
                </>
            )}
        </div>
    );
};

WindFarmHeatmapControls.propTypes = {
    viewMode: PropTypes.oneOf(['points', 'heatmap', 'both']),
    onViewModeChange: PropTypes.func,
    metricKey: PropTypes.oneOf(['predicted_power_mw', 'wind_speed_100m', 'depth_m']),
    onMetricChange: PropTypes.func,
    method: PropTypes.oneOf(['kde', 'idw', 'kriging']),
    onMethodChange: PropTypes.func,
    opacity: PropTypes.number,
    onOpacityChange: PropTypes.func
};

export default WindFarmHeatmapControls;
