import React from 'react';
import PropTypes from 'prop-types';
import Plot from 'react-plotly.js';
import { Row, Col, Panel, FormGroup, FormControl } from 'react-bootstrap';

const METRIC_OPTIONS = [
    { value: 'wind_speed_max', label: 'Vận tốc gió cực đại (Max Wind Speed - m/s)' },
    { value: 'wind_speed_avg', label: 'Vận tốc gió trung bình (Avg Wind Speed - m/s)' },
    { value: 'temp_max', label: 'Nhiệt độ cực đại (Max Temp - °C)' },
    { value: 'temp_min', label: 'Nhiệt độ cực tiểu (Min Temp - °C)' },
    { value: 'rain_24h_max', label: 'Lượng mưa 24h lớn nhất (Max Rain - mm)' },
    { value: 'pressure_min', label: 'Khí áp thấp nhất (Min Pressure - hPa)' }
];

const WindOverviewTab = ({
    overviewData,
    rankingsData,
    rankingMetric,
    setRankingMetric,
    loading
}) => {
    if (loading) {
        return (
            <div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                <i className="fa fa-spinner fa-spin fa-2x" style={{ color: '#3b82f6', marginRight: '10px' }} />
                <span>Đang tổng hợp dữ liệu toàn mạng lưới...</span>
            </div>
        );
    }

    const {
        total_stations = 0,
        active_stations = 0,
        total_observations = 0,
        date_range = {},
        stations_by_type = [],
        max_wind_recorded = null
    } = overviewData || {};

    const minDateStr = date_range?.min_date ? new Date(date_range.min_date).toLocaleDateString('vi-VN') : 'N/A';
    const maxDateStr = date_range?.max_date ? new Date(date_range.max_date).toLocaleDateString('vi-VN') : 'N/A';

    // Xây dựng biểu đồ Top Rankings
    const rankings = rankingsData?.rankings || [];
    const rankingY = rankings.map(r => r.station_name || `Trạm ${r.station_id}`).reverse();
    const rankingX = rankings.map(r => r.value).reverse();

    const rankingPlotData = [
        {
            type: 'bar',
            orientation: 'h',
            x: rankingX,
            y: rankingY,
            marker: {
                color: rankingX.map((_, i) => `hsl(${210 + i * 10}, 80%, ${45 + i * 2}%)`)
            },
            text: rankingX.map(v => `${v}`),
            textposition: 'auto'
        }
    ];

    const rankingLayout = {
        autosize: true,
        height: 360,
        margin: { l: 150, r: 30, t: 20, b: 40 },
        xaxis: { title: 'Giá trị quan trắc' },
        yaxis: { automargin: true }
    };

    // Xây dựng biểu đồ phân loại trạm (Donut Chart)
    const piePlotData = [
        {
            type: 'pie',
            labels: stations_by_type.map(t => t.station_type || 'Khác'),
            values: stations_by_type.map(t => t.count),
            hole: 0.45,
            marker: {
                colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']
            },
            textinfo: 'label+percent'
        }
    ];

    const pieLayout = {
        autosize: true,
        height: 360,
        margin: { l: 20, r: 20, t: 20, b: 20 },
        showlegend: true,
        legend: { orientation: 'h', y: -0.1 }
    };

    return (
        <div>
            {/* 1. Hàng 4 thẻ KPI chỉ số */}
            <Row style={{ marginBottom: '15px' }}>
                <Col xs={12} sm={6} md={3}>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '16px', borderLeft: '4px solid #3b82f6', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Tổng Trạm Quan Trắc</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>
                            {total_stations} <span style={{ fontSize: '13px', fontWeight: 'normal', color: '#10b981' }}>({active_stations} hoạt động)</span>
                        </div>
                    </div>
                </Col>
                <Col xs={12} sm={6} md={3}>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '16px', borderLeft: '4px solid #10b981', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Tổng Bản Ghi Quan Trắc</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>
                            {total_observations.toLocaleString()}
                        </div>
                    </div>
                </Col>
                <Col xs={12} sm={6} md={3}>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '16px', borderLeft: '4px solid #ef4444', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Gió Cực Đại Ghi Nhận</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>
                            {max_wind_recorded ? `${max_wind_recorded.wind_speed} m/s` : 'N/A'}
                        </div>
                        {max_wind_recorded?.station_name && (
                            <div style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {max_wind_recorded.station_name}
                            </div>
                        )}
                    </div>
                </Col>
                <Col xs={12} sm={6} md={3}>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '16px', borderLeft: '4px solid #8b5cf6', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Khoảng Thời Gian Dữ Liệu</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginTop: '8px' }}>
                            {minDateStr} &rarr; {maxDateStr}
                        </div>
                    </div>
                </Col>
            </Row>

            {/* 2. Hàng 2 biểu đồ: Xếp hạng Top & Cơ cấu loại trạm */}
            <Row>
                <Col xs={12} md={7}>
                    <Panel header={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600 }}><i className="fa fa-trophy" /> Bảng Xếp Hạng Trạm Quan Trắc</span>
                            <FormGroup style={{ margin: 0, width: '260px' }}>
                                <FormControl
                                    componentClass="select"
                                    value={rankingMetric}
                                    onChange={(e) => setRankingMetric(e.target.value)}
                                    style={{ height: '30px', fontSize: '11px' }}
                                >
                                    {METRIC_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </FormControl>
                            </FormGroup>
                        </div>
                    }>
                        {rankings.length === 0 ? (
                            <div style={{ height: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                Không có dữ liệu xếp hạng trong kỳ đã chọn.
                            </div>
                        ) : (
                            <Plot
                                data={rankingPlotData}
                                layout={rankingLayout}
                                useResizeHandler
                                style={{ width: '100%', height: '100%' }}
                                config={{ responsive: true, displayModeBar: false }}
                            />
                        )}
                    </Panel>
                </Col>

                <Col xs={12} md={5}>
                    <Panel header={<span style={{ fontWeight: 600 }}><i className="fa fa-pie-chart" /> Cơ Cấu Loại Trạm Quan Trắc</span>}>
                        {stations_by_type.length === 0 ? (
                            <div style={{ height: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                Không có dữ liệu loại trạm.
                            </div>
                        ) : (
                            <Plot
                                data={piePlotData}
                                layout={pieLayout}
                                useResizeHandler
                                style={{ width: '100%', height: '100%' }}
                                config={{ responsive: true, displayModeBar: false }}
                            />
                        )}
                    </Panel>
                </Col>
            </Row>
        </div>
    );
};

WindOverviewTab.propTypes = {
    overviewData: PropTypes.object,
    rankingsData: PropTypes.object,
    rankingMetric: PropTypes.string.isRequired,
    setRankingMetric: PropTypes.func.isRequired,
    loading: PropTypes.bool
};

export default WindOverviewTab;
