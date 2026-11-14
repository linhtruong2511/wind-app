import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Panel, Table, FormGroup, FormControl, Row, Col, Pagination } from 'react-bootstrap';

const WindReportTab = ({
    reportData = [],
    exportUrl = '',
    loading = false
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState('name');
    const [sortAsc, setSortAsc] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(true);
        }
    };

    // Filter & Sort
    const processedData = useMemo(() => {
        let result = [...(reportData || [])];

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(item =>
                (item.name && item.name.toLowerCase().includes(lower)) ||
                (item.station_code && item.station_code.toLowerCase().includes(lower)) ||
                (item.province && item.province.toLowerCase().includes(lower))
            );
        }

        result.sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];
            if (valA === undefined || valA === null) valA = '';
            if (valB === undefined || valB === null) valB = '';

            if (typeof valA === 'number' && typeof valB === 'number') {
                return sortAsc ? valA - valB : valB - valA;
            }
            return sortAsc
                ? String(valA).localeCompare(String(valB))
                : String(valB).localeCompare(String(valA));
        });

        return result;
    }, [reportData, searchTerm, sortField, sortAsc]);

    // Pagination
    const totalPages = Math.ceil(processedData.length / pageSize) || 1;
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return processedData.slice(start, start + pageSize);
    }, [processedData, currentPage, pageSize]);

    return (
        <Panel header={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}><i className="fa fa-table" /> Bảng thống kê tổng hợp mạng lưới trạm</span>
                {exportUrl && (
                    <a
                        href={exportUrl}
                        download="wind_statistics_summary.csv"
                        className="btn btn-success btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        <i className="fa fa-download" /> Xuất tệp CSV
                    </a>
                )}
            </div>
        }>
            {/* Thanh công cụ tìm kiếm và phân trang */}
            <Row style={{ marginBottom: '15px' }}>
                <Col xs={12} sm={6} md={4}>
                    <FormGroup style={{ margin: 0 }}>
                        <FormControl
                            type="text"
                            placeholder="Tìm kiếm trạm, mã trạm, tỉnh thành..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            style={{ height: '34px', fontSize: '12px' }}
                        />
                    </FormGroup>
                </Col>

                <Col xs={12} sm={6} md={3}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '34px' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>Hiển thị:</span>
                        <FormControl
                            componentClass="select"
                            value={pageSize}
                            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                            style={{ height: '34px', fontSize: '12px', width: '100px' }}
                        >
                            <option value={10}>10 dòng</option>
                            <option value={15}>15 dòng</option>
                            <option value={25}>25 dòng</option>
                            <option value={50}>50 dòng</option>
                        </FormControl>
                    </div>
                </Col>

                <Col xs={12} sm={12} md={5} style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '34px' }}>
                        Hiển thị {paginatedData.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, processedData.length)} trên tổng số {processedData.length} trạm
                    </div>
                </Col>
            </Row>

            {/* Bảng số liệu */}
            <div style={{ overflowX: 'auto' }}>
                <Table striped bordered hover responsive style={{ fontSize: '12px', marginBottom: '10px' }}>
                    <thead style={{ background: '#f1f5f9', color: '#334155' }}>
                        <tr>
                            <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('station_code')}>
                                Mã trạm {sortField === 'station_code' && (sortAsc ? '▲' : '▼')}
                            </th>
                            <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('name')}>
                                Tên trạm {sortField === 'name' && (sortAsc ? '▲' : '▼')}
                            </th>
                            <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('province')}>
                                Tỉnh hoặc khu vực {sortField === 'province' && (sortAsc ? '▲' : '▼')}
                            </th>
                            <th style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right' }} onClick={() => handleSort('wind_speed_avg')}>
                                Gió trung bình (m/s) {sortField === 'wind_speed_avg' && (sortAsc ? '▲' : '▼')}
                            </th>
                            <th style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right' }} onClick={() => handleSort('wind_speed_max')}>
                                Gió cực đại (m/s) {sortField === 'wind_speed_max' && (sortAsc ? '▲' : '▼')}
                            </th>
                            <th style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right' }} onClick={() => handleSort('temp_avg')}>
                                Nhiệt độ trung bình (°C) {sortField === 'temp_avg' && (sortAsc ? '▲' : '▼')}
                            </th>
                            <th style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right' }} onClick={() => handleSort('temp_max')}>
                                Nhiệt độ cao nhất (°C) {sortField === 'temp_max' && (sortAsc ? '▲' : '▼')}
                            </th>
                            <th style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right' }} onClick={() => handleSort('temp_min')}>
                                Nhiệt độ thấp nhất (°C) {sortField === 'temp_min' && (sortAsc ? '▲' : '▼')}
                            </th>
                            <th style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right' }} onClick={() => handleSort('pressure_avg')}>
                                Khí áp trung bình (hPa) {sortField === 'pressure_avg' && (sortAsc ? '▲' : '▼')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                                    <i className="fa fa-spinner fa-spin fa-2x" style={{ color: '#3b82f6', marginBottom: '8px', display: 'block' }} />
                                    Đang nạp bảng số liệu thống kê...
                                </td>
                            </tr>
                        ) : paginatedData.length === 0 ? (
                            <tr>
                                <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                    Không tìm thấy trạm nào phù hợp với bộ lọc hiện tại.
                                </td>
                            </tr>
                        ) : (
                            paginatedData.map((row) => (
                                <tr key={row.id || row.station_code}>
                                    <td style={{ fontWeight: 600, color: '#1e40af' }}>{row.station_code}</td>
                                    <td style={{ fontWeight: 600 }}>{row.name}</td>
                                    <td>{row.province || '-'}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#0284c7' }}>
                                        {row.wind_speed_avg !== undefined && row.wind_speed_avg !== null ? Number(row.wind_speed_avg).toFixed(1) : '-'}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                                        {row.wind_speed_max !== undefined && row.wind_speed_max !== null ? Number(row.wind_speed_max).toFixed(1) : '-'}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        {row.temp_avg !== undefined && row.temp_avg !== null ? Number(row.temp_avg).toFixed(1) : '-'}
                                    </td>
                                    <td style={{ textAlign: 'right', color: '#ea580c' }}>
                                        {row.temp_max !== undefined && row.temp_max !== null ? Number(row.temp_max).toFixed(1) : '-'}
                                    </td>
                                    <td style={{ textAlign: 'right', color: '#0284c7' }}>
                                        {row.temp_min !== undefined && row.temp_min !== null ? Number(row.temp_min).toFixed(1) : '-'}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        {row.pressure_avg !== undefined && row.pressure_avg !== null ? Number(row.pressure_avg).toFixed(1) : '-'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </Table>
            </div>

            {/* Phân trang */}
            {totalPages > 1 && (
                <div style={{ textAlign: 'center', marginTop: '10px' }}>
                    <Pagination
                        bsSize="small"
                        items={totalPages}
                        activePage={currentPage}
                        onSelect={(page) => setCurrentPage(page)}
                        maxButtons={5}
                        boundaryLinks
                        prev
                        next
                        first
                        last
                    />
                </div>
            )}
        </Panel>
    );
};

WindReportTab.propTypes = {
    reportData: PropTypes.array,
    exportUrl: PropTypes.string,
    loading: PropTypes.bool
};

export default WindReportTab;
