import React from 'react';
import PropTypes from 'prop-types';
import { Panel, Table } from 'react-bootstrap';
import { VARIABLES_MAP } from './WindStationFilterControls';

const WindStationDataTable = ({ viewMode, variable, observations, summaryResults, loading }) => {
    const currentVar = VARIABLES_MAP[variable] || VARIABLES_MAP.wind_speed;
    const isRaw = viewMode === 'raw';

    return (
        <Panel header={<h4>Bảng số liệu chi tiết</h4>}>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                        <i className="fa fa-spinner fa-spin" /> Đang tải bảng số liệu...
                    </div>
                ) : isRaw ? (
                    <Table striped bordered condensed hover responsive style={{ fontSize: '12px', margin: 0 }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8fafc' }}>
                                <th>Thời gian</th>
                                <th>Tốc độ gió (m/s)</th>
                                <th>Hướng gió (°)</th>
                                <th>Nhiệt độ (°C)</th>
                                <th>Độ ẩm (%)</th>
                                <th>Khí áp (hPa)</th>
                                <th>Mưa 6h (mm)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!observations || observations.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '15px' }}>Không có dữ liệu.</td>
                                </tr>
                            ) : (
                                observations.map(obs => (
                                    <tr key={obs.id}>
                                        <td>{new Date(obs.obs_time).toLocaleString('vi-VN')}</td>
                                        <td><strong>{obs.wind_speed ?? '-'}</strong></td>
                                        <td>{obs.wind_dir ?? '-'}</td>
                                        <td>{obs.temp_2m ?? '-'}</td>
                                        <td>{obs.humidity ?? '-'}</td>
                                        <td>{obs.pressure ?? '-'}</td>
                                        <td>{obs.rain_06h ?? '-'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </Table>
                ) : (
                    <Table striped bordered condensed hover responsive style={{ fontSize: '12px', margin: 0 }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8fafc' }}>
                                <th>Thời gian</th>
                                <th>Chỉ số</th>
                                <th>Số mẫu</th>
                                <th style={{ color: '#0284c7' }}>Cực tiểu (Min)</th>
                                <th style={{ color: '#dc2626' }}>Cực đại (Max)</th>
                                <th>Trung bình (Avg)</th>
                                <th style={{ color: '#059669' }}>Trung vị (Median)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!summaryResults || summaryResults.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '15px' }}>Không có dữ liệu thống kê.</td>
                                </tr>
                            ) : (
                                summaryResults.map((item, idx) => {
                                    const timeStr = viewMode === 'monthly' ? item.month : item.year;
                                    return (
                                        <tr key={idx}>
                                            <td><strong>{timeStr ? (viewMode === 'monthly' ? timeStr.slice(0, 7) : timeStr.slice(0, 4)) : 'N/A'}</strong></td>
                                            <td>{currentVar.label} ({currentVar.unit})</td>
                                            <td>{item.total_records}</td>
                                            <td style={{ color: '#0284c7' }}>{item[`${variable}_min`] !== null && item[`${variable}_min`] !== undefined ? Number(item[`${variable}_min`]).toFixed(2) : '-'}</td>
                                            <td style={{ color: '#dc2626' }}>{item[`${variable}_max`] !== null && item[`${variable}_max`] !== undefined ? Number(item[`${variable}_max`]).toFixed(2) : '-'}</td>
                                            <td><strong>{item[`${variable}_avg`] !== null && item[`${variable}_avg`] !== undefined ? Number(item[`${variable}_avg`]).toFixed(2) : '-'}</strong></td>
                                            <td style={{ color: '#059669' }}>{item[`${variable}_median`] !== null && item[`${variable}_median`] !== undefined ? Number(item[`${variable}_median`]).toFixed(2) : '-'}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </Table>
                )}
            </div>
        </Panel>
    );
};

WindStationDataTable.propTypes = {
    viewMode: PropTypes.string.isRequired,
    variable: PropTypes.string.isRequired,
    observations: PropTypes.array,
    summaryResults: PropTypes.array,
    loading: PropTypes.bool
};

export default WindStationDataTable;
