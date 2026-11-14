/*
 * Copyright 2026, GeoNode Project.
 * Wind Grid Collapsible Sidebar Drawer
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { FormGroup, ControlLabel, FormControl } from 'react-bootstrap';

const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('vi-VN');
    } catch {
        return dateStr;
    }
};

const WindGridSidebarDrawer = ({
    datasets = [],
    selectedDatasetId = '',
    onSelectDataset = () => {},
    selectedYear = '',
    selectedMonth = '',
    selectedDay = '',
    selectedHour = '',
    availableYears = [],
    availableMonths = [],
    availableDays = [],
    availableHours = [],
    onYearChange = () => {},
    onMonthChange = () => {},
    onDayChange = () => {},
    onHourChange = () => {},
    variables = [],
    activeVariable = '',
    onSelectVariable = () => {},
    summary = null,
    loadingSummary = false,
    layerSettings = {
        showHeatmap: true,
        heatmapOpacity: 0.6,
        showParticles: true,
        particleSpeed: 0.005,
        showStations: false
    },
    onUpdateLayerSettings = () => {}
}) => {
    const [isOpen, setIsOpen] = useState(true);
    const [activeTab, setActiveTab] = useState('controls'); // 'controls' | 'summary' | 'layers'

    const variableLabel = (code) => {
        const found = variables.find(v => v.variable_code === code);
        return found ? (found.variable_name || code) : code;
    };

    return (
        <div
            style={{
                position: 'absolute',
                top: '20px',
                left: isOpen ? '20px' : '-380px',
                width: '380px',
                maxHeight: 'calc(100vh - 100px)',
                backgroundColor: 'rgba(255, 255, 255, 0.97)',
                backdropFilter: 'blur(8px)',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                border: '1px solid #cbd5e1',
                zIndex: 1001,
                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                flexDirection: 'column',
                pointerEvents: 'auto'
            }}
        >
            {/* Toggle Handle Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'absolute',
                    right: '-36px',
                    top: '16px',
                    width: '36px',
                    height: '42px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderLeft: 'none',
                    borderRadius: '0 8px 8px 0',
                    boxShadow: '4px 2px 10px rgba(0,0,0,0.12)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2563eb',
                    fontSize: '15px'
                }}
                title={isOpen ? 'Thu gọn thanh điều khiển' : 'Mở thanh điều khiển'}
            >
                <i className={`fa fa-chevron-${isOpen ? 'left' : 'right'}`} />
            </button>

            {/* Header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa fa-sliders" style={{ color: '#2563eb' }} />
                    Dữ Liệu Lưới & Khí Tượng
                </h4>
            </div>

            {/* Sub Nav Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('controls')}
                    style={{
                        flex: 1,
                        padding: '9px 4px',
                        border: 'none',
                        borderBottom: activeTab === 'controls' ? '2px solid #2563eb' : 'none',
                        backgroundColor: activeTab === 'controls' ? '#ffffff' : 'transparent',
                        color: activeTab === 'controls' ? '#2563eb' : '#64748b',
                        fontWeight: activeTab === 'controls' ? 700 : 500,
                        fontSize: '12px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-calendar-check-o" style={{ marginRight: '4px' }} />
                    Bộ chọn
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('layers')}
                    style={{
                        flex: 1,
                        padding: '9px 4px',
                        border: 'none',
                        borderBottom: activeTab === 'layers' ? '2px solid #2563eb' : 'none',
                        backgroundColor: activeTab === 'layers' ? '#ffffff' : 'transparent',
                        color: activeTab === 'layers' ? '#2563eb' : '#64748b',
                        fontWeight: activeTab === 'layers' ? 700 : 500,
                        fontSize: '12px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-layers" style={{ marginRight: '4px' }} />
                    Lớp bản đồ
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('summary')}
                    style={{
                        flex: 1,
                        padding: '9px 4px',
                        border: 'none',
                        borderBottom: activeTab === 'summary' ? '2px solid #2563eb' : 'none',
                        backgroundColor: activeTab === 'summary' ? '#ffffff' : 'transparent',
                        color: activeTab === 'summary' ? '#2563eb' : '#64748b',
                        fontWeight: activeTab === 'summary' ? 700 : 500,
                        fontSize: '12px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-bar-chart" style={{ marginRight: '4px' }} />
                    Thống kê
                </button>
            </div>

            {/* Scrollable Body */}
            <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {activeTab === 'controls' && (
                    <>
                        <FormGroup style={{ marginBottom: '10px' }}>
                            <ControlLabel style={{ fontSize: '12px', color: '#475569' }}>Bộ dữ liệu (Dataset):</ControlLabel>
                            <FormControl
                                componentClass="select"
                                value={selectedDatasetId || ''}
                                onChange={(e) => onSelectDataset(e.target.value)}
                            >
                                {datasets.map(d => (
                                    <option key={d.id} value={d.id}>
                                        {d.name} ({d.code})
                                    </option>
                                ))}
                            </FormControl>
                        </FormGroup>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <FormGroup style={{ marginBottom: '10px' }}>
                                <ControlLabel style={{ fontSize: '12px', color: '#475569' }}>Năm:</ControlLabel>
                                <FormControl
                                    componentClass="select"
                                    value={selectedYear}
                                    onChange={(e) => onYearChange(e.target.value)}
                                    disabled={availableYears.length === 0}
                                >
                                    {availableYears.map(yr => (
                                        <option key={yr} value={yr}>{yr}</option>
                                    ))}
                                </FormControl>
                            </FormGroup>

                            <FormGroup style={{ marginBottom: '10px' }}>
                                <ControlLabel style={{ fontSize: '12px', color: '#475569' }}>Tháng:</ControlLabel>
                                <FormControl
                                    componentClass="select"
                                    value={selectedMonth}
                                    onChange={(e) => onMonthChange(e.target.value)}
                                    disabled={availableMonths.length === 0}
                                >
                                    {availableMonths.map(m => (
                                        <option key={m} value={m}>Tháng {m}</option>
                                    ))}
                                </FormControl>
                            </FormGroup>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <FormGroup style={{ marginBottom: '10px' }}>
                                <ControlLabel style={{ fontSize: '12px', color: '#475569' }}>Ngày:</ControlLabel>
                                <FormControl
                                    componentClass="select"
                                    value={selectedDay}
                                    onChange={(e) => onDayChange(e.target.value)}
                                    disabled={availableDays.length === 0}
                                >
                                    {availableDays.map(d => (
                                        <option key={d} value={d}>Ngày {d}</option>
                                    ))}
                                </FormControl>
                            </FormGroup>

                            <FormGroup style={{ marginBottom: '10px' }}>
                                <ControlLabel style={{ fontSize: '12px', color: '#475569' }}>Giờ (UTC):</ControlLabel>
                                <FormControl
                                    componentClass="select"
                                    value={selectedHour}
                                    onChange={(e) => onHourChange(e.target.value)}
                                    disabled={availableHours.length === 0}
                                >
                                    {availableHours.map(hr => (
                                        <option key={hr} value={hr}>{hr}</option>
                                    ))}
                                </FormControl>
                            </FormGroup>
                        </div>

                        <FormGroup style={{ marginBottom: '10px' }}>
                            <ControlLabel style={{ fontSize: '12px', color: '#475569' }}>Lớp dữ liệu hiển thị:</ControlLabel>
                            <FormControl
                                componentClass="select"
                                value={activeVariable}
                                onChange={(e) => onSelectVariable(e.target.value)}
                                disabled={variables.length === 0}
                            >
                                {variables.map(v => (
                                    <option key={v.variable_code} value={v.variable_code}>
                                        {v.variable_name || v.variable_code}{v.unit ? ` (${v.unit})` : ''}
                                    </option>
                                ))}
                            </FormControl>
                        </FormGroup>
                    </>
                )}

                {activeTab === 'layers' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* Heatmap Settings */}
                        <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                                    <i className="fa fa-thermometer-half" style={{ color: '#ef4444', marginRight: '6px' }} />
                                    Bản đồ nhiệt (Heatmap)
                                </strong>
                                <input
                                    type="checkbox"
                                    checked={layerSettings.showHeatmap}
                                    onChange={(e) => onUpdateLayerSettings({ showHeatmap: e.target.checked })}
                                />
                            </div>
                            {layerSettings.showHeatmap && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                                        <span>Độ trong suốt:</span>
                                        <span>{Math.round(layerSettings.heatmapOpacity * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="1.0"
                                        step="0.05"
                                        value={layerSettings.heatmapOpacity}
                                        onChange={(e) => onUpdateLayerSettings({ heatmapOpacity: parseFloat(e.target.value) })}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Particle Settings */}
                        <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                                    <i className="fa fa-flag" style={{ color: '#2563eb', marginRight: '6px' }} />
                                    Luồng hạt gió (Particle Flow)
                                </strong>
                                <input
                                    type="checkbox"
                                    checked={layerSettings.showParticles}
                                    onChange={(e) => onUpdateLayerSettings({ showParticles: e.target.checked })}
                                />
                            </div>
                            {layerSettings.showParticles && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                                        <span>Tốc độ hạt:</span>
                                        <span>{Math.round(layerSettings.particleSpeed * 1000)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.002"
                                        max="0.012"
                                        step="0.001"
                                        value={layerSettings.particleSpeed}
                                        onChange={(e) => onUpdateLayerSettings({ particleSpeed: parseFloat(e.target.value) })}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Station Overlay Settings */}
                        <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                                    <i className="fa fa-map-marker" style={{ color: '#10b981', marginRight: '6px' }} />
                                    Chồng lớp Trạm Quan Trắc
                                </strong>
                                <input
                                    type="checkbox"
                                    checked={layerSettings.showStations}
                                    onChange={(e) => onUpdateLayerSettings({ showStations: e.target.checked })}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'summary' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {loadingSummary ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                                <i className="fa fa-spinner fa-spin" style={{ marginRight: '6px' }} />
                                Đang tải số liệu...
                            </div>
                        ) : summary ? (
                            <>
                                {/* KPI Cards */}
                                <div style={{ padding: '10px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                                    <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 600 }}>TỔNG SỐ TỆP TIN LƯỚI</div>
                                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e3a8a', marginTop: '2px' }}>
                                        {(summary.total_granules || 0).toLocaleString()}
                                    </div>
                                </div>

                                <div style={{ padding: '10px', backgroundColor: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                                    <div style={{ fontSize: '11px', color: '#065f46', fontWeight: 600 }}>KHOẢNG THỜI GIAN</div>
                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#064e3b', marginTop: '2px' }}>
                                        {formatDate(summary.min_granule_time)} - {formatDate(summary.max_granule_time)}
                                    </div>
                                </div>

                                <div style={{ padding: '10px', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
                                    <div style={{ fontSize: '11px', color: '#92400e', fontWeight: 600 }}>BIẾN SỐ KHÍ TƯỢNG</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                                        {(summary.unique_variable_codes || []).map(code => (
                                            <span key={code} style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, border: '1px solid #fde68a' }}>
                                                {variableLabel(code)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={{ color: '#64748b', textAlign: 'center' }}>Không có dữ liệu tóm tắt.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

WindGridSidebarDrawer.propTypes = {
    datasets: PropTypes.array,
    selectedDatasetId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    onSelectDataset: PropTypes.func,
    selectedYear: PropTypes.string,
    selectedMonth: PropTypes.string,
    selectedDay: PropTypes.string,
    selectedHour: PropTypes.string,
    availableYears: PropTypes.array,
    availableMonths: PropTypes.array,
    availableDays: PropTypes.array,
    availableHours: PropTypes.array,
    onYearChange: PropTypes.func,
    onMonthChange: PropTypes.func,
    onDayChange: PropTypes.func,
    onHourChange: PropTypes.func,
    variables: PropTypes.array,
    activeVariable: PropTypes.string,
    onSelectVariable: PropTypes.func,
    summary: PropTypes.object,
    loadingSummary: PropTypes.bool,
    layerSettings: PropTypes.object,
    onUpdateLayerSettings: PropTypes.func
};

export default WindGridSidebarDrawer;
