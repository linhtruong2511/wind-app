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
import { getWindFarms, getTurbinesExportUrl } from '../api/wind';
import WindFarmFilterBar from '../components/farms/WindFarmFilterBar';
import WindFarmList from '../components/farms/WindFarmList';
import WindFarmMapContainer from '../components/farms/WindFarmMapContainer';

const WindFarmsRoute = ({ history }) => {
    const [points, setPoints] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedPoint, setSelectedPoint] = useState(null);
    const [pageIndex, setPageIndex] = useState(0);
    const pageSize = 50;

    const [filters, setFilters] = useState({
        search: '',
        minPower: '',
        foundationType: '',
        zone: ''
    });

    const loadPoints = useCallback(() => {
        setLoading(true);
        const params = {
            page: pageIndex + 1,
            pageSize
        };
        if (filters.search) params.search = filters.search;
        if (filters.minPower) params.minPower = filters.minPower;
        if (filters.foundationType) params.foundationType = filters.foundationType;
        if (filters.zone) params.zone = filters.zone;

        getWindFarms(params)
            .then(res => {
                const list = res.results || (Array.isArray(res) ? res : []);
                setPoints(list);
                setTotalCount(res.count || list.length);
            })
            .catch(err => {
                console.error('Error fetching wind farm points:', err);
                setPoints([]);
            })
            .finally(() => setLoading(false));
    }, [pageIndex, filters]);

    useEffect(() => {
        loadPoints();
    }, [loadPoints]);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPageIndex(0);
    };

    const handleResetFilters = () => {
        setFilters({
            search: '',
            minPower: '',
            foundationType: '',
            zone: ''
        });
        setPageIndex(0);
    };

    const handleSelectPoint = (item) => {
        setSelectedPoint(item);
    };

    const handleExport = (output) => {
        window.location.href = getTurbinesExportUrl(filters, output);
    };

    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    return (
        <div className="ms-resources-container ms-main-colors _padding-lr-md" style={{ padding: '15px' }}>
            <Grid fluid>
                {/* Header Title & Breadcrumb */}
                <Row style={{ marginBottom: '12px' }}>
                    <Col xs={12} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                                <i className="fa fa-industry" style={{ color: '#0284c7' }} />
                                Khảo sát tiềm năng và trang trại gió ngoài khơi Vịnh Bắc Bộ
                            </h3>
                            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '12px' }}>
                                Dữ liệu mô hình dự báo công suất tại các điểm đặt tuabin trên biển, phân tích độ sâu đáy biển và tiềm năng năng lượng gió.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button bsSize="sm" bsStyle="default" onClick={() => handleExport("csv")} title="Tải danh sách đang lọc dạng CSV">
                                <i className="fa fa-download" /> Xuất CSV
                            </Button>
                            <Button bsSize="sm" bsStyle="default" onClick={() => handleExport("geojson")} title="Tải danh sách đang lọc dạng GeoJSON">
                                <i className="fa fa-download" /> Xuất GeoJSON
                            </Button>
                            <Button
                                bsSize="sm"
                                bsStyle="default"
                                onClick={() => history.push('/dashboard')}
                            >
                                <i className="fa fa-arrow-left" /> Quay lại trang chủ
                            </Button>
                        </div>
                    </Col>
                </Row>

                <Row>
                    {/* Cột trái: Bộ lọc, danh sách điểm & phân trang */}
                    <Col xs={12} md={5} lg={5}>
                        <WindFarmFilterBar
                            filters={filters}
                            onFilterChange={handleFilterChange}
                            onResetFilters={handleResetFilters}
                        />

                        <WindFarmList
                            data={points}
                            loading={loading}
                            selectedPoint={selectedPoint}
                            onSelectPoint={handleSelectPoint}
                        />

                        {/* Thanh phân trang */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginTop: '10px',
                                fontSize: '12px',
                                color: '#475569'
                            }}
                        >
                            <span>
                                Tổng số: <strong>{totalCount}</strong> vị trí
                            </span>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <Button
                                    bsSize="xs"
                                    disabled={pageIndex === 0}
                                    onClick={() => setPageIndex(prev => Math.max(0, prev - 1))}
                                >
                                    &larr; Trước
                                </Button>
                                <span>
                                    Trang {pageIndex + 1} / {totalPages}
                                </span>
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

                    {/* Cột phải: Khung bản đồ trực quan hóa */}
                    <Col xs={12} md={7} lg={7}>
                        <WindFarmMapContainer
                            filters={filters}
                            selectedPoint={selectedPoint}
                            onSelectPoint={handleSelectPoint}
                        />
                    </Col>
                </Row>
            </Grid>
        </div>
    );
};

WindFarmsRoute.propTypes = {
    history: PropTypes.object.isRequired
};

export default WindFarmsRoute;
