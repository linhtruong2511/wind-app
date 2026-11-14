import React from 'react';
import PropTypes from 'prop-types';
import { Row, Col, FormGroup, FormControl, ControlLabel } from 'react-bootstrap';

const WindStationFilterBar = ({ filters, onFilterChange }) => {
    return (
        <div className="panel panel-default" style={{ padding: '12px', marginBottom: '15px' }}>
            <Row>
                <Col xs={12} sm={5}>
                    <FormGroup controlId="searchStation" style={{ marginBottom: '8px' }}>
                        <ControlLabel style={{ fontSize: '11px', fontWeight: 600 }}>Tìm kiếm trạm</ControlLabel>
                        <FormControl
                            type="text"
                            name="search"
                            placeholder="Nhập tên hoặc mã trạm..."
                            value={filters.search || ''}
                            onChange={(e) => onFilterChange('search', e.target.value)}
                            style={{ height: '32px', fontSize: '12px' }}
                        />
                    </FormGroup>
                </Col>
            </Row>
        </div>
    );
};

WindStationFilterBar.propTypes = {
    filters: PropTypes.object.isRequired,
    onFilterChange: PropTypes.func.isRequired,
    showProvinceFilter: PropTypes.bool,
    onToggleProvinceFilter: PropTypes.func
};

export default WindStationFilterBar;
