/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Grid, Row, Col, Button } from 'react-bootstrap';
import { getStations } from '../api/wind';
import WindStationFilterBar from '../components/stations/WindStationFilterBar';
import WindStationList from '../components/stations/WindStationList';
import WindStationMapContainer from '../components/stations/WindStationMapContainer';

const WindStationsRoute = ({ history }) => {
    const [stations, setStations] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedStation, setSelectedStation] = useState(null);
    const [pageIndex, setPageIndex] = useState(0);
    const pageSize = 50;

    const [filters, setFilters] = useState({
        search: '',
        station_type: '',
        province_id: ''
    });
    const [showProvinceFilter, setShowProvinceFilter] = useState(false);

    const loadStations = useCallback(() => {
        setLoading(true);
        const params = {
            page: pageIndex + 1,
            pageSize
        };
        if (filters.search) params.search = filters.search;
        if (filters.station_type) params.station_type = filters.station_type;
        if (filters.province_id) params.province_id = filters.province_id;

        getStations(params)
            .then(res => {
                const list = res.results || (Array.isArray(res) ? res : []);
                setStations(list);
                setTotalCount(res.count || list.length);
            })
            .catch(err => {
                console.error('Error fetching stations:', err);
                setStations([]);
            })
            .finally(() => setLoading(false));
    }, [pageIndex, filters]);

    useEffect(() => {
        loadStations();
    }, [loadStations]);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPageIndex(0);
    };

    const handleSelectStation = (item) => {
        setSelectedStation(item);
    };

    const handleViewDetail = (id) => {
        history.push(`/stations/${id}/detail`);
    };

    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    return (
        <div className="ms-resources-container ms-main-colors _padding-lr-md" style={{ padding: '15px' }}>
            <Grid fluid>
                <Row style={{ marginBottom: '10px' }}>
                    <Col xs={12}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Danh sách trạm quan trắc gió
                        </h3>
                    </Col>
                </Row>

                <Row>
                    {/* Cột trái: Bộ lọc & Danh sách trạm */}
                    <Col xs={12} md={5} lg={5}>
                        <WindStationFilterBar
                            filters={filters}
                            onFilterChange={handleFilterChange}
                            showProvinceFilter={showProvinceFilter}
                            onToggleProvinceFilter={() => setShowProvinceFilter(!showProvinceFilter)}
                        />

                        <WindStationList
                            data={stations}
                            loading={loading}
                            onSelectStation={handleSelectStation}
                            onViewDetail={handleViewDetail}
                        />

                        {/* Phân trang */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
                            <span>Tổng số: <strong>{totalCount}</strong> trạm</span>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <Button
                                    bsSize="xs"
                                    disabled={pageIndex === 0}
                                    onClick={() => setPageIndex(prev => Math.max(0, prev - 1))}
                                >
                                    &larr; Trước
                                </Button>
                                <span>Trang {pageIndex + 1} / {totalPages}</span>
                                <Button
                                    bsSize="xs"
                                    disabled={pageIndex >= totalPages - 1}
                                    onClick={() => setPageIndex(prev => prev + 1)}
                                >
                                    Sau &rarr;
                                </Button>
                            </div>
                        </div>
                    </Col>

                    {/* Cột phải: Khung bản đồ */}
                    <Col xs={12} md={7} lg={7}>
                        <WindStationMapContainer
                            filters={filters}
                            selectedStation={selectedStation}
                            onSelectStation={handleSelectStation}
                            onViewDetail={handleViewDetail}
                        />
                    </Col>
                </Row>
            </Grid>
        </div>
    );
};

WindStationsRoute.propTypes = {
    history: PropTypes.object.isRequired
};

export default WindStationsRoute;
