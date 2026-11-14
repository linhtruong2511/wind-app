import React from 'react';
import PropTypes from 'prop-types';
import { HashRouter, Routes, Route, useNavigate, useParams, useLocation, Navigate } from 'react-router-dom';
import WindDashboardRoute from './routes/WindDashboardRoute';
import WindStationsRoute from './routes/WindStationsRoute';
import WindStationDetailRoute from './routes/WindStationDetailRoute';
import WindGridMapRoute from './routes/WindGridMapRoute';
import WindFarmsRoute from './routes/WindFarmsRoute';
import WindStatisticsRoute from './routes/WindStatisticsRoute';

import AdminRouteGuard from './components/admin/AdminRouteGuard';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboardRoute from './routes/admin/AdminDashboardRoute';
import AdminCdsRoute from './routes/admin/AdminCdsRoute';
import AdminRastersRoute from './routes/admin/AdminRastersRoute';
import AdminStationsRoute from './routes/admin/AdminStationsRoute';
import AdminFarmsRoute from './routes/admin/AdminFarmsRoute';
import AdminDatasetsRoute from './routes/admin/AdminDatasetsRoute';

// Adapter để hỗ trợ history.push như router cũ
const RouteAdapter = ({ Component }) => {
    const navigate = useNavigate();
    const params = useParams();
    const location = useLocation();
    const history = {
        push: (path) => navigate(path),
        replace: (path) => navigate(path, { replace: true }),
        location
    };
    const match = { params };
    return <Component history={history} match={match} location={location} />;
};

RouteAdapter.propTypes = {
    Component: PropTypes.elementType.isRequired
};

const PublicLayout = ({ children }) => (
    <div className="wind-app-container">
        <div className="wind-content-area" style={{ padding: '0 15px 30px 15px' }}>
            {children}
        </div>
    </div>
);

PublicLayout.propTypes = {
    children: PropTypes.node.isRequired
};

const App = ({ config }) => {
    return (
        <HashRouter>
            <Routes>
                {/* Admin Routes */}
                <Route
                    path="/admin"
                    element={
                        <AdminRouteGuard config={config}>
                            <AdminLayout config={config} />
                        </AdminRouteGuard>
                    }
                >
                    <Route index element={<AdminDashboardRoute config={config} />} />
                    <Route path="dashboard" element={<AdminDashboardRoute config={config} />} />
                    <Route path="cds" element={<AdminCdsRoute config={config} />} />
                    <Route path="rasters" element={<AdminRastersRoute config={config} />} />
                    <Route path="stations" element={<AdminStationsRoute config={config} />} />
                    <Route path="farms" element={<AdminFarmsRoute config={config} />} />
                    <Route path="datasets" element={<AdminDatasetsRoute config={config} />} />
                </Route>

                {/* Public Routes */}
                <Route path="/" element={<PublicLayout><RouteAdapter Component={WindDashboardRoute} /></PublicLayout>} />
                <Route path="/dashboard" element={<PublicLayout><RouteAdapter Component={WindDashboardRoute} /></PublicLayout>} />
                <Route path="/stations" element={<PublicLayout><RouteAdapter Component={WindStationsRoute} /></PublicLayout>} />
                <Route path="/stations/:id/detail" element={<PublicLayout><RouteAdapter Component={WindStationDetailRoute} /></PublicLayout>} />
                <Route path="/grid" element={<PublicLayout><RouteAdapter Component={WindGridMapRoute} /></PublicLayout>} />
                <Route path="/farms" element={<PublicLayout><RouteAdapter Component={WindFarmsRoute} /></PublicLayout>} />
                <Route path="/statistics" element={<PublicLayout><RouteAdapter Component={WindStatisticsRoute} /></PublicLayout>} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </HashRouter>
    );
};

App.propTypes = {
    config: PropTypes.object
};

export default App;
