import React from 'react';
import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
    { to: '/admin/dashboard', icon: 'fa-th-large', label: 'Tổng quan' },
    { to: '/admin/cds', icon: 'fa-cloud-download', label: 'Thu thập CDS ERA5' },
    { to: '/admin/rasters', icon: 'fa-cubes', label: 'Dữ liệu Lưới & NetCDF' },
    { to: '/admin/stations', icon: 'fa-map-marker', label: 'Trạm đo & Quan trắc' },
    { to: '/admin/farms', icon: 'fa-bolt', label: 'Trang trại & Tuabin' },
    { to: '/admin/datasets', icon: 'fa-database', label: 'Bộ dữ liệu & Phân quyền' },
];

const AdminSidebar = ({ collapsed, config }) => {
    return (
        <aside className={`wind-admin-sidebar ${collapsed ? 'collapsed' : ''}`}>
            {/* Header */}
            <div style={{
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                padding: '0 20px',
                borderBottom: '1px solid #1e293b',
                gap: '12px'
            }}>
                <i className="fa fa-flag" style={{ fontSize: '22px', color: '#0284c7' }}></i>
                {!collapsed && (
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '15px', color: '#f8fafc', letterSpacing: '-0.3px' }}>
                            WINDHUB
                        </div>
                    </div>
                )}
            </div>

            {/* Menu items */}
            <nav style={{ flex: 1, padding: '16px 10px', overflowY: 'auto' }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {NAV_ITEMS.map((item) => (
                        <li key={item.to}>
                            <NavLink
                                to={item.to}
                                style={({ isActive }) => ({
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    textDecoration: 'none',
                                    fontSize: '14px',
                                    fontWeight: isActive ? 600 : 500,
                                    color: isActive ? '#ffffff' : '#94a3b8',
                                    backgroundColor: isActive ? '#0284c7' : 'transparent',
                                    transition: 'all 0.15s ease',
                                    whiteSpace: 'nowrap'
                                })}
                                title={collapsed ? item.label : undefined}
                            >
                                <i className={`fa ${item.icon}`} style={{ width: '20px', textAlign: 'center', fontSize: '16px' }}></i>
                                {!collapsed && <span>{item.label}</span>}
                            </NavLink>
                        </li>
                    ))}
                </ul>
            </nav>

            {/* Footer */}
            <div style={{ padding: '16px 12px', borderTop: '1px solid #1e293b' }}>
                <NavLink
                    to="/stations"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#1e293b',
                        color: '#cbd5e1',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 500
                    }}
                    title="Về cổng bản đồ công cộng"
                >
                    <i className="fa fa-sign-out" style={{ width: '16px', textAlign: 'center' }}></i>
                    {!collapsed && <span>Quay lại</span>}
                </NavLink>
            </div>
        </aside>
    );
};

AdminSidebar.propTypes = {
    collapsed: PropTypes.bool.isRequired,
    config: PropTypes.object.isRequired
};

export default AdminSidebar;
