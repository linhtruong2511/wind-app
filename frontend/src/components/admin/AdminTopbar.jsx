import React from 'react';
import PropTypes from 'prop-types';
import { useLocation, NavLink } from 'react-router-dom';

const ROUTE_TITLES = {
    '/admin': 'Tổng quan',
    '/admin/dashboard': 'Tổng quan hệ thống',
    '/admin/cds': 'Quản lý thu thập CDS ERA5',
    '/admin/rasters': 'Quản lý Dữ liệu Lưới & Tệp NetCDF',
    '/admin/stations': 'Quản lý Trạm đo & Số liệu quan trắc',
    '/admin/farms': 'Quản lý Trang trại gió & Tuabin',
    '/admin/datasets': 'Bộ dữ liệu & Phân quyền truy cập',
};

const AdminTopbar = ({ collapsed, onToggleSidebar, config }) => {
    const location = useLocation();
    const title = ROUTE_TITLES[location.pathname] || 'Quản trị';

    return (
        <header className="wind-admin-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button
                    onClick={onToggleSidebar}
                    className="btn btn-default"
                    style={{ border: 'none', background: 'transparent', padding: '6px 10px', fontSize: '16px', color: '#475569' }}
                    title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
                    type="button"
                >
                    <i className={`fa ${collapsed ? 'fa-indent' : 'fa-outdent'}`}></i>
                </button>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>WindHUB Admin</span>
                    <span style={{ margin: '0 8px' }}>/</span>
                    <span style={{ color: '#0284c7', fontWeight: 500 }}>{title}</span>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#10b981', background: '#ecfdf5', padding: '4px 10px', borderRadius: '12px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                    <span>wind_be: Online</span>
                </div>
                <NavLink to="/stations" className="btn btn-sm btn-outline-secondary" style={{ fontSize: '12px', borderRadius: '6px' }}>
                    <i className="fa fa-map" style={{ marginRight: '6px' }}></i>Xem bản đồ
                </NavLink>
            </div>
        </header>
    );
};

AdminTopbar.propTypes = {
    collapsed: PropTypes.bool.isRequired,
    onToggleSidebar: PropTypes.func.isRequired,
    config: PropTypes.object
};

export default AdminTopbar;
