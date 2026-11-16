/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { getStatisticsOverview, getWindFarms, getGridSummary } from '../api/wind';

const formatNumber = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return null;
    }
    return Number(value).toLocaleString('vi-VN');
};

const formatDateShort = (isoString) => {
    if (!isoString) return null;
    const parsed = new Date(isoString);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
};

const KpiCard = ({ label, value, foot, icon, iconBg, iconColor, loading }) => (
    <div className="wind-dash-kpi-card">
        <div className="wind-dash-kpi-top">
            <div>
                <div className="wind-dash-kpi-label">{label}</div>
                <div className="wind-dash-kpi-value">
                    {loading ? <span className="wind-dash-skeleton" /> : (value ?? '—')}
                </div>
            </div>
            <div className="wind-dash-kpi-icon" style={{ backgroundColor: iconBg, color: iconColor }}>
                <i className={`fa ${icon}`} aria-hidden="true" />
            </div>
        </div>
        <div className="wind-dash-kpi-foot">{foot}</div>
    </div>
);

KpiCard.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.node,
    foot: PropTypes.node.isRequired,
    icon: PropTypes.string.isRequired,
    iconBg: PropTypes.string.isRequired,
    iconColor: PropTypes.string.isRequired,
    loading: PropTypes.bool
};

const ModuleCard = ({ item, onNavigate }) => (
    <div
        className={`wind-dash-card${item.featured ? ' wind-dash-card-featured' : ''}`}
        // style={{ '--card-accent': item.accent }}
    >
        <div>
            <div className="wind-dash-card-head">
                <div
                    className="wind-dash-card-icon"
                    style={{ backgroundColor: item.iconBg, color: item.accent }}
                >
                    <i className={`fa ${item.icon}`} aria-hidden="true" />
                </div>
                {item.pill && (
                    <span className="wind-dash-card-pill">
                        <i className="fa fa-circle" style={{ fontSize: '7px', color: item.accent }} aria-hidden="true" />
                        {item.pill}
                    </span>
                )}
            </div>

            <h3 className="wind-dash-card-title">{item.title}</h3>
            <p className="wind-dash-card-desc">{item.description}</p>

            {item.tags && item.tags.length > 0 && (
                <div className="wind-dash-card-meta">
                    {item.tags.map((tag) => (
                        <span key={tag} className="wind-dash-meta-tag">
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>

        <div className="wind-dash-card-footer">
            <button
                type="button"
                className={`wind-dash-action-btn ${item.featured ? 'wind-dash-action-btn--primary' : 'wind-dash-action-btn--soft'}`}
                onClick={() => onNavigate(item.path)}
            >
                <span>{item.buttonLabel}</span>
                <i className="fa fa-arrow-right" aria-hidden="true" />
            </button>
        </div>
    </div>
);

ModuleCard.propTypes = {
    item: PropTypes.shape({
        key: PropTypes.string.isRequired,
        featured: PropTypes.bool,
        accent: PropTypes.string.isRequired,
        iconBg: PropTypes.string.isRequired,
        icon: PropTypes.string.isRequired,
        pill: PropTypes.string,
        title: PropTypes.string.isRequired,
        description: PropTypes.string.isRequired,
        tags: PropTypes.arrayOf(PropTypes.string),
        buttonLabel: PropTypes.string.isRequired,
        path: PropTypes.string.isRequired
    }).isRequired,
    onNavigate: PropTypes.func.isRequired
};

const WindDashboardRoute = ({ history }) => {
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState({
        overview: null,
        turbineCount: null,
        grid: null
    });

    useEffect(() => {
        let isMounted = true;

        Promise.allSettled([
            getStatisticsOverview(),
            getWindFarms({ page: 1, pageSize: 1 }),
            getGridSummary()
        ]).then(([overviewRes, farmsRes, gridRes]) => {
            if (!isMounted) return;

            const overview = overviewRes.status === 'fulfilled' ? overviewRes.value : null;
            const farmsData = farmsRes.status === 'fulfilled' ? farmsRes.value : null;
            const grid = gridRes.status === 'fulfilled' ? gridRes.value : null;

            let turbineCount = null;
            if (farmsData) {
                if (typeof farmsData.count === 'number') {
                    turbineCount = farmsData.count;
                } else if (Array.isArray(farmsData.results)) {
                    turbineCount = farmsData.results.length;
                } else if (Array.isArray(farmsData)) {
                    turbineCount = farmsData.length;
                }
            }

            setSummary({ overview, turbineCount, grid });
            setLoading(false);
        });

        return () => {
            isMounted = false;
        };
    }, []);

    const metrics = useMemo(() => {
        const { overview, turbineCount, grid } = summary;
        const totalStations = overview?.total_stations ?? null;
        const activeStations = overview?.active_stations ?? null;
        const totalObservations = overview?.total_observations ?? null;
        const maxWind = overview?.max_wind_recorded ?? null;
        const minDate = formatDateShort(overview?.date_range?.min_date);
        const maxDate = formatDateShort(overview?.date_range?.max_date);
        const totalGranules = grid?.total_granules ?? null;
        const datasetCount = Array.isArray(grid?.datasets) ? grid.datasets.length : null;
        const gridStart = formatDateShort(grid?.min_granule_time);
        const gridEnd = formatDateShort(grid?.max_granule_time);

        return {
            totalStations,
            activeStations,
            totalObservations,
            maxWind,
            minDate,
            maxDate,
            turbineCount,
            totalGranules,
            datasetCount,
            gridStart,
            gridEnd
        };
    }, [summary]);

    const kpiItems = useMemo(() => {
        const stationCountText = formatNumber(metrics.totalStations);
        const activeCountText = formatNumber(metrics.activeStations);
        const turbineCountText = formatNumber(metrics.turbineCount);
        const granuleCountText = formatNumber(metrics.totalGranules);
        const maxWindSpeed =
            metrics.maxWind && metrics.maxWind.wind_speed !== undefined && metrics.maxWind.wind_speed !== null
                ? `${Number(metrics.maxWind.wind_speed).toFixed(1)} m/s`
                : null;

        return [
            {
                key: 'stations',
                label: 'Trạm quan trắc',
                value: stationCountText,
                foot: activeCountText
                    ? `${activeCountText} trạm đang hoạt động`
                    : 'Mạng lưới trạm khí tượng gió',
                icon: 'fa-map-marker',
                iconBg: '#e0f2fe',
                iconColor: '#0284c7'
            },
            {
                key: 'turbines',
                label: 'Điểm tiềm năng gió',
                value: turbineCountText,
                foot: 'Khảo sát ngoài khơi Vịnh Bắc Bộ',
                icon: 'fa-industry',
                iconBg: '#dcfce7',
                iconColor: '#059669'
            },
            {
                key: 'granules',
                label: 'Mốc dữ liệu lưới',
                value: granuleCountText,
                foot: metrics.datasetCount
                    ? `${metrics.datasetCount} bộ dữ liệu trường gió`
                    : 'Bản đồ nhiệt và luồng gió động',
                icon: 'fa-th',
                iconBg: '#ede9fe',
                iconColor: '#6d28d9'
            },
            {
                key: 'maxWind',
                label: 'Gió cực đại ghi nhận',
                value: maxWindSpeed,
                foot: metrics.maxWind?.station_name
                    ? `Tại trạm ${metrics.maxWind.station_name}`
                    : 'Tổng hợp từ chuỗi quan trắc',
                icon: 'fa-tachometer',
                iconBg: '#fef3c7',
                iconColor: '#d97706'
            }
        ];
    }, [metrics]);

    const featuredModules = useMemo(() => {
        const stationCountText = formatNumber(metrics.totalStations);
        const obsCountText = formatNumber(metrics.totalObservations);
        const granuleCountText = formatNumber(metrics.totalGranules);

        return [
            {
                key: 'stations',
                featured: true,
                accent: '#0284c7',
                iconBg: '#e0f2fe',
                icon: 'fa-map-marker',
                pill: stationCountText ? `${stationCountText} trạm` : 'Thời gian thực',
                title: 'Trạm quan trắc',
                description:
                    'Theo dõi toàn bộ mạng lưới trạm khí tượng gió với chuỗi số liệu đo đạc chi tiết theo thời gian thực và lịch sử.',
                tags: [
                    obsCountText ? `${obsCountText} bản ghi quan trắc` : 'Chuỗi thời gian chi tiết',
                    'Biểu đồ trực quan theo trạm'
                ],
                buttonLabel: 'Đến danh sách trạm',
                path: '/stations'
            },
            {
                key: 'grid',
                featured: true,
                accent: '#6d28d9',
                iconBg: '#ede9fe',
                icon: 'fa-th',
                pill: granuleCountText ? `${granuleCountText} mốc giờ` : 'Trường gió động',
                title: 'Dữ liệu lưới và luồng gió',
                description:
                    'Trực quan hóa trường gió động, bản đồ nhiệt và dòng hạt gió trên biển theo từng mốc thời gian.',
                tags: [
                    metrics.gridStart && metrics.gridEnd
                        ? `${metrics.gridStart} – ${metrics.gridEnd}`
                        : 'Mô phỏng dòng hạt gió',
                    'Phân tích theo điểm tọa độ'
                ],
                buttonLabel: 'Khám phá bản đồ lưới',
                path: '/grid'
            }
        ];
    }, [metrics]);

    const secondaryModules = useMemo(() => {
        const turbineCountText = formatNumber(metrics.turbineCount);

        return [
            {
                key: 'farms',
                featured: false,
                accent: '#059669',
                iconBg: '#dcfce7',
                icon: 'fa-industry',
                pill: turbineCountText ? `${turbineCountText} điểm` : 'Ngoài khơi',
                title: 'Trang trại và tiềm năng gió',
                description:
                    'Khảo sát các điểm tiềm năng điện gió ngoài khơi Vịnh Bắc Bộ, dự báo công suất tính bằng MW và độ sâu đáy biển.',
                tags: ['Nội suy trường tiềm năng', 'Xuất dữ liệu bản đồ'],
                buttonLabel: 'Xem trang trại gió',
                path: '/farms'
            },
            {
                key: 'mapping',
                featured: false,
                accent: '#0d9488',
                iconBg: '#ccfbf1',
                icon: 'fa-globe',
                pill: 'Không gian địa lý',
                title: 'Lập bản đồ',
                description:
                    'Xây dựng bản đồ chuyên đề và trực quan hóa phân bố không gian của mạng lưới trạm quan trắc theo địa giới.',
                tags: ['Lọc theo tỉnh thành', 'Đồng bộ bản đồ và danh sách'],
                buttonLabel: 'Mở bản đồ trạm',
                path: '/stations'
            },
            {
                key: 'statistics',
                featured: false,
                accent: '#d97706',
                iconBg: '#fef3c7',
                icon: 'fa-bar-chart',
                pill: 'Phân tích tổng hợp',
                title: 'Thống kê chuyên sâu',
                description:
                    'Tính phân vị, trung bình, cực đại và cực tiểu theo tháng và theo năm, kèm biểu đồ hoa gió và so sánh đa trạm.',
                tags: ['Hoa gió đa hướng', 'Báo cáo xuất bảng'],
                buttonLabel: 'Xem thống kê',
                path: '/statistics'
            }
        ];
    }, [metrics]);

    const dateCoverageText =
        metrics.minDate && metrics.maxDate
            ? `${metrics.minDate} – ${metrics.maxDate}`
            : 'Đang đồng bộ chuỗi quan trắc';

    return (
        <div className="wind-dash-page">
            {/* Hero Banner */}
            <div className="wind-dash-hero">
                <svg
                    className="wind-dash-hero-bg"
                    viewBox="0 0 1200 320"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    <path
                        d="M0,190 C240,120 420,250 680,170 C900,100 1050,150 1200,90"
                        fill="none"
                        stroke="#7dd3fc"
                        strokeWidth="2.5"
                    />
                    <path
                        d="M0,240 C280,175 490,290 760,210 C960,150 1090,195 1200,145"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                    />
                    <path
                        d="M0,120 C220,70 460,170 720,105 C920,55 1070,95 1200,45"
                        fill="none"
                        stroke="#bae6fd"
                        strokeWidth="1.2"
                    />
                </svg>

                <div className="wind-dash-hero-content">
                    <div className="wind-dash-badge">
                        <i className="fa fa-compass" aria-hidden="true" />
                        <span>Cổng dữ liệu khí tượng và điện gió</span>
                    </div>
                    <h1 className="wind-dash-hero-title">
                        Hệ thống phân tích và quản lý dữ liệu gió
                    </h1>
                    <p className="wind-dash-hero-subtitle">
                        Giám sát chuỗi thời gian, thông số tức thời và phân tích số liệu thống kê khí tượng gió trên toàn mạng lưới trạm.
                    </p>
                </div>

                <div className="wind-dash-hero-aside">
                    <div className="wind-dash-hero-aside-label">Phạm vi chuỗi quan trắc</div>
                    <div className="wind-dash-hero-aside-value">
                        {loading ? 'Đang tải số liệu...' : dateCoverageText}
                    </div>
                    <div className="wind-dash-hero-aside-sub">
                        {metrics.totalObservations !== null
                            ? `${formatNumber(metrics.totalObservations)} bản ghi đã tổng hợp`
                            : 'Dữ liệu trạm và trường gió liên tục'}
                    </div>
                </div>
            </div>

            {/* Live KPI Strip */}
            <div className="wind-dash-kpi-grid" role="region" aria-label="Chỉ số tổng quan">
                {kpiItems.map((kpi) => (
                    <KpiCard
                        key={kpi.key}
                        label={kpi.label}
                        value={kpi.value}
                        foot={kpi.foot}
                        icon={kpi.icon}
                        iconBg={kpi.iconBg}
                        iconColor={kpi.iconColor}
                        loading={loading}
                    />
                ))}
            </div>

            {/* Modules Bento Grid */}
            <div>
                <div className="wind-dash-section-head">
                    <h2 className="wind-dash-section-title">Các phân hệ chức năng</h2>
                    <span className="wind-dash-section-hint">
                        Chọn một phân hệ bên dưới để bắt đầu khai thác dữ liệu
                    </span>
                </div>

                <div className="wind-dash-featured-grid">
                    {featuredModules.map((item) => (
                        <ModuleCard
                            key={item.key}
                            item={item}
                            onNavigate={(path) => history.push(path)}
                        />
                    ))}
                </div>

                <div className="wind-dash-secondary-grid">
                    {secondaryModules.map((item) => (
                        <ModuleCard
                            key={item.key}
                            item={item}
                            onNavigate={(path) => history.push(path)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

WindDashboardRoute.propTypes = {
    history: PropTypes.object.isRequired
};

export default WindDashboardRoute;
