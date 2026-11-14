import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';
import { getDashboardStats } from '../../api/admin';

const AdminDashboardRoute = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadStats = () => {
        setLoading(true);
        setError(null);
        getDashboardStats()
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.response?.data?.detail || err.message || 'Không thể tải số liệu thống kê.');
                setLoading(false);
            });
    };

    useEffect(() => {
        loadStats();
    }, []);

    const renderStatusBadge = (status) => {
        switch (status) {
            case 'SUCCESS':
                return <span className="label label-success" style={{ backgroundColor: '#10b981', padding: '4px 8px', borderRadius: '4px' }}>Thành công</span>;
            case 'FAILED':
                return <span className="label label-danger" style={{ backgroundColor: '#ef4444', padding: '4px 8px', borderRadius: '4px' }}>Thất bại</span>;
            case 'RUNNING':
                return <span className="label label-primary" style={{ backgroundColor: '#0284c7', padding: '4px 8px', borderRadius: '4px' }}><i className="fa fa-spinner fa-spin" style={{ marginRight: '4px' }}></i>Đang chạy</span>;
            default:
                return <span className="label label-default" style={{ backgroundColor: '#64748b', padding: '4px 8px', borderRadius: '4px' }}>{status}</span>;
        }
    };

    const formatDate = (isoStr) => {
        if (!isoStr) return '-';
        try {
            const d = new Date(isoStr);
            return d.toLocaleString('vi-VN');
        } catch (e) {
            return isoStr;
        }
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        Tổng quan hệ thống
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
                        Hạ tầng dữ liệu khí tượng gió, trạng thái nạp dữ liệu và các tác vụ nền.
                    </p>
                </div>
                <button
                    onClick={loadStats}
                    disabled={loading}
                    className="btn btn-default"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '6px', fontWeight: 500 }}
                >
                    <i className={`fa fa-refresh ${loading ? 'fa-spin' : ''}`}></i>
                    Làm mới
                </button>
            </div>

            {error && (
                <div className="alert alert-danger" style={{ borderRadius: '8px', marginBottom: '20px' }}>
                    <i className="fa fa-exclamation-triangle" style={{ marginRight: '8px' }}></i>
                    {error}
                </div>
            )}

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '28px' }}>
                {/* Stations KPI */}
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Trạm quan trắc</div>
                            <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>
                                {loading ? '...' : (stats?.total_stations ?? 0)}
                            </div>
                        </div>
                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', fontSize: '20px' }}>
                            <i className="fa fa-map-marker"></i>
                        </div>
                    </div>
                    <div style={{ marginTop: '14px', fontSize: '13px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fa fa-check-circle"></i>
                        <span>{stats?.active_stations ?? 0} trạm đang kích hoạt</span>
                    </div>
                </div>

                {/* Rasters KPI */}
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Dữ liệu lưới</div>
                            <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>
                                {loading ? '...' : (stats?.total_granules ?? 0)}
                            </div>
                        </div>
                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9333ea', fontSize: '20px' }}>
                            <i className="fa fa-cubes"></i>
                        </div>
                    </div>
                    <div style={{ marginTop: '14px', fontSize: '13px', color: '#64748b' }}>
                        <span>Tổng số mốc giờ dữ liệu đã nạp</span>
                    </div>
                </div>

                {/* CDS Jobs KPI */}
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Tác vụ thu thập ERA5</div>
                            <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>
                                {loading ? '...' : (stats?.active_cds_jobs ?? 0)}
                            </div>
                        </div>
                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontSize: '20px' }}>
                            <i className="fa fa-cloud-download"></i>
                        </div>
                    </div>
                    <div style={{ marginTop: '14px', fontSize: '13px', color: '#0284c7' }}>
                        <span>Đang tải dữ liệu</span>
                    </div>
                </div>

                {/* Wind Energy KPI */}
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Trang trại gió</div>
                            <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>
                                {loading ? '...' : (stats?.total_farms ?? 0)}
                            </div>
                        </div>
                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', fontSize: '20px' }}>
                            <i className="fa fa-bolt"></i>
                        </div>
                    </div>
                    <div style={{ marginTop: '14px', fontSize: '13px', color: '#64748b' }}>
                        <span>{stats?.total_turbines ?? 0} tuabin đã định vị</span>
                    </div>
                </div>
            </div>

            {/* Quick Action Bar */}
            <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', marginBottom: '28px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginTop: 0, marginBottom: '16px' }}>
                    Thao tác nhanh
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                    <NavLink to="/admin/rasters" className="btn btn-default" style={{ padding: '14px', textAlign: 'left', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 600, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fa fa-upload"></i>Nạp tệp dữ liệu lưới
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Tải lên tệp dữ liệu lưới gió</div>
                    </NavLink>
                    <NavLink to="/admin/stations" className="btn btn-default" style={{ padding: '14px', textAlign: 'left', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 600, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fa fa-file-excel-o"></i>Nhập số liệu trạm
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Nạp chuỗi số liệu theo thời gian của trạm</div>
                    </NavLink>
                    <NavLink to="/admin/cds" className="btn btn-default" style={{ padding: '14px', textAlign: 'left', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 600, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fa fa-play-circle"></i>Chạy tải dữ liệu ERA5
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Thu thập dữ liệu tái phân tích châu Âu</div>
                    </NavLink>
                    <NavLink to="/admin/farms" className="btn btn-default" style={{ padding: '14px', textAlign: 'left', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 600, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fa fa-plus-circle"></i>Thêm trang trại gió
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Khai báo công suất và tọa độ tuabin</div>
                    </NavLink>
                </div>
            </div>

            {/* Recent Ingestion Logs Table */}
            <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                    <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                            Nhật ký nạp và thu thập dữ liệu gần đây
                        </h3>
                        <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
                            Theo dõi tiến trình và thông báo lỗi của các lượt nạp tệp dữ liệu.
                        </p>
                    </div>
                </div>

                <div className="table-responsive">
                    <table className="table table-hover" style={{ margin: 0 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                <th style={{ padding: '12px 14px' }}>Mã nhật ký</th>
                                <th style={{ padding: '12px 14px' }}>Bộ dữ liệu</th>
                                <th style={{ padding: '12px 14px' }}>Tệp nguồn</th>
                                <th style={{ padding: '12px 14px' }}>Trạng thái</th>
                                <th style={{ padding: '12px 14px' }}>Bản ghi</th>
                                <th style={{ padding: '12px 14px' }}>Bắt đầu lúc</th>
                                <th style={{ padding: '12px 14px' }}>Ghi chú hoặc lỗi</th>
                            </tr>
                        </thead>
                        <tbody style={{ fontSize: '13px' }}>
                            {(!stats?.recent_logs || stats.recent_logs.length === 0) ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                        Chưa có nhật ký nạp dữ liệu nào được ghi nhận.
                                    </td>
                                </tr>
                            ) : (
                                stats.recent_logs.map(log => (
                                    <tr key={log.id}>
                                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>#{log.id}</td>
                                        <td style={{ padding: '12px 14px' }}>{log.dataset__name || 'Mặc định'}</td>
                                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: '#0284c7' }}>{log.source_file}</td>
                                        <td style={{ padding: '12px 14px' }}>{renderStatusBadge(log.status)}</td>
                                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>{log.records_processed ?? 0}</td>
                                        <td style={{ padding: '12px 14px', color: '#64748b' }}>{formatDate(log.started_at)}</td>
                                        <td style={{ padding: '12px 14px', color: log.error_message ? '#ef4444' : '#64748b', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.error_message || ''}>
                                            {log.error_message || 'Hoàn thành'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

AdminDashboardRoute.propTypes = {
    config: PropTypes.object
};

export default AdminDashboardRoute;
