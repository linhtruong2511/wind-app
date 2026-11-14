import React from 'react';
import PropTypes from 'prop-types';
import Plot from 'react-plotly.js';
import { Row, Col, Panel, FormGroup, FormControl, ControlLabel, Alert } from 'react-bootstrap';

const COMPARE_METRICS = [
    { value: 'wind_speed', label: 'Tốc độ gió (m/s)', unit: 'm/s' },
    { value: 'temp_2m', label: 'Nhiệt độ ở 2 m (°C)', unit: '°C' },
    { value: 'pressure', label: 'Khí áp (hPa)', unit: 'hPa' },
    { value: 'humidity', label: 'Độ ẩm (%)', unit: '%' }
];

const COLOR_PALETTE = [
    '#2563eb', '#16a34a', '#dc2626', '#d97706', '#9333ea',
    '#0891b2', '#be123c', '#4f46e5', '#ca8a04', '#059669'
];

const WindMultiStationTab = ({
    compareData,
    compareMetric,
    setCompareMetric,
    compareInterval,
    setCompareInterval,
    selectedStationIds,
    loading
}) => {
    const currentMetricInfo = COMPARE_METRICS.find(m => m.value === compareMetric) || COMPARE_METRICS[0];

    if (loading) {
        return (
            <div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                <i className="fa fa-spinner fa-spin fa-2x" style={{ color: '#3b82f6', marginRight: '10px' }} />
                <span>Đang tổng hợp dữ liệu so sánh chuỗi thời gian...</span>
            </div>
        );
    }

    if (!selectedStationIds || selectedStationIds.length === 0) {
        return (
            <Alert bsStyle="info" style={{ marginTop: '10px' }}>
                <h4><i className="fa fa-info-circle" /> Chưa chọn trạm quan trắc</h4>
                <p>Vui lòng chọn từ 1 đến 10 trạm trong <strong>bộ lọc phân tích</strong> phía trên để so sánh đối chiếu số liệu.</p>
            </Alert>
        );
    }

    const { timestamps = [], series = [] } = compareData || {};

    if (series.length === 0 || timestamps.length === 0) {
        return (
            <Alert bsStyle="warning" style={{ marginTop: '10px' }}>
                <h4><i className="fa fa-exclamation-triangle" /> Không có dữ liệu so sánh</h4>
                <p>Không tìm thấy bản ghi quan trắc đồng thời của các trạm đã chọn trong khoảng thời gian này.</p>
            </Alert>
        );
    }

    // 1. Dữ liệu Multi-line Plotly
    const multiLineData = series.map((s, index) => ({
        x: timestamps,
        y: s.values,
        type: 'scatter',
        mode: 'lines+markers',
        name: s.station_name,
        line: { color: COLOR_PALETTE[index % COLOR_PALETTE.length], width: 2 },
        marker: { size: 4 }
    }));

    const multiLineLayout = {
        autosize: true,
        height: 380,
        margin: { l: 60, r: 30, t: 20, b: 60 },
        xaxis: { title: 'Mốc thời gian', tickangle: -30 },
        yaxis: { title: `${currentMetricInfo.label}` },
        legend: { orientation: 'h', y: 1.15 }
    };

    // 2. Dữ liệu Scatter Plot tương quan giữa 2 trạm đầu tiên (nếu có >= 2 trạm)
    let scatterPlotData = [];
    let station1Name = '';
    let station2Name = '';
    if (series.length >= 2) {
        const s1 = series[0];
        const s2 = series[1];
        station1Name = s1.station_name;
        station2Name = s2.station_name;

        const pairedX = [];
        const pairedY = [];
        for (let i = 0; i < timestamps.length; i++) {
            if (s1.values[i] !== null && s1.values[i] !== undefined &&
                s2.values[i] !== null && s2.values[i] !== undefined) {
                pairedX.push(s1.values[i]);
                pairedY.push(s2.values[i]);
            }
        }

        scatterPlotData = [
            {
                x: pairedX,
                y: pairedY,
                mode: 'markers',
                type: 'scatter',
                name: 'Điểm tương quan',
                marker: { size: 7, color: '#3b82f6', opacity: 0.7 }
            }
        ];
    }

    const scatterLayout = {
        autosize: true,
        height: 380,
        margin: { l: 60, r: 30, t: 20, b: 60 },
        xaxis: { title: `${station1Name} (${currentMetricInfo.unit})` },
        yaxis: { title: `${station2Name} (${currentMetricInfo.unit})` }
    };

    return (
        <div>
            {/* Thanh tùy chọn yếu tố so sánh */}
            <Panel style={{ marginBottom: '15px' }}>
                <Row>
                    <Col xs={12} sm={6} md={4}>
                        <FormGroup controlId="compareMetricSelect" style={{ margin: 0 }}>
                            <ControlLabel style={{ fontSize: '12px' }}>Yếu tố so sánh đối chiếu</ControlLabel>
                            <FormControl
                                componentClass="select"
                                value={compareMetric}
                                onChange={(e) => setCompareMetric(e.target.value)}
                                style={{ height: '34px', fontSize: '12px', fontWeight: 600 }}
                            >
                                {COMPARE_METRICS.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </FormControl>
                        </FormGroup>
                    </Col>
                    <Col xs={12} sm={6} md={3}>
                        <FormGroup controlId="compareIntervalSelect" style={{ margin: 0 }}>
                            <ControlLabel style={{ fontSize: '12px' }}>Bước thời gian gom nhóm</ControlLabel>
                            <FormControl
                                componentClass="select"
                                value={compareInterval}
                                onChange={(e) => setCompareInterval(e.target.value)}
                                style={{ height: '34px', fontSize: '12px' }}
                            >
                                <option value="month">Gom nhóm theo tháng, trung bình</option>
                                <option value="day">Gom nhóm theo ngày, trung bình</option>
                            </FormControl>
                        </FormGroup>
                    </Col>
                </Row>
            </Panel>

            {/* Biểu đồ Multi-line so sánh chuỗi thời gian */}
            <Row>
                <Col xs={12} md={series.length >= 2 ? 8 : 12}>
                    <Panel header={<span style={{ fontWeight: 600 }}><i className="fa fa-line-chart" /> Diễn biến chuỗi thời gian đồng thời ({series.length} trạm)</span>}>
                        <Plot
                            data={multiLineData}
                            layout={multiLineLayout}
                            useResizeHandler
                            style={{ width: '100%', height: '100%' }}
                            config={{ responsive: true, displayModeBar: true }}
                        />
                    </Panel>
                </Col>

                {/* Biểu đồ phân tán Scatter Plot tương quan nếu có >= 2 trạm */}
                {series.length >= 2 && (
                    <Col xs={12} md={4}>
                        <Panel header={<span style={{ fontWeight: 600 }}><i className="fa fa-arrows-h" /> Tương quan giữa 2 trạm</span>}>
                            <Plot
                                data={scatterPlotData}
                                layout={scatterLayout}
                                useResizeHandler
                                style={{ width: '100%', height: '100%' }}
                                config={{ responsive: true, displayModeBar: false }}
                            />
                        </Panel>
                    </Col>
                )}
            </Row>
        </div>
    );
};

WindMultiStationTab.propTypes = {
    compareData: PropTypes.object,
    compareMetric: PropTypes.string.isRequired,
    setCompareMetric: PropTypes.func.isRequired,
    compareInterval: PropTypes.string.isRequired,
    setCompareInterval: PropTypes.func.isRequired,
    selectedStationIds: PropTypes.array.isRequired,
    loading: PropTypes.bool
};

export default WindMultiStationTab;
