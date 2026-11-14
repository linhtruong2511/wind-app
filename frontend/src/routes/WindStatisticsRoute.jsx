/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * Wind Statistics & Advanced Analytics Hub Route
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Grid, Row, Col, Button, Tabs, Tab } from 'react-bootstrap';

import {
    getStations,
    getStatisticsOverview,
    getStatisticsRankings,
    getMultiStationComparison,
    getWindRoseData,
    getStatisticsExportUrl
} from '../api/wind';

import WindStatisticsFilterBar from '../components/statistics/WindStatisticsFilterBar';
import WindOverviewTab from '../components/statistics/WindOverviewTab';
import WindMultiStationTab from '../components/statistics/WindMultiStationTab';
import WindRoseTab from '../components/statistics/WindRoseTab';
import WindReportTab from '../components/statistics/WindReportTab';

const WindStatisticsRoute = ({ history }) => {
    // 1. Quản lý trạng thái bộ lọc dùng chung
    const [periodType, setPeriodType] = useState('yearly');
    const [selectedYear, setSelectedYear] = useState('');
    const [selectedMonth, setSelectedMonth] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedProvince, setSelectedProvince] = useState('');

    const [stations, setStations] = useState([]);
    const [selectedStationIds, setSelectedStationIds] = useState([]);

    // 2. Quản lý Tab hoạt động & tùy chọn tab
    const [activeTab, setActiveTab] = useState('overview');
    const [rankingMetric, setRankingMetric] = useState('wind_speed_max');
    const [compareMetric, setCompareMetric] = useState('wind_speed');
    const [compareInterval, setCompareInterval] = useState('month');
    const [windRoseStationId, setWindRoseStationId] = useState('');

    // 3. Dữ liệu cho từng Tab
    const [overviewData, setOverviewData] = useState(null);
    const [rankingsData, setRankingsData] = useState(null);
    const [compareData, setCompareData] = useState(null);
    const [windRoseData, setWindRoseData] = useState(null);
    const [reportData, setReportData] = useState([]);

    // 4. Trạng thái Loading
    const [loadingOverview, setLoadingOverview] = useState(false);
    const [loadingCompare, setLoadingCompare] = useState(false);
    const [loadingWindRose, setLoadingWindRose] = useState(false);
    const [loadingReport, setLoadingReport] = useState(false);

    // Tính toán query params ngày tháng
    const getDateParams = useCallback(() => {
        const params = {};
        if (periodType === 'yearly' && selectedYear) {
            params.start_date = `${selectedYear}-01-01T00:00:00Z`;
            params.end_date = `${selectedYear}-12-31T23:59:59Z`;
        } else if (periodType === 'monthly' && selectedMonth) {
            params.start_date = `${selectedMonth}-01T00:00:00Z`;
            params.end_date = `${selectedMonth}-28T23:59:59Z`;
        } else if (periodType === 'custom') {
            if (startDate) params.start_date = `${startDate}T00:00:00Z`;
            if (endDate) params.end_date = `${endDate}T23:59:59Z`;
        }
        if (selectedProvince) {
            params.province = selectedProvince;
        }
        return params;
    }, [periodType, selectedYear, selectedMonth, startDate, endDate, selectedProvince]);

    // 1. Tải danh sách trạm quan trắc
    useEffect(() => {
        getStations({ page_size: 200 })
            .then(res => {
                const list = res.results || res || [];
                setStations(list);
                if (list.length > 0 && selectedStationIds.length === 0) {
                    setSelectedStationIds(list.slice(0, 3).map(s => s.id));
                }
            })
            .catch(err => console.error('Error fetching stations for statistics:', err));
    }, []);

    // 2. Tải dữ liệu Tab 1: Tổng quan & Xếp hạng
    const fetchOverviewTab = useCallback(() => {
        setLoadingOverview(true);
        const dateParams = getDateParams();
        Promise.all([
            getStatisticsOverview(dateParams),
            getStatisticsRankings({ ...dateParams, metric: rankingMetric, limit: 10 })
        ])
            .then(([overview, rankings]) => {
                setOverviewData(overview);
                setRankingsData(rankings);
            })
            .catch(err => console.error('Error fetching overview tab data:', err))
            .finally(() => setLoadingOverview(false));
    }, [getDateParams, rankingMetric]);

    // 3. Tải dữ liệu Tab 2: So sánh đa trạm
    const fetchCompareTab = useCallback(() => {
        if (!selectedStationIds || selectedStationIds.length === 0) return;
        setLoadingCompare(true);
        const dateParams = getDateParams();
        getMultiStationComparison({
            ...dateParams,
            station_ids: selectedStationIds.join(','),
            metric: compareMetric,
            interval: compareInterval
        })
            .then(res => setCompareData(res))
            .catch(err => console.error('Error fetching compare tab data:', err))
            .finally(() => setLoadingCompare(false));
    }, [getDateParams, selectedStationIds, compareMetric, compareInterval]);

    // 4. Tải dữ liệu Tab 3: Hoa gió
    const fetchWindRoseTab = useCallback(() => {
        setLoadingWindRose(true);
        const dateParams = getDateParams();
        const params = { ...dateParams };
        if (windRoseStationId) params.station_id = windRoseStationId;

        getWindRoseData(params)
            .then(res => setWindRoseData(res))
            .catch(err => console.error('Error fetching wind rose data:', err))
            .finally(() => setLoadingWindRose(false));
    }, [getDateParams, windRoseStationId]);

    // 5. Tải dữ liệu Tab 4: Báo cáo bảng
    const fetchReportTab = useCallback(() => {
        setLoadingReport(true);
        // Tải danh sách trạm kèm theo tổng hợp nếu có
        getStations({ page_size: 200 })
            .then(res => {
                const list = res.results || res || [];
                setReportData(list);
            })
            .catch(err => console.error('Error fetching report tab data:', err))
            .finally(() => setLoadingReport(false));
    }, []);

    // Lazy Fetch theo activeTab
    useEffect(() => {
        if (activeTab === 'overview') {
            fetchOverviewTab();
        } else if (activeTab === 'comparison') {
            fetchCompareTab();
        } else if (activeTab === 'wind_rose') {
            fetchWindRoseTab();
        } else if (activeTab === 'report') {
            fetchReportTab();
        }
    }, [activeTab, fetchOverviewTab, fetchCompareTab, fetchWindRoseTab, fetchReportTab]);

    const handleRefresh = () => {
        if (activeTab === 'overview') fetchOverviewTab();
        if (activeTab === 'comparison') fetchCompareTab();
        if (activeTab === 'wind_rose') fetchWindRoseTab();
        if (activeTab === 'report') fetchReportTab();
    };

    const exportUrl = getStatisticsExportUrl(getDateParams());

    return (
        <div className="ms-resources-container ms-main-colors _padding-lr-md" style={{ padding: '20px' }}>
            <Grid fluid>
                {/* Header điều hướng & Tiêu đề */}
                <Row style={{ marginBottom: '15px' }}>
                    <Col xs={12} sm={8}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <Button bsStyle="default" onClick={() => history.push('/')}>
                                &larr; Trang chủ
                            </Button>
                            <Button bsStyle="default" onClick={() => history.push('/stations')}>
                                Danh sách trạm &rarr;
                            </Button>
                        </div>
                        <h2 style={{ marginTop: '15px', marginBottom: '5px', color: '#0f172a', fontWeight: 700 }}>
                            Thống kê và phân tích dữ liệu khí tượng gió
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
                            Phân tích chuyên sâu mạng lưới trạm quan trắc, so sánh chuỗi thời gian, biểu đồ hoa gió 16 hướng và bảng xếp hạng cực trị.
                        </p>
                    </Col>
                </Row>

                {/* Thanh Bộ Lọc Chung */}
                <Row>
                    <Col xs={12}>
                        <WindStatisticsFilterBar
                            periodType={periodType}
                            setPeriodType={setPeriodType}
                            selectedYear={selectedYear}
                            setSelectedYear={setSelectedYear}
                            selectedMonth={selectedMonth}
                            setSelectedMonth={setSelectedMonth}
                            startDate={startDate}
                            setStartDate={setStartDate}
                            endDate={endDate}
                            setEndDate={setEndDate}
                            selectedProvince={selectedProvince}
                            setSelectedProvince={setSelectedProvince}
                            stations={stations}
                            selectedStationIds={selectedStationIds}
                            setSelectedStationIds={setSelectedStationIds}
                            onRefresh={handleRefresh}
                        />
                    </Col>
                </Row>

                {/* Khối Tabs 4 Chuyên Đề */}
                <Row>
                    <Col xs={12}>
                        <Tabs
                            activeKey={activeTab}
                            onSelect={(k) => setActiveTab(k)}
                            id="wind-statistics-tabs"
                            style={{ marginBottom: '15px' }}
                        >
                            <Tab eventKey="overview" title={<span><i className="fa fa-dashboard" /> Tổng quan và xếp hạng</span>}>
                                <div style={{ paddingTop: '15px' }}>
                                    <WindOverviewTab
                                        overviewData={overviewData}
                                        rankingsData={rankingsData}
                                        rankingMetric={rankingMetric}
                                        setRankingMetric={setRankingMetric}
                                        loading={loadingOverview}
                                    />
                                </div>
                            </Tab>

                            <Tab eventKey="comparison" title={<span><i className="fa fa-line-chart" /> So sánh nhiều trạm ({selectedStationIds.length})</span>}>
                                <div style={{ paddingTop: '15px' }}>
                                    <WindMultiStationTab
                                        compareData={compareData}
                                        compareMetric={compareMetric}
                                        setCompareMetric={setCompareMetric}
                                        compareInterval={compareInterval}
                                        setCompareInterval={setCompareInterval}
                                        selectedStationIds={selectedStationIds}
                                        loading={loadingCompare}
                                    />
                                </div>
                            </Tab>

                            <Tab eventKey="wind_rose" title={<span><i className="fa fa-compass" /> Hoa gió</span>}>
                                <div style={{ paddingTop: '15px' }}>
                                    <WindRoseTab
                                        windRoseData={windRoseData}
                                        stations={stations}
                                        selectedStationId={windRoseStationId}
                                        setSelectedStationId={setWindRoseStationId}
                                        loading={loadingWindRose}
                                    />
                                </div>
                            </Tab>

                            <Tab eventKey="report" title={<span><i className="fa fa-table" /> Bảng số liệu và báo cáo</span>}>
                                <div style={{ paddingTop: '15px' }}>
                                    <WindReportTab
                                        reportData={reportData}
                                        exportUrl={exportUrl}
                                        loading={loadingReport}
                                    />
                                </div>
                            </Tab>
                        </Tabs>
                    </Col>
                </Row>
            </Grid>
        </div>
    );
};

WindStatisticsRoute.propTypes = {
    history: PropTypes.object.isRequired
};

export default WindStatisticsRoute;
