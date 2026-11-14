import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminTopbar from './AdminTopbar';

const AdminLayout = ({ config }) => {
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        document.body.classList.add('wind-admin-fullscreen-active');
        return () => {
            document.body.classList.remove('wind-admin-fullscreen-active');
        };
    }, []);

    return (
        <div className="wind-admin-layout">
            <AdminSidebar collapsed={collapsed} config={config} />
            <div className="wind-admin-main">
                <AdminTopbar collapsed={collapsed} onToggleSidebar={() => setCollapsed(!collapsed)} config={config} />
                <main className="wind-admin-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

AdminLayout.propTypes = {
    config: PropTypes.object.isRequired
};

export default AdminLayout;
