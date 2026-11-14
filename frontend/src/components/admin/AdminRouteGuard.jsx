import React from 'react';
import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';

const AdminRouteGuard = ({ config, children }) => {
    const isAuthorized = config && (config.isStaff || config.isSuperuser);

    if (!isAuthorized) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                padding: '20px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '64px', color: '#ef4444', marginBottom: '20px' }}>
                    <i className="fa fa-shield"></i>
                </div>
                <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '10px' }}>
                    403 - Truy cập bị từ chối
                </h1>
                <p style={{ color: '#94a3b8', maxWidth: '480px', marginBottom: '25px', lineHeight: 1.6 }}>
                    Bạn cần có đặc quyền Quản trị viên (Staff hoặc Superuser) để truy cập hệ thống quản trị WindHUB.
                </p>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <NavLink to="/stations" className="btn btn-primary" style={{ padding: '10px 20px', borderRadius: '6px' }}>
                        <i className="fa fa-arrow-left" style={{ marginRight: '8px' }}></i>Về trang bản đồ
                    </NavLink>
                    <a href="/account/login/?next=/wind-app/%23/admin" className="btn btn-default" style={{ padding: '10px 20px', borderRadius: '6px' }}>
                        Đăng nhập tài khoản khác
                    </a>
                </div>
            </div>
        );
    }

    return children;
};

AdminRouteGuard.propTypes = {
    config: PropTypes.object.isRequired,
    children: PropTypes.node.isRequired
};

export default AdminRouteGuard;
