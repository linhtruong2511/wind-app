/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Row, Col, FormGroup, FormControl, ControlLabel, Button } from 'react-bootstrap';

const WindFarmFilterBar = ({ filters, onFilterChange, onResetFilters }) => {
    return (
        <div className="panel panel-default" style={{ padding: '12px 14px', marginBottom: '12px' }}>
            <Row>
                <Col xs={12} sm={4}>
                    <FormGroup controlId="searchPoint" style={{ marginBottom: '6px' }}>
                        <ControlLabel style={{ fontSize: '11px', fontWeight: 600 }}>
                            <i className="fa fa-search" /> Tìm kiếm vị trí
                        </ControlLabel>
                        <FormControl
                            type="text"
                            name="search"
                            placeholder="Nhập mã điểm (VD: 12)..."
                            value={filters.search || ''}
                            onChange={(e) => onFilterChange('search', e.target.value)}
                            style={{ height: '30px', fontSize: '12px' }}
                        />
                    </FormGroup>
                </Col>

                <Col xs={6} sm={4}>
                    <FormGroup controlId="filterPower" style={{ marginBottom: '6px' }}>
                        <ControlLabel style={{ fontSize: '11px', fontWeight: 600 }}>
                            <i className="fa fa-bolt" /> Công suất dự báo
                        </ControlLabel>
                        <FormControl
                            componentClass="select"
                            value={filters.minPower || ''}
                            onChange={(e) => onFilterChange('minPower', e.target.value)}
                            style={{ height: '30px', fontSize: '12px' }}
                        >
                            <option value="">Tất cả công suất</option>
                            <option value="25">≥ 25 MW</option>
                            <option value="35">≥ 35 MW</option>
                            <option value="45">≥ 45 MW</option>
                            <option value="50">≥ 50 MW (Rất cao)</option>
                        </FormControl>
                    </FormGroup>
                </Col>

                <Col xs={6} sm={4}>
                    <FormGroup controlId="filterFoundation" style={{ marginBottom: '6px' }}>
                        <ControlLabel style={{ fontSize: '11px', fontWeight: 600 }}>
                            <i className="fa fa-anchor" /> Loại móng / Độ sâu
                        </ControlLabel>
                        <FormControl
                            componentClass="select"
                            value={filters.foundationType || ''}
                            onChange={(e) => onFilterChange('foundationType', e.target.value)}
                            style={{ height: '30px', fontSize: '12px' }}
                        >
                            <option value="">Tất cả độ sâu</option>
                            <option value="fixed">Móng cố định (≤ 50m)</option>
                            <option value="floating">{"Móng nổi (> 50m)"}</option>
                        </FormControl>
                    </FormGroup>
                </Col>
            </Row>

            <Row style={{ marginTop: '4px' }}>
                <Col xs={8} sm={8}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Vùng biển:</span>
                        {['', 'Bắc Vịnh Bắc Bộ', 'Trung Vịnh Bắc Bộ', 'Nam Vịnh Bắc Bộ'].map((zoneName) => {
                            const isSelected = (filters.zone || '') === zoneName;
                            const label = zoneName === '' ? 'Tất cả vùng' : zoneName.replace(' Vịnh Bắc Bộ', '');
                            return (
                                <button
                                    key={zoneName}
                                    type="button"
                                    onClick={() => onFilterChange('zone', zoneName)}
                                    style={{
                                        border: 'none',
                                        background: isSelected ? '#2563eb' : '#f1f5f9',
                                        color: isSelected ? '#ffffff' : '#475569',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        fontWeight: isSelected ? 600 : 400
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </Col>

                <Col xs={4} sm={4} style={{ textAlign: 'right' }}>
                    <Button
                        bsSize="xs"
                        bsStyle="link"
                        onClick={onResetFilters}
                        style={{ color: '#64748b', textDecoration: 'none', fontSize: '11px', padding: '2px 4px' }}
                        title="Xóa bộ lọc về mặc định"
                    >
                        <i className="fa fa-refresh" /> Đặt lại
                    </Button>
                </Col>
            </Row>
        </div>
    );
};

WindFarmFilterBar.propTypes = {
    filters: PropTypes.object.isRequired,
    onFilterChange: PropTypes.func.isRequired,
    onResetFilters: PropTypes.func.isRequired
};

export default WindFarmFilterBar;
