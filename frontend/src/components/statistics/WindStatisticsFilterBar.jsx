import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Panel, Row, Col, FormGroup, FormControl, ControlLabel, Button, DropdownButton } from 'react-bootstrap';

const currentYear = new Date().getFullYear();
const YEARS_LIST = Array.from({ length: 30 }, (_, i) => (currentYear - i).toString());

const WindStatisticsFilterBar = ({
    periodType, setPeriodType,
    selectedYear, setSelectedYear,
    selectedMonth, setSelectedMonth,
    startDate, setStartDate,
    endDate, setEndDate,
    selectedProvince, setSelectedProvince,
    provinces = [],
    stations = [],
    selectedStationIds = [],
    setSelectedStationIds,
    onRefresh
}) => {
    const [stationSearch, setStationSearch] = useState('');

    const toggleStation = (stationId) => {
        if (selectedStationIds.includes(stationId)) {
            setSelectedStationIds(selectedStationIds.filter(id => id !== stationId));
        } else {
            setSelectedStationIds([...selectedStationIds, stationId]);
        }
    };

    const selectAllStations = () => {
        setSelectedStationIds(stations.map(s => s.id));
    };

    const clearAllStations = () => {
        setSelectedStationIds([]);
    };

    const filteredStations = stations.filter(s => {
        const matchesSearch = !stationSearch ||
            (s.name && s.name.toLowerCase().includes(stationSearch.toLowerCase())) ||
            (s.station_code && s.station_code.includes(stationSearch));
        const matchesProvince = !selectedProvince ||
            (s.province && s.province.toLowerCase().includes(selectedProvince.toLowerCase()));
        return matchesSearch && matchesProvince;
    });

    return (
        <Panel header={<h4 style={{ margin: 0, fontSize: '15px' }}><i className="fa fa-filter" /> Bộ Lọc Phân Tích & Phạm Vi Trạm</h4>} style={{ marginBottom: '15px' }}>
            <Row>
                {/* 1. Chọn Chu kỳ phân tích */}
                <Col xs={12} sm={3} md={2}>
                    <FormGroup controlId="periodTypeSelect">
                        <ControlLabel style={{ fontSize: '12px', fontWeight: 600 }}>Chu kỳ phân tích</ControlLabel>
                        <FormControl
                            componentClass="select"
                            value={periodType}
                            onChange={(e) => setPeriodType(e.target.value)}
                            style={{ height: '34px', fontSize: '12px' }}
                        >
                            <option value="yearly">Theo Năm (Yearly)</option>
                            <option value="monthly">Theo Tháng (Monthly)</option>
                            <option value="custom">Tùy chọn ngày (Date Range)</option>
                        </FormControl>
                    </FormGroup>
                </Col>

                {/* 2. Chọn Năm / Tháng / Khoảng ngày */}
                {periodType === 'yearly' && (
                    <Col xs={12} sm={3} md={2}>
                        <FormGroup controlId="yearSelect">
                            <ControlLabel style={{ fontSize: '12px', fontWeight: 600 }}>Năm quan sát</ControlLabel>
                            <FormControl
                                componentClass="select"
                                value={selectedYear || ''}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                style={{ height: '34px', fontSize: '12px' }}
                            >
                                <option value="">Tất cả các năm</option>
                                {YEARS_LIST.map(y => <option key={y} value={y}>{y}</option>)}
                            </FormControl>
                        </FormGroup>
                    </Col>
                )}

                {periodType === 'monthly' && (
                    <Col xs={12} sm={3} md={2}>
                        <FormGroup controlId="monthSelect">
                            <ControlLabel style={{ fontSize: '12px', fontWeight: 600 }}>Tháng quan sát</ControlLabel>
                            <FormControl
                                type="month"
                                value={selectedMonth || ''}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                style={{ height: '34px', fontSize: '12px' }}
                            />
                        </FormGroup>
                    </Col>
                )}

                {periodType === 'custom' && (
                    <>
                        <Col xs={12} sm={3} md={2}>
                            <FormGroup controlId="startDateInput">
                                <ControlLabel style={{ fontSize: '12px', fontWeight: 600 }}>Từ ngày</ControlLabel>
                                <FormControl
                                    type="date"
                                    value={startDate || ''}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    style={{ height: '34px', fontSize: '12px' }}
                                />
                            </FormGroup>
                        </Col>
                        <Col xs={12} sm={3} md={2}>
                            <FormGroup controlId="endDateInput">
                                <ControlLabel style={{ fontSize: '12px', fontWeight: 600 }}>Đến ngày</ControlLabel>
                                <FormControl
                                    type="date"
                                    value={endDate || ''}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    style={{ height: '34px', fontSize: '12px' }}
                                />
                            </FormGroup>
                        </Col>
                    </>
                )}

                {/* 3. Lọc theo Tỉnh / Thành */}
                <Col xs={12} sm={3} md={3}>
                    <FormGroup controlId="provinceSelect">
                        <ControlLabel style={{ fontSize: '12px', fontWeight: 600 }}>Tỉnh / Khu vực</ControlLabel>
                        <FormControl
                            componentClass="select"
                            value={selectedProvince || ''}
                            onChange={(e) => setSelectedProvince(e.target.value)}
                            style={{ height: '34px', fontSize: '12px' }}
                        >
                            <option value="">Toàn bộ 63 Tỉnh / Thành</option>
                            {provinces.map(p => (
                                <option key={p.code || p.id || p} value={p.name || p}>
                                    {p.name || p}
                                </option>
                            ))}
                        </FormControl>
                    </FormGroup>
                </Col>

                {/* 4. Multi-select Trạm quan trắc */}
                <Col xs={12} sm={6} md={3}>
                    <FormGroup>
                        <ControlLabel style={{ fontSize: '12px', fontWeight: 600 }}>
                            Trạm phân tích ({selectedStationIds.length}/{stations.length})
                        </ControlLabel>
                        <div>
                            <DropdownButton
                                id="station-multi-select-dropdown"
                                title={
                                    selectedStationIds.length === 0
                                        ? 'Tất cả trạm'
                                        : `${selectedStationIds.length} trạm đã chọn`
                                }
                                style={{ width: '100%', textAlign: 'left', height: '34px', fontSize: '12px' }}
                            >
                                <div style={{ padding: '8px 12px', minWidth: '280px', maxHeight: '300px', overflowY: 'auto' }}>
                                    <div style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
                                        <FormControl
                                            type="text"
                                            placeholder="Tìm trạm..."
                                            value={stationSearch}
                                            onChange={(e) => setStationSearch(e.target.value)}
                                            style={{ height: '28px', fontSize: '12px' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px' }}>
                                        <a href="#select-all" onClick={(e) => { e.preventDefault(); selectAllStations(); }}>Chọn tất cả</a>
                                        <a href="#clear" onClick={(e) => { e.preventDefault(); clearAllStations(); }}>Bỏ chọn</a>
                                    </div>
                                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '5px' }}>
                                        {filteredStations.slice(0, 50).map(st => (
                                            <div key={st.id} style={{ fontSize: '12px', padding: '3px 0' }}>
                                                <label style={{ fontWeight: 'normal', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedStationIds.includes(st.id)}
                                                        onChange={() => toggleStation(st.id)}
                                                    />
                                                    <span>{st.name} ({st.station_code})</span>
                                                </label>
                                            </div>
                                        ))}
                                        {filteredStations.length > 50 && (
                                            <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '4px' }}>
                                                Hiển thị 50 / {filteredStations.length} trạm phù hợp
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </DropdownButton>
                        </div>
                    </FormGroup>
                </Col>

                {/* 5. Nút Cập nhật / Tải lại */}
                <Col xs={12} sm={3} md={2}>
                    <FormGroup>
                        <ControlLabel style={{ fontSize: '12px', color: 'transparent', display: 'block' }}>Hành động</ControlLabel>
                        <Button
                            bsStyle="primary"
                            onClick={onRefresh}
                            style={{ height: '34px', fontSize: '12px', width: '100%' }}
                        >
                            <i className="fa fa-refresh" /> Cập nhật số liệu
                        </Button>
                    </FormGroup>
                </Col>
            </Row>
        </Panel>
    );
};

WindStatisticsFilterBar.propTypes = {
    periodType: PropTypes.string.isRequired,
    setPeriodType: PropTypes.func.isRequired,
    selectedYear: PropTypes.string,
    setSelectedYear: PropTypes.func.isRequired,
    selectedMonth: PropTypes.string,
    setSelectedMonth: PropTypes.func.isRequired,
    startDate: PropTypes.string,
    setStartDate: PropTypes.func.isRequired,
    endDate: PropTypes.string,
    setEndDate: PropTypes.func.isRequired,
    selectedProvince: PropTypes.string,
    setSelectedProvince: PropTypes.func.isRequired,
    provinces: PropTypes.array,
    stations: PropTypes.array,
    selectedStationIds: PropTypes.array.isRequired,
    setSelectedStationIds: PropTypes.func.isRequired,
    onRefresh: PropTypes.func
};

export default WindStatisticsFilterBar;
