/*
 * Copyright 2026, GeoNode Project.
 * Point Grid Forecast Chart using Plotly.js
 */

import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import Plot from 'react-plotly.js';

const PointGridChartPlotly = ({ point, onClose }) => {
    if (!point) return null;

    const { chartData, layout } = useMemo(() => {
        const labels = Array.from({ length: 8 }, (_, i) => `${i * 3}:00`);

        const latFactor = point.lat || 0;
        const lngFactor = point.lng || 0;
        const baseValue = Math.abs(Math.sin(latFactor) * 8 + Math.cos(lngFactor) * 4) + 4;

        const windSpeeds = Array.from({ length: 8 }, (_, i) => {
            const cycle = Math.sin((i / 8) * Math.PI * 2 + latFactor);
            return Math.max(1, parseFloat((baseValue + cycle * 3 + Math.cos(i * lngFactor) * 1.5).toFixed(1)));
        });

        const temps = Array.from({ length: 8 }, (_, i) => {
            const cycle = Math.sin((i / 8) * Math.PI * 2 - Math.PI / 2);
            return Math.max(15, parseFloat((26 + cycle * 5 + Math.sin(latFactor) * 3).toFixed(1)));
        });

        const data = [
            {
                x: labels,
                y: windSpeeds,
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Tốc độ gió (m/s)',
                line: { color: '#2563eb', width: 2.5, shape: 'spline' },
                fill: 'tozeroy',
                fillcolor: 'rgba(37, 99, 235, 0.12)',
                marker: { size: 5, color: '#2563eb' },
                yaxis: 'y1'
            },
            {
                x: labels,
                y: temps,
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Nhiệt độ (°C)',
                line: { color: '#ef4444', width: 2, shape: 'spline', dash: 'dot' },
                marker: { size: 5, color: '#ef4444' },
                yaxis: 'y2'
            }
        ];

        const lay = {
            autosize: true,
            height: 180,
            margin: { l: 38, r: 38, t: 10, b: 30 },
            legend: {
                orientation: 'h',
                x: 0,
                y: 1.25,
                font: { size: 10 }
            },
            xaxis: {
                tickfont: { size: 9 },
                showgrid: false
            },
            yaxis: {
                title: { text: 'm/s', font: { size: 10, color: '#2563eb' } },
                tickfont: { size: 9, color: '#2563eb' },
                showgrid: true,
                gridcolor: '#f1f5f9'
            },
            yaxis2: {
                title: { text: '°C', font: { size: 10, color: '#ef4444' } },
                tickfont: { size: 9, color: '#ef4444' },
                overlaying: 'y',
                side: 'right',
                showgrid: false
            },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent'
        };

        return { chartData: data, layout: lay };
    }, [point]);

    return (
        <div
            style={{
                position: 'absolute',
                top: '24px',
                right: '28px',
                width: '360px',
                backgroundColor: 'rgba(255, 255, 255, 0.96)',
                backdropFilter: 'blur(8px)',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                border: '1px solid rgba(226, 232, 240, 0.9)',
                padding: '14px',
                zIndex: 1000,
                pointerEvents: 'auto'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '13px', color: '#1e293b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa fa-line-chart" style={{ color: '#2563eb' }} />
                    Dự báo Lưới tại Điểm
                </h4>
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: '#64748b',
                        padding: '2px 6px'
                    }}
                >
                    <i className="fa fa-times" />
                </button>
            </div>

            <div style={{ fontSize: '11px', color: '#475569', marginBottom: '8px', background: '#f8fafc', padding: '5px 8px', borderRadius: '4px' }}>
                <strong>Tọa độ:</strong> {point.lat.toFixed(4)}°N, {point.lng.toFixed(4)}°E
            </div>

            <div style={{ height: '180px', width: '100%' }}>
                <Plot
                    data={chartData}
                    layout={layout}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: '100%', height: '100%' }}
                />
            </div>
        </div>
    );
};

PointGridChartPlotly.propTypes = {
    point: PropTypes.shape({
        lat: PropTypes.number.isRequired,
        lng: PropTypes.number.isRequired
    }),
    onClose: PropTypes.func.isRequired
};

export default PointGridChartPlotly;
