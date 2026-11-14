import React from 'react';
import PropTypes from 'prop-types';
import Plot from 'react-plotly.js';
import { Panel } from 'react-bootstrap';
import { VARIABLES_MAP } from './WindStationFilterControls';

const WindStationPlotlyChart = ({
    viewMode,
    variable,
    observations,
    summaryResults,
    loading
}) => {
    const currentVar = VARIABLES_MAP[variable] || VARIABLES_MAP.wind_speed;

    if (loading) {
        return (
            <Panel header={<h4>Biểu đồ phân tích</h4>}>
                <div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                    <i className="fa fa-spinner fa-spin fa-2x" style={{ color: '#3b82f6', marginRight: '10px' }} />
                    <span>Đang tải chuỗi số liệu biểu đồ...</span>
                </div>
            </Panel>
        );
    }

    const isEmpty = viewMode === 'raw' ? (!observations || observations.length === 0) : (!summaryResults || summaryResults.length === 0);

    if (isEmpty) {
        return (
            <Panel header={<h4>Biểu đồ phân tích</h4>}>
                <div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexDirection: 'column' }}>
                    <i className="fa fa-line-chart fa-3x" style={{ color: '#cbd5e1', marginBottom: '10px' }} />
                    <span>Không có dữ liệu đo đạc nào trong khoảng thời gian đã chọn.</span>
                </div>
            </Panel>
        );
    }

    let plotData = [];

    if (viewMode === 'raw') {
        const xValues = (observations || []).map(item => new Date(item.obs_time).toLocaleString('vi-VN'));
        const yValues = (observations || []).map(item => item[variable]);

        plotData = [
            {
                x: xValues,
                y: yValues,
                type: 'scatter',
                mode: 'lines+markers',
                name: `${currentVar.label} (${currentVar.unit})`,
                line: { color: currentVar.color, width: 2 },
                marker: { size: 4 }
            }
        ];
    } else {
        const xValues = (summaryResults || []).map(item => {
            const timeStr = viewMode === 'monthly' ? item.month : item.year;
            return timeStr ? (viewMode === 'monthly' ? timeStr.slice(0, 7) : timeStr.slice(0, 4)) : 'N/A';
        });

        plotData = [
            {
                x: xValues,
                y: (summaryResults || []).map(item => item[`${variable}_avg`]),
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Trung bình (Avg)',
                line: { color: currentVar.color, width: 2.5 }
            },
            {
                x: xValues,
                y: (summaryResults || []).map(item => item[`${variable}_median`]),
                type: 'scatter',
                mode: 'lines',
                name: 'Trung vị (Median)',
                line: { color: '#059669', width: 2, dash: 'dash' }
            },
            {
                x: xValues,
                y: (summaryResults || []).map(item => item[`${variable}_max`]),
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Cực đại (Max)',
                line: { color: '#dc2626', width: 1.5 }
            },
            {
                x: xValues,
                y: (summaryResults || []).map(item => item[`${variable}_min`]),
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Cực tiểu (Min)',
                line: { color: '#0284c7', width: 1.5 }
            }
        ];
    }

    const layout = {
        autosize: true,
        height: 350,
        margin: { l: 50, r: 30, t: 30, b: 60 },
        xaxis: {
            title: 'Thời gian',
            tickangle: -30
        },
        yaxis: {
            title: `${currentVar.label} (${currentVar.unit})`
        },
        legend: {
            orientation: 'h',
            y: 1.15
        }
    };

    return (
        <Panel header={<h4>{viewMode === 'raw' ? 'Chuỗi số liệu quan trắc thực tế' : `Biểu đồ thống kê ${currentVar.label} theo ${viewMode === 'monthly' ? 'tháng' : 'năm'}`}</h4>}>
            <Plot
                data={plotData}
                layout={layout}
                useResizeHandler
                style={{ width: '100%', height: '100%' }}
                config={{ responsive: true, displayModeBar: true }}
            />
        </Panel>
    );
};

WindStationPlotlyChart.propTypes = {
    viewMode: PropTypes.string.isRequired,
    variable: PropTypes.string.isRequired,
    observations: PropTypes.array,
    summaryResults: PropTypes.array,
    loading: PropTypes.bool
};

export default WindStationPlotlyChart;
