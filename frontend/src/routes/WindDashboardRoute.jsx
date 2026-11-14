/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Grid, Row, Col, Panel, Button } from 'react-bootstrap';

const WindDashboardRoute = ({ history }) => {
    return (
        <div className="ms-resources-container ms-main-colors _padding-lr-md" style={{ padding: '24px' }}>
            <Grid fluid>
                <Row style={{ marginBottom: '20px' }}>
                    <Col xs={12}>
                        <h2>
                            Hệ Thống Phân Tích & Quản Lý Dữ Liệu Lớn Về Trắc Gió
                        </h2>
                        <p style={{ color: '#64748b' }}>
                            Giám sát chuỗi thời gian, thông số tức thời và phân tích số liệu thống kê khí tượng gió trên toàn mạng lưới trạm.
                        </p>
                    </Col>
                </Row>

                <Row>
                    <Col xs={12} sm={6} md={4} style={{ marginBottom: '20px' }}>
                        <Panel bsStyle="primary" style={{ height: '100%', minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <h4><i className="fa fa-map-marker" /> Trạm Quan Trắc</h4>
                                <p>Theo dõi 170+ trạm khí tượng gió với các chỉ số đo đạc thời gian thực.</p>
                            </div>
                            <div>
                                <Button bsStyle="primary" onClick={() => history.push('/stations')}>
                                    Đến danh sách trạm
                                </Button>
                            </div>
                        </Panel>
                    </Col>
                    <Col xs={12} sm={6} md={4} style={{ marginBottom: '20px' }}>
                        <Panel bsStyle="primary" style={{ height: '100%', minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <h4><i className="fa fa-industry" /> Trang Trại & Tiềm Năng Gió</h4>
                                <p>Khảo sát 1.000 điểm tiềm năng điện gió ngoài khơi Vịnh Bắc Bộ, dự báo công suất MW và độ sâu đáy biển.</p>
                            </div>
                            <div>
                                <Button bsStyle="primary" onClick={() => history.push('/farms')}>
                                    Xem trang trại gió
                                </Button>
                            </div>
                        </Panel>
                    </Col>
                    <Col xs={12} sm={6} md={4} style={{ marginBottom: '20px' }}>
                        <Panel bsStyle="primary" style={{ height: '100%', minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <h4><i className="fa fa-th" /> Dữ Liệu Lưới & Luồng Gió</h4>
                                <p>Trực quan hóa trường gió động, heatmap dải màu và dòng hạt khí quyển trên biển.</p>
                            </div>
                            <div>
                                <Button bsStyle="primary" onClick={() => history.push('/grid')}>
                                    Khám phá bản đồ lưới
                                </Button>
                            </div>
                        </Panel>
                    </Col>
                    <Col xs={12} sm={6} md={4} style={{ marginBottom: '20px' }}>
                        <Panel bsStyle="primary" style={{ height: '100%', minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <h4><i className="fa fa-globe" /> Thành lập bản đồ</h4>
                                <p>Xây dựng bản đồ chuyên đề và trực quan hóa không gian mạng lưới trạm quan trắc.</p>
                            </div>
                            <div>
                                <Button bsStyle="primary" onClick={() => history.push('/stations/new')}>
                                    Tạo bản đồ
                                </Button>
                            </div>
                        </Panel>
                    </Col>
                    <Col xs={12} sm={6} md={4} style={{ marginBottom: '20px' }}>
                        <Panel bsStyle="primary" style={{ height: '100%', minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <h4><i className="fa fa-bar-chart" /> Thống Kê Chuyên Sâu</h4>
                                <p>Tính toán phân vị trung vị, trung bình, cực đại và cực tiểu theo chu kỳ Tháng và Năm.</p>
                            </div>
                            <div>
                                <Button bsStyle="primary" onClick={() => history.push('/statistics')}>
                                    Xem thống kê
                                </Button>
                            </div>
                        </Panel>
                    </Col>
                </Row>
            </Grid>
        </div>
    );
};

WindDashboardRoute.propTypes = {
    history: PropTypes.object.isRequired
};

export default WindDashboardRoute;
