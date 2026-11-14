import React from 'react';
import PropTypes from 'prop-types';
import { HashRouter, Routes, Route, NavLink, useNavigate, useParams, useLocation, Navigate } from 'react-router-dom';
import WindDashboardRoute from './routes/WindDashboardRoute';
import WindStationsRoute from './routes/WindStationsRoute';
import WindStationDetailRoute from './routes/WindStationDetailRoute';
import WindGridMapRoute from './routes/WindGridMapRoute';
import WindFarmsRoute from './routes/WindFarmsRoute';
import WindStatisticsRoute from './routes/WindStatisticsRoute';

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

const NavigationBar = () => {
    return (
        <div className="wind-subnav">
            <ul className="nav nav-tabs">
                <li>
                    <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
                        <i className="fa fa-dashboard" style={{ marginRight: '6px' }} /> Tổng quan
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/stations" className={({ isActive }) => (isActive ? 'active' : '')}>
                        <i className="fa fa-map-marker text-success" style={{ marginRight: '6px' }} /> Trạm quan trắc
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/grid" className={({ isActive }) => (isActive ? 'active' : '')}>
                        <i className="fa fa-globe text-primary" style={{ marginRight: '6px' }} /> Bản đồ lưới gió
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/farms" className={({ isActive }) => (isActive ? 'active' : '')}>
                        <i className="fa fa-bolt text-warning" style={{ marginRight: '6px' }} /> Trang trại gió
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/statistics" className={({ isActive }) => (isActive ? 'active' : '')}>
                        <i className="fa fa-bar-chart text-info" style={{ marginRight: '6px' }} /> Thống kê & Phân tích
                    </NavLink>
                </li>
            </ul>
        </div>
    );
};

const App = ({ config }) => {
    return (
        <HashRouter>
            <div className="wind-app-container">
                <NavigationBar />
                <div className="wind-content-area" style={{ padding: '0 15px 30px 15px' }}>
                    <Routes>
                        <Route path="/" element={<RouteAdapter Component={WindDashboardRoute} />} />
                        <Route path="/dashboard" element={<RouteAdapter Component={WindDashboardRoute} />} />
                        <Route path="/stations" element={<RouteAdapter Component={WindStationsRoute} />} />
                        <Route path="/stations/:id/detail" element={<RouteAdapter Component={WindStationDetailRoute} />} />
                        <Route path="/grid" element={<RouteAdapter Component={WindGridMapRoute} />} />
                        <Route path="/farms" element={<RouteAdapter Component={WindFarmsRoute} />} />
                        <Route path="/statistics" element={<RouteAdapter Component={WindStatisticsRoute} />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </div>
            </div>
        </HashRouter>
    );
};

App.propTypes = {
    config: PropTypes.object
};

export default App;
