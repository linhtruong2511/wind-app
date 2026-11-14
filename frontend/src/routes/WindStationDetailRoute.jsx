/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Grid, Row, Col, Button, Alert } from 'react-bootstrap';
import { getStationDetail, getStationObservations, getStationSummary } from '../api/wind';
import WindStationInfoCard from '../components/station_detail/WindStationInfoCard';
import WindStationFilterControls from '../components/station_detail/WindStationFilterControls';
import WindStationPlotlyChart from '../components/station_detail/WindStationPlotlyChart';
import WindStationDataTable from '../components/station_detail/WindStationDataTable';

const WindStationDetailRoute = ({ match, history }) => {
    const id = match?.params?.id || match?.params?.stationId;

    const [station, setStation] = useState(null);
    const [observations, setObservations] = useState([]);
    const [summaryResults, setSummaryResults] = useState([]);
    const [loadingStation, setLoadingStation] = useState(true);
    const [loadingData, setLoadingData] = useState(false);
    const [error, setError] = useState(null);

    const [viewMode, setViewMode] = useState('yearly');
    const [variable, setVariable] = useState('wind_speed');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [startMonth, setStartMonth] = useState('');
    const [endMonth, setEndMonth] = useState('');
    const [startYear, setStartYear] = useState('');
    const [endYear, setEndYear] = useState('');

    // 1. Tải metadata trạm
    useEffect(() => {
        if (!id) return;
        setLoadingStation(true);
        getStationDetail(id)
            .then(res => setStation(res))
            .catch(err => {
                console.error('Error fetching station detail:', err);
                setError('Không thể tải thông tin trạm quan trắc.');
            })
            .finally(() => setLoadingStation(false));
    }, [id]);

    // 2. Tải số liệu theo viewMode
    useEffect(() => {
        if (!id) return;
        setLoadingData(true);

        if (viewMode === 'raw') {
            const params = { station: id, page_size: 500 };
            if (startTime) params.start_time = new Date(startTime).toISOString();
            if (endTime) params.end_time = new Date(endTime).toISOString();

            getStationObservations(params)
                .then(res => {
                    const sorted = [...res].sort((a, b) => new Date(a.obs_time) - new Date(b.obs_time));
                    setObservations(sorted);
                })
                .catch(err => console.error('Error fetching raw obs:', err))
                .finally(() => setLoadingData(false));
        } else {
            const mode = viewMode === 'monthly' ? 'monthly-summary' : 'yearly-summary';
            const params = {};
            if (viewMode === 'monthly') {
                if (startMonth) params.start_date = `${startMonth}-01T00:00:00Z`;
                if (endMonth) params.end_date = `${endMonth}-28T23:59:59Z`;
            } else {
                if (startYear) params.start_date = `${startYear}-01-01T00:00:00Z`;
                if (endYear) params.end_date = `${endYear}-12-31T23:59:59Z`;
            }

            getStationSummary(id, mode, params)
                .then(res => setSummaryResults(res))
                .catch(err => console.error(`Error fetching ${viewMode} summary:`, err))
                .finally(() => setLoadingData(false));
        }
    }, [id, viewMode, startTime, endTime, startMonth, endMonth, startYear, endYear]);

    if (loadingStation) {
        return (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#64748b' }}>
                <i className="fa fa-spinner fa-spin fa-3x" style={{ color: '#3b82f6', marginBottom: '15px' }} />
                <p>Đang tải thông tin chi tiết trạm quan trắc...</p>
            </div>
        );
    }

    if (error || !station) {
        return (
            <Grid fluid style={{ marginTop: '20px' }}>
                <Alert bsStyle="danger">
                    <h4>Đã xảy ra lỗi</h4>
                    <p>{error || 'Không tìm thấy thông tin trạm quan trắc.'}</p>
                    <Button onClick={() => history.push('/stations')}>Quay lại danh sách</Button>
                </Alert>
            </Grid>
        );
    }

    return (
        <div className="ms-resources-container ms-main-colors _padding-lr-md" style={{ padding: '20px' }}>
            <Grid fluid>
                <Row style={{ marginBottom: '15px' }}>
                    <Col xs={12}>
                        <Button onClick={() => history.push('/stations')}>
                            &larr; Quay lại danh sách trạm
                        </Button>
                    </Col>
                </Row>

                <Row>
                    {/* Cột trái: Thông tin trạm */}
                    <Col xs={12} md={4}>
                        <WindStationInfoCard station={station} />
                    </Col>

                    {/* Cột phải: Bộ lọc & Biểu đồ Plotly */}
                    <Col xs={12} md={8}>
                        <WindStationFilterControls
                            viewMode={viewMode}
                            setViewMode={setViewMode}
                            variable={variable}
                            setVariable={setVariable}
                            startTime={startTime}
                            setStartTime={setStartTime}
                            endTime={endTime}
                            setEndTime={setEndTime}
                            startMonth={startMonth}
                            setStartMonth={setStartMonth}
                            endMonth={endMonth}
                            setEndMonth={setEndMonth}
                            startYear={startYear}
                            setStartYear={setStartYear}
                            endYear={endYear}
                            setEndYear={setEndYear}
                        />

                        <WindStationPlotlyChart
                            viewMode={viewMode}
                            variable={variable}
                            observations={observations}
                            summaryResults={summaryResults}
                            loading={loadingData}
                        />
                    </Col>
                </Row>

                {/* Bảng số liệu chi tiết phía dưới */}
                <Row>
                    <Col xs={12}>
                        <WindStationDataTable
                            viewMode={viewMode}
                            variable={variable}
                            observations={observations}
                            summaryResults={summaryResults}
                            loading={loadingData}
                        />
                    </Col>
                </Row>
            </Grid>
        </div>
    );
};

WindStationDetailRoute.propTypes = {
    match: PropTypes.object.isRequired,
    history: PropTypes.object.isRequired
};

export default WindStationDetailRoute;
