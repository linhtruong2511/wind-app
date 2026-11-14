import React from 'react';
import PropTypes from 'prop-types';
import { Panel, Row, Col, FormGroup, FormControl, ControlLabel } from 'react-bootstrap';

export const VARIABLES_MAP = {
    wind_speed: { label: 'Tốc độ gió', unit: 'm/s', color: '#1e40af' },
    wind_dir: { label: 'Hướng gió', unit: '°', color: '#059669' },
    temp_2m: { label: 'Nhiệt độ (2m)', unit: '°C', color: '#dc2626' },
    humidity: { label: 'Độ ẩm', unit: '%', color: '#0284c7' },
    pressure: { label: 'Khí áp', unit: 'hPa', color: '#7c3aed' },
    rain_06h: { label: 'Lượng mưa (6h)', unit: 'mm', color: '#d97706' }
};

const currentYear = new Date().getFullYear();
const YEARS_LIST = Array.from({ length: 30 }, (_, i) => (currentYear - i).toString());

const WindStationFilterControls = ({
    viewMode, setViewMode,
    variable, setVariable,
    startTime, setStartTime,
    endTime, setEndTime,
    startMonth, setStartMonth,
    endMonth, setEndMonth,
    startYear, setStartYear,
    endYear, setEndYear
}) => {
    return (
        <Panel header={<h4>Bộ lọc thời gian & Yếu tố phân tích</h4>}>
            <Row  style={{ padding: '8px'}}>
                <Col xs={12} sm={3}>
                    <FormGroup controlId="viewModeSelect">
                        <ControlLabel style={{ fontSize: '12px' }}>Chế độ xem</ControlLabel>
                        <FormControl
                            componentClass="select"
                            value={viewMode}
                            onChange={(e) => setViewMode(e.target.value)}
                            style={{ height: '34px', fontSize: '12px', fontWeight: 600 }}
                        >
                            <option value="yearly">Thống kê theo năm</option>
                            <option value="monthly">Thống kê theo tháng</option>
                            <option value="raw">Dữ liệu quan trắc gốc</option>
                        </FormControl>
                    </FormGroup>
                </Col>

                <Col xs={12} sm={3}>
                    <FormGroup controlId="variableSelect">
                        <ControlLabel style={{ fontSize: '12px' }}>Yếu tố đo đạc</ControlLabel>
                        <FormControl
                            componentClass="select"
                            value={variable}
                            onChange={(e) => setVariable(e.target.value)}
                            style={{ height: '34px', fontSize: '12px' }}
                        >
                            {Object.entries(VARIABLES_MAP).map(([key, val]) => (
                                <option key={key} value={key}>{val.label} ({val.unit})</option>
                            ))}
                        </FormControl>
                    </FormGroup>
                </Col>

                {/* Start Time / Month / Year */}
                <Col xs={12} sm={3}>
                    <FormGroup controlId="startTimeSelect">
                        <ControlLabel style={{ fontSize: '12px' }}>Từ thời gian</ControlLabel>
                        {viewMode === 'raw' && (
                            <FormControl
                                type="datetime-local"
                                value={startTime || ''}
                                onChange={(e) => setStartTime(e.target.value)}
                                style={{ height: '34px', fontSize: '12px' }}
                            />
                        )}
                        {viewMode === 'monthly' && (
                            <FormControl
                                type="month"
                                value={startMonth || ''}
                                onChange={(e) => setStartMonth(e.target.value)}
                                style={{ height: '34px', fontSize: '12px' }}
                            />
                        )}
                        {viewMode === 'yearly' && (
                            <FormControl
                                componentClass="select"
                                value={startYear || ''}
                                onChange={(e) => setStartYear(e.target.value)}
                                style={{ height: '34px', fontSize: '12px' }}
                            >
                                <option value="">-- Chọn năm bắt đầu --</option>
                                {YEARS_LIST.map(y => <option key={y} value={y}>{y}</option>)}
                            </FormControl>
                        )}
                    </FormGroup>
                </Col>

                {/* End Time / Month / Year */}
                <Col xs={12} sm={3}>
                    <FormGroup controlId="endTimeSelect">
                        <ControlLabel style={{ fontSize: '12px' }}>Đến thời gian</ControlLabel>
                        {viewMode === 'raw' && (
                            <FormControl
                                type="datetime-local"
                                value={endTime || ''}
                                onChange={(e) => setEndTime(e.target.value)}
                                style={{ height: '34px', fontSize: '12px' }}
                            />
                        )}
                        {viewMode === 'monthly' && (
                            <FormControl
                                type="month"
                                value={endMonth || ''}
                                onChange={(e) => setEndMonth(e.target.value)}
                                style={{ height: '34px', fontSize: '12px' }}
                            />
                        )}
                        {viewMode === 'yearly' && (
                            <FormControl
                                componentClass="select"
                                value={endYear || ''}
                                onChange={(e) => setEndYear(e.target.value)}
                                style={{ height: '34px', fontSize: '12px' }}
                            >
                                <option value="">-- Chọn năm kết thúc --</option>
                                {YEARS_LIST.map(y => <option key={y} value={y}>{y}</option>)}
                            </FormControl>
                        )}
                    </FormGroup>
                </Col>
            </Row>
        </Panel>
    );
};

WindStationFilterControls.propTypes = {
    viewMode: PropTypes.string.isRequired,
    setViewMode: PropTypes.func.isRequired,
    variable: PropTypes.string.isRequired,
    setVariable: PropTypes.func.isRequired,
    startTime: PropTypes.string,
    setStartTime: PropTypes.func,
    endTime: PropTypes.string,
    setEndTime: PropTypes.func,
    startMonth: PropTypes.string,
    setStartMonth: PropTypes.func,
    endMonth: PropTypes.string,
    setEndMonth: PropTypes.func,
    startYear: PropTypes.string,
    setStartYear: PropTypes.func,
    endYear: PropTypes.string,
    setEndYear: PropTypes.func
};

export default WindStationFilterControls;
