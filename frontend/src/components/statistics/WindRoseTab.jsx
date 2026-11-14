import React from 'react';
import PropTypes from 'prop-types';
import Plot from 'react-plotly.js';
import { Row, Col, Panel, FormGroup, FormControl, ControlLabel, Alert } from 'react-bootstrap';

const SPEED_BIN_COLORS = [
    '#bae6fd', // 0-2 m/s (xanh nhạt)
    '#38bdf8', // 2-4 m/s (xanh da trời)
    '#0284c7', // 4-6 m/s (xanh dương)
    '#1d4ed8', // 6-8 m/s (xanh đậm)
    '#f59e0b', // 8-10 m/s (vàng cam)
    '#dc2626'  // >10 m/s (đỏ)
];

const WindRoseTab = ({
    windRoseData,
    stations = [],
    selectedStationId,
    setSelectedStationId,
    loading
}) => {
    if (loading) {
        return (
            <div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                <i className="fa fa-spinner fa-spin fa-2x" style={{ color: '#3b82f6', marginRight: '10px' }} />
                <span>Đang tính toán phân bố hoa gió và phân vị...</span>
            </div>
        );
    }

    const {
        total_records = 0,
        calm_percent = 0.0,
        avg_wind_speed = 0.0,
        directions = [],
        speed_bins = [],
        distribution = {}
    } = windRoseData || {};

    if (total_records === 0) {
        return (
            <div>
                {/* Bộ chọn trạm */}
                <Panel style={{ marginBottom: '15px' }}>
                    <FormGroup controlId="windRoseStationSelect" style={{ margin: 0, maxWidth: '400px' }}>
                        <ControlLabel style={{ fontSize: '12px' }}>Trạm quan sát hoa gió</ControlLabel>
                        <FormControl
                            componentClass="select"
                            value={selectedStationId || ''}
                            onChange={(e) => setSelectedStationId(e.target.value)}
                            style={{ height: '34px', fontSize: '12px' }}
                        >
                            <option value="">Toàn bộ mạng lưới (Tổng hợp)</option>
                            {stations.map(st => (
                                <option key={st.id} value={st.id}>{st.name} ({st.station_code})</option>
                            ))}
                        </FormControl>
                    </FormGroup>
                </Panel>

                <Alert bsStyle="warning">
                    <h4><i className="fa fa-info-circle" /> Không có dữ liệu quan trắc</h4>
                    <p>Không có đủ số liệu vận tốc và hướng gió trong khoảng thời gian đã chọn để vẽ hoa gió.</p>
                </Alert>
            </div>
        );
    }

    // 1. Cấu hình biểu đồ Hoa Gió Polar Plotly (barpolar)
    const polarPlotData = (speed_bins || []).map((bin, index) => ({
        type: 'barpolar',
        r: bin.values,
        theta: directions,
        name: bin.label,
        marker: {
            color: SPEED_BIN_COLORS[index % SPEED_BIN_COLORS.length]
        }
    }));

    const polarLayout = {
        autosize: true,
        height: 420,
        margin: { l: 40, r: 40, t: 30, b: 30 },
        polar: {
            radialaxis: {
                visible: true,
                ticksuffix: '%',
                angle: 45,
                dtick: 5
            },
            angularaxis: {
                direction: 'clockwise',
                rotation: 90
            }
        },
        legend: {
            orientation: 'h',
            y: -0.15
        }
    };

    // 2. Cấu hình biểu đồ Phân bố vận tốc gió (Histogram / Bar)
    const speedRanges = distribution.speed_ranges || [];
    const speedCounts = distribution.counts || [];
    const percentiles = distribution.percentiles || {};

    const distPlotData = [
        {
            type: 'bar',
            x: speedRanges.map(r => `${r} m/s`),
            y: speedCounts,
            marker: {
                color: SPEED_BIN_COLORS
            },
            text: speedCounts.map(c => `${c} bản ghi`),
            textposition: 'auto'
        }
    ];

    const distLayout = {
        autosize: true,
        height: 300,
        margin: { l: 50, r: 20, t: 20, b: 40 },
        xaxis: { title: 'Dải tốc độ gió (m/s)' },
        yaxis: { title: 'Số lần xuất hiện' }
    };

    return (
        <div>
            {/* Bộ chọn trạm quan sát */}
            <Panel style={{ marginBottom: '15px' }}>
                <Row>
                    <Col xs={12} sm={6} md={4}>
                        <FormGroup controlId="windRoseStationSelect" style={{ margin: 0 }}>
                            <ControlLabel style={{ fontSize: '12px' }}>Trạm quan sát hoa gió</ControlLabel>
                            <FormControl
                                componentClass="select"
                                value={selectedStationId || ''}
                                onChange={(e) => setSelectedStationId(e.target.value)}
                                style={{ height: '34px', fontSize: '12px', fontWeight: 600 }}
                            >
                                <option value="">Toàn bộ mạng lưới (Tổng hợp)</option>
                                {stations.map(st => (
                                    <option key={st.id} value={st.id}>{st.name} ({st.station_code})</option>
                                ))}
                            </FormControl>
                        </FormGroup>
                    </Col>
                    <Col xs={12} sm={6} md={8}>
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', height: '100%', paddingTop: '15px' }}>
                            <span style={{ fontSize: '13px', color: '#475569' }}>
                                Tổng quan trắc: <strong>{total_records.toLocaleString()}</strong>
                            </span>
                            <span style={{ fontSize: '13px', color: '#475569' }}>
                                Tỷ lệ lặng gió (&lt;0.5m/s): <strong>{calm_percent}%</strong>
                            </span>
                            <span style={{ fontSize: '13px', color: '#475569' }}>
                                Vận tốc TB: <strong>{avg_wind_speed} m/s</strong>
                            </span>
                        </div>
                    </Col>
                </Row>
            </Panel>

            <Row>
                {/* Cột trái: Biểu đồ Hoa gió 16 hướng */}
                <Col xs={12} md={7}>
                    <Panel header={<span style={{ fontWeight: 600 }}><i className="fa fa-compass" /> Biểu Đồ Hoa Gió 16 Hướng (Wind Rose)</span>}>
                        <Plot
                            data={polarPlotData}
                            layout={polarLayout}
                            useResizeHandler
                            style={{ width: '100%', height: '100%' }}
                            config={{ responsive: true, displayModeBar: true }}
                        />
                    </Panel>
                </Col>

                {/* Cột phải: Phân bố tần suất & Bảng phân vị */}
                <Col xs={12} md={5}>
                    <Panel header={<span style={{ fontWeight: 600 }}><i className="fa fa-bar-chart" /> Phân Bố Tần Suất Vận Tốc Gió</span>}>
                        <Plot
                            data={distPlotData}
                            layout={distLayout}
                            useResizeHandler
                            style={{ width: '100%', height: '100%' }}
                            config={{ responsive: true, displayModeBar: false }}
                        />
                    </Panel>

                    <Panel header={<span style={{ fontWeight: 600 }}><i className="fa fa-calculator" /> Các Chỉ Số Phân Vị Vận Tốc (Percentiles)</span>}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', textAlign: 'center' }}>
                            <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>P50 (Trung vị)</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0284c7' }}>{percentiles.p50 || 0} <span style={{ fontSize: '11px' }}>m/s</span></div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>P75</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#16a34a' }}>{percentiles.p75 || 0} <span style={{ fontSize: '11px' }}>m/s</span></div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>P90</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#d97706' }}>{percentiles.p90 || 0} <span style={{ fontSize: '11px' }}>m/s</span></div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>P99 (Cực đoan)</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#dc2626' }}>{percentiles.p99 || 0} <span style={{ fontSize: '11px' }}>m/s</span></div>
                            </div>
                        </div>
                    </Panel>
                </Col>
            </Row>
        </div>
    );
};

WindRoseTab.propTypes = {
    windRoseData: PropTypes.object,
    stations: PropTypes.array,
    selectedStationId: PropTypes.string,
    setSelectedStationId: PropTypes.func.isRequired,
    loading: PropTypes.bool
};

export default WindRoseTab;
