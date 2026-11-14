/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { HEATMAP_METRICS } from '../../utils/WindFarmHeatmapUtils';

const WindFarmMapLegend = ({
    viewMode = 'both',
    metricKey = 'predicted_power_mw',
    method = 'kde'
}) => {
    const metric = HEATMAP_METRICS[metricKey] || HEATMAP_METRICS.predicted_power_mw;
    const isPointsOnly = viewMode === 'points';
    const methodLabel = method === 'idw' ? 'IDW' : method === 'kriging' ? 'Kriging' : 'KDE';

    return (
        <div
            style={{
                position: 'absolute',
                bottom: '24px',
                left: '12px',
                background: 'rgba(255, 255, 255, 0.94)',
                padding: '10px 14px',
                borderRadius: '6px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
                fontSize: '11px',
                zIndex: 1000,
                lineHeight: '1.5',
                minWidth: '220px',
                maxWidth: '280px',
                border: '1px solid #e2e8f0',
                pointerEvents: 'auto'
            }}
        >
            {isPointsOnly ? (
                /* Chú giải dạng điểm tua-bin */
                <div>
                    <div style={{ fontWeight: 600, marginBottom: '6px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fa fa-circle" style={{ color: '#2563eb', fontSize: '10px' }} />
                        <span>Công suất dự báo tua-bin (MW)</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#991b1b', display: 'inline-block' }} />
                            <span>&ge; 50 MW</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                            <span>40 - 50 MW</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f97316', display: 'inline-block' }} />
                            <span>25 - 40 MW</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308', display: 'inline-block' }} />
                            <span>&lt; 25 MW</span>
                        </div>
                    </div>
                </div>
            ) : (
                /* Chú giải dạng Heatmap liên tục */
                <div>
                    <div style={{ fontWeight: 600, marginBottom: '6px', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className={`fa ${metric.icon}`} style={{ color: '#0284c7' }} />
                            <span>{metric.label} ({metric.unit})</span>
                        </span>
                        <span style={{ fontSize: '10px', background: '#e0f2fe', color: '#0369a1', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>
                            {methodLabel}
                        </span>
                    </div>

                    {/* Dải màu Gradient */}
                    <div
                        style={{
                            height: '11px',
                            borderRadius: '3px',
                            background: `linear-gradient(to right, ${metric.gradient.join(', ')})`,
                            boxShadow: 'inset 0 0 2px rgba(0,0,0,0.2)',
                            marginBottom: '4px'
                        }}
                    />

                    {/* Vạch số kỹ thuật */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '10px',
                            color: '#475569',
                            fontWeight: 500
                        }}
                    >
                        <span>{metric.ticks[0]}</span>
                        <span>{metric.ticks[2]}</span>
                        <span>{metric.ticks[4]}</span>
                    </div>

                    {viewMode === 'both' && (
                        <div style={{ marginTop: '6px', paddingTop: '5px', borderTop: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', color: '#334155' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563eb', border: '1px solid #ffffff', display: 'inline-block' }} />
                            <span>Vị trí điểm khảo sát tua-bin</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

WindFarmMapLegend.propTypes = {
    viewMode: PropTypes.oneOf(['points', 'heatmap', 'both']),
    metricKey: PropTypes.oneOf(['predicted_power_mw', 'wind_speed_100m', 'depth_m']),
    method: PropTypes.oneOf(['kde', 'idw', 'kriging'])
};

export default WindFarmMapLegend;
