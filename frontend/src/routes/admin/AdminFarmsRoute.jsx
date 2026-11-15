import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import {
    getAdminFarms,
    createFarm,
    updateFarm,
    deleteFarm,
    getAdminTurbines,
    createTurbine,
    deleteTurbine
} from '../../api/admin';

const FARM_STATUS_LABELS = {
    OPERATING: 'Đang vận hành',
    UNDER_CONSTRUCTION: 'Đang xây dựng',
    PLANNED: 'Quy hoạch',
    DECOMMISSIONED: 'Ngừng hoạt động',
    MAINTENANCE: 'Bảo trì'
};

const FOUNDATION_LABELS = {
    MONOPILE: 'Móng đơn',
    JACKET: 'Móng chân đế',
    FLOATING: 'Móng nổi',
    ONSHORE: 'Móng trụ bê tông trên bờ'
};

// Tệp CSV mẫu để nhập danh sách tuabin
const TURBINE_CSV_HEADER = ['ma_trang_trai', 'ma_tuabin', 'kinh_do', 'vi_do', 'cong_suat_mw', 'do_sau_m', 'trang_thai'];
const TURBINE_CSV_SAMPLE_ROWS = [
    ['BAC_LIEU_1', '1', '105.748', '9.245', '4.0', '15.0', 'OPERATING'],
    ['BAC_LIEU_1', '2', '105.752', '9.248', '4.0', '15.5', 'OPERATING']
];

// Phân tích nội dung CSV, hỗ trợ trường đặt trong dấu nháy kép
const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const content = text.replace(/^﻿/, '');
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (inQuotes) {
            if (ch === '"' && content[i + 1] === '"') {
                field += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && content[i + 1] === '\n') i++;
            row.push(field);
            field = '';
            rows.push(row);
            row = [];
        } else {
            field += ch;
        }
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter(r => r.some(cell => cell.trim() !== ''));
};

const AdminFarmsRoute = () => {
    const [activeTab, setActiveTab] = useState('farms'); // 'farms' | 'turbines'
    const [importLoading, setImportLoading] = useState(false);
    const turbineFileInputRef = useRef(null);
    const [farms, setFarms] = useState([]);
    const [turbines, setTurbines] = useState([]);
    const [selectedFarmFilter, setSelectedFarmFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // Farm Modal
    const [showFarmModal, setShowFarmModal] = useState(false);
    const [farmForm, setFarmForm] = useState({
        id: null,
        code: '',
        name: '',
        developer: '',
        total_capacity_mw: '',
        status: 'OPERATING',
        commissioning_year: new Date().getFullYear(),
        technology_type: 'FIXED_BOTTOM'
    });

    // Turbine Modal
    const [showTurbineModal, setShowTurbineModal] = useState(false);
    const [turbineForm, setTurbineForm] = useState({
        point_id: '',
        name: '',
        farm: '',
        capacity_mw: 4.0,
        foundation_type: 'MONOPILE',
        depth_m: 15.0,
        lat: '',
        lon: '',
        status: 'OPERATING'
    });

    const loadAll = () => {
        setLoading(true);
        Promise.all([
            getAdminFarms(),
            getAdminTurbines(selectedFarmFilter ? { farm: selectedFarmFilter } : {})
        ]).then(([farmData, turbineData]) => {
            setFarms(farmData);
            setTurbines(turbineData);
            setLoading(false);
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Lỗi tải dữ liệu: ' + (err.response?.data?.detail || err.message) });
            setLoading(false);
        });
    };

    useEffect(() => {
        loadAll();
    }, [selectedFarmFilter, activeTab]);

    const handleDeleteTurbine = (id) => {
        if (window.confirm('Bạn có chắc chắn muốn xóa tuabin này?')) {
            deleteTurbine(id).then(() => {
                setFeedback({ type: 'success', message: 'Đã xóa tuabin thành công.' });
                loadAll();
            }).catch(err => {
                setFeedback({ type: 'danger', message: 'Xóa thất bại: ' + (err.response?.data?.detail || err.message) });
            });
        }
    };

    const handleSaveFarm = (e) => {
        e.preventDefault();
        const payload = {
            code: farmForm.code,
            name: farmForm.name,
            developer: farmForm.developer,
            total_capacity_mw: farmForm.total_capacity_mw ? parseFloat(farmForm.total_capacity_mw) : null,
            status: farmForm.status,
            commissioning_year: farmForm.commissioning_year ? parseInt(farmForm.commissioning_year, 10) : null,
            technology_type: farmForm.technology_type
        };

        const promise = farmForm.id
            ? updateFarm(farmForm.id, payload)
            : createFarm(payload);

        promise.then(() => {
            setFeedback({ type: 'success', message: 'Lưu thông tin trang trại gió thành công!' });
            setShowFarmModal(false);
            loadAll();
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Không thể lưu: ' + JSON.stringify(err.response?.data || err.message) });
        });
    };

    const handleDeleteFarm = (id) => {
        if (window.confirm('Bạn có chắc chắn muốn xóa trang trại gió này?')) {
            deleteFarm(id).then(() => {
                setFeedback({ type: 'success', message: 'Đã xóa trang trại gió thành công.' });
                loadAll();
            }).catch(err => {
                setFeedback({ type: 'danger', message: 'Xóa thất bại: ' + (err.response?.data?.detail || err.message) });
            });
        }
    };

    const handleSaveTurbine = (e) => {
        e.preventDefault();
        const lat = parseFloat(turbineForm.lat);
        const lon = parseFloat(turbineForm.lon);
        const payload = {
            point_id: turbineForm.point_id,
            name: turbineForm.name,
            farm: turbineForm.farm,
            capacity_mw: parseFloat(turbineForm.capacity_mw) || null,
            foundation_type: turbineForm.foundation_type,
            depth_m: parseFloat(turbineForm.depth_m) || null,
            geom: `SRID=4326;POINT(${lon} ${lat})`,
            status: turbineForm.status
        };

        createTurbine(payload).then(() => {
            setFeedback({ type: 'success', message: 'Thêm tuabin gió thành công!' });
            setShowTurbineModal(false);
            loadAll();
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Không thể thêm tuabin: ' + JSON.stringify(err.response?.data || err.message) });
        });
    };

    const handleDownloadTurbineTemplate = () => {
        const csvLines = [TURBINE_CSV_HEADER, ...TURBINE_CSV_SAMPLE_ROWS].map(row => row.join(',')).join('\r\n');
        // BOM giúp Excel nhận đúng mã hóa UTF-8
        const blob = new Blob(['﻿' + csvLines + '\r\n'], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'mau_import_tuabin_gio.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleImportTurbineFile = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;

        setImportLoading(true);
        setFeedback(null);
        try {
            const rows = parseCsv(await file.text());
            const header = (rows[0] || []).map(h => h.trim().toLowerCase());
            const missing = TURBINE_CSV_HEADER.slice(0, 4).filter(col => !header.includes(col));
            if (missing.length > 0) {
                setFeedback({ type: 'danger', message: 'Tệp thiếu các cột bắt buộc: ' + missing.join(', ') + '. Vui lòng tải tệp mẫu để đối chiếu.' });
                return;
            }
            const dataRows = rows.slice(1);
            if (dataRows.length === 0) {
                setFeedback({ type: 'danger', message: 'Tệp không có dòng dữ liệu nào.' });
                return;
            }

            const farmByCode = {};
            farms.forEach(f => { farmByCode[String(f.code).trim().toLowerCase()] = f; });
            const col = (cells, name) => {
                const idx = header.indexOf(name);
                return idx >= 0 && cells[idx] !== undefined ? cells[idx].trim() : '';
            };

            let success = 0;
            const errors = [];
            for (let i = 0; i < dataRows.length; i++) {
                const cells = dataRows[i];
                const lineNo = i + 2;
                const farm = farmByCode[col(cells, 'ma_trang_trai').toLowerCase()];
                const lon = parseFloat(col(cells, 'kinh_do'));
                const lat = parseFloat(col(cells, 'vi_do'));
                if (!farm) {
                    errors.push(`Dòng ${lineNo}: không tìm thấy trang trại "${col(cells, 'ma_trang_trai')}"`);
                    continue;
                }
                if (!col(cells, 'ma_tuabin') || Number.isNaN(lon) || Number.isNaN(lat)) {
                    errors.push(`Dòng ${lineNo}: thiếu mã tuabin hoặc tọa độ không hợp lệ`);
                    continue;
                }
                const payload = {
                    point_id: col(cells, 'ma_tuabin'),
                    farm: farm.id,
                    geom: `SRID=4326;POINT(${lon} ${lat})`,
                    status: col(cells, 'trang_thai') || 'OPERATING'
                };
                const capacity = parseFloat(col(cells, 'cong_suat_mw'));
                const depth = parseFloat(col(cells, 'do_sau_m'));
                if (!Number.isNaN(capacity)) payload.capacity_mw = capacity;
                if (!Number.isNaN(depth)) payload.depth_m = depth;

                try {
                    await createTurbine(payload);
                    success++;
                } catch (err) {
                    errors.push(`Dòng ${lineNo}: ${JSON.stringify(err.response?.data || err.message)}`);
                }
            }

            if (errors.length === 0) {
                setFeedback({ type: 'success', message: `Đã nhập thành công ${success} tuabin.` });
            } else {
                const shown = errors.slice(0, 5).join('; ');
                const more = errors.length > 5 ? ` và ${errors.length - 5} lỗi khác` : '';
                setFeedback({ type: 'danger', message: `Nhập thành công ${success}, thất bại ${errors.length} dòng. ${shown}${more}` });
            }
            loadAll();
        } catch (err) {
            setFeedback({ type: 'danger', message: 'Không thể đọc tệp: ' + err.message });
        } finally {
            setImportLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        Quản lý trang trại gió và tuabin
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
                        Khai báo thông số kỹ thuật của trang trại điện gió trên bờ hoặc ngoài khơi, tọa độ tuabin và loại móng.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {activeTab === 'farms' ? (
                        <button
                            onClick={() => {
                                setFarmForm({
                                    id: null,
                                    code: '',
                                    name: '',
                                    developer: '',
                                    total_capacity_mw: '',
                                    status: 'OPERATING',
                                    commissioning_year: new Date().getFullYear(),
                                    technology_type: 'FIXED_BOTTOM'
                                });
                                setShowFarmModal(true);
                            }}
                            className="btn btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', fontWeight: 600 }}
                        >
                            <i className="fa fa-plus"></i>Thêm trang trại gió
                        </button>
                    ) : (
                        <div className="btn-group">
                            <button
                                type="button"
                                onClick={handleDownloadTurbineTemplate}
                                className="btn btn-default"
                                style={{ fontWeight: 600 }}
                            >
                                <i className="fa fa-download" style={{ marginRight: '6px' }}></i>Tải tệp mẫu
                            </button>
                            <button
                                type="button"
                                onClick={() => turbineFileInputRef.current && turbineFileInputRef.current.click()}
                                className="btn btn-default"
                                disabled={importLoading}
                                style={{ fontWeight: 600 }}
                            >
                                <i className={`fa ${importLoading ? 'fa-spinner fa-spin' : 'fa-upload'}`} style={{ marginRight: '6px' }}></i>
                                {importLoading ? 'Đang nhập...' : 'Nhập từ tệp CSV'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setTurbineForm({
                                        point_id: `TB_${Date.now().toString().slice(-4)}`,
                                        name: '',
                                        farm: farms[0]?.id || '',
                                        capacity_mw: 4.0,
                                        foundation_type: 'MONOPILE',
                                        depth_m: 15.0,
                                        lat: '',
                                        lon: '',
                                        status: 'OPERATING'
                                    });
                                    setShowTurbineModal(true);
                                }}
                                className="btn btn-primary"
                                style={{ fontWeight: 600 }}
                            >
                                <i className="fa fa-plus" style={{ marginRight: '6px' }}></i>Thêm tuabin gió
                            </button>
                            <input
                                ref={turbineFileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleImportTurbineFile}
                                style={{ display: 'none' }}
                            />
                        </div>
                    )}
                </div>
            </div>

            {feedback && (
                <div className={`alert alert-${feedback.type === 'danger' ? 'danger' : 'success'}`} style={{ borderRadius: '8px', marginBottom: '16px' }}>
                    <i className={`fa ${feedback.type === 'danger' ? 'fa-exclamation-triangle' : 'fa-check-circle'}`} style={{ marginRight: '8px' }}></i>
                    {feedback.message}
                </div>
            )}

            {/* Nav Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '20px', gap: '8px' }}>
                <button
                    onClick={() => setActiveTab('farms')}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: activeTab === 'farms' ? 600 : 500,
                        color: activeTab === 'farms' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'farms' ? '2px solid #0284c7' : '2px solid transparent',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-bolt" style={{ marginRight: '8px' }}></i>Trang trại gió ({farms.length})
                </button>
                <button
                    onClick={() => setActiveTab('turbines')}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: activeTab === 'turbines' ? 600 : 500,
                        color: activeTab === 'turbines' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'turbines' ? '2px solid #0284c7' : '2px solid transparent',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-crosshairs" style={{ marginRight: '8px' }}></i>Danh sách tuabin ({turbines.length})
                </button>
            </div>

            {/* TAB 1: Farms */}
            {activeTab === 'farms' && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div className="table-responsive">
                        <table className="table table-hover" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px 14px' }}>Mã dự án</th>
                                    <th style={{ padding: '12px 14px' }}>Tên trang trại</th>
                                    <th style={{ padding: '12px 14px' }}>Chủ đầu tư</th>
                                    <th style={{ padding: '12px 14px' }}>Công suất (MW)</th>
                                    <th style={{ padding: '12px 14px' }}>Trạng thái</th>
                                    <th style={{ padding: '12px 14px' }}>Năm vận hành</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody style={{ fontSize: '13px' }}>
                                {farms.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                            {loading ? 'Đang tải dữ liệu...' : 'Chưa có trang trại gió nào.'}
                                        </td>
                                    </tr>
                                ) : (
                                    farms.map(f => (
                                        <tr key={f.id}>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0284c7' }}>{f.code}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>{f.name}</td>
                                            <td style={{ padding: '12px 14px', color: '#64748b' }}>{f.developer || '-'}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 700 }}>{f.total_capacity_mw ? `${f.total_capacity_mw} MW` : '-'}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span className={`label label-${f.status === 'OPERATING' ? 'success' : f.status === 'UNDER_CONSTRUCTION' ? 'warning' : 'default'}`}>
                                                    {FARM_STATUS_LABELS[f.status] || f.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>{f.commissioning_year || '-'}</td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => {
                                                        setFarmForm({
                                                            id: f.id,
                                                            code: f.code,
                                                            name: f.name,
                                                            developer: f.developer || '',
                                                            total_capacity_mw: f.total_capacity_mw || '',
                                                            status: f.status,
                                                            commissioning_year: f.commissioning_year || '',
                                                            technology_type: f.technology_type || 'FIXED_BOTTOM'
                                                        });
                                                        setShowFarmModal(true);
                                                    }}
                                                    className="btn btn-xs btn-default"
                                                    style={{ marginRight: '6px' }}
                                                    title="Chỉnh sửa"
                                                >
                                                    <i className="fa fa-pencil"></i>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteFarm(f.id)}
                                                    className="btn btn-xs btn-danger"
                                                    title="Xóa"
                                                >
                                                    <i className="fa fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 2: Turbines */}
            {activeTab === 'turbines' && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Lọc theo trang trại:</span>
                            <select
                                className="form-control"
                                value={selectedFarmFilter}
                                onChange={e => setSelectedFarmFilter(e.target.value)}
                                style={{ width: '240px', borderRadius: '6px', fontSize: '13px' }}
                            >
                                <option value="">-- Tất cả trang trại --</option>
                                {farms.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="table-responsive">
                        <table className="table table-hover" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px 14px' }}>Mã tuabin</th>
                                    <th style={{ padding: '12px 14px' }}>Tên tuabin</th>
                                    <th style={{ padding: '12px 14px' }}>Trang trại</th>
                                    <th style={{ padding: '12px 14px' }}>Công suất (MW)</th>
                                    <th style={{ padding: '12px 14px' }}>Loại móng</th>
                                    <th style={{ padding: '12px 14px' }}>Độ sâu đáy (m)</th>
                                    <th style={{ padding: '12px 14px' }}>Trạng thái</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody style={{ fontSize: '13px' }}>
                                {turbines.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                            {loading ? 'Đang tải danh sách tuabin...' : 'Chưa có tuabin nào được ghi nhận.'}
                                        </td>
                                    </tr>
                                ) : (
                                    turbines.map(t => (
                                        <tr key={t.id}>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0284c7' }}>{t.point_id}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{t.name || '-'}</td>
                                            <td style={{ padding: '12px 14px' }}>{t.farm_name || `Trang trại #${t.farm}`}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{(t.capacity_mw || t.predicted_power_mw) ? `${t.capacity_mw || t.predicted_power_mw} MW` : '-'}</td>
                                            <td style={{ padding: '12px 14px' }}>{FOUNDATION_LABELS[t.foundation_type] || 'Móng đơn'}</td>
                                            <td style={{ padding: '12px 14px' }}>{t.depth_m ?? '-'}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span className={`label label-${t.status === 'OPERATING' || t.status === 'OPERATIONAL' ? 'success' : t.status === 'MAINTENANCE' ? 'warning' : 'default'}`}>
                                                    {FARM_STATUS_LABELS[t.status] || t.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => handleDeleteTurbine(t.id)}
                                                    className="btn btn-xs btn-danger"
                                                    title="Xóa"
                                                >
                                                    <i className="fa fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal Farm */}
            {showFarmModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '560px', maxWidth: '90%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '18px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            {farmForm.id ? 'Chỉnh sửa trang trại gió' : 'Thêm trang trại gió'}
                        </h3>
                        <form onSubmit={handleSaveFarm}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Mã trang trại *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={farmForm.code}
                                        onChange={e => setFarmForm({ ...farmForm, code: e.target.value })}
                                        required
                                        placeholder="Ví dụ: BAC_LIEU_1"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Tên trang trại *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={farmForm.name}
                                        onChange={e => setFarmForm({ ...farmForm, name: e.target.value })}
                                        required
                                        placeholder="Ví dụ: Điện gió Bạc Liêu giai đoạn 1"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Chủ đầu tư</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={farmForm.developer}
                                        onChange={e => setFarmForm({ ...farmForm, developer: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Tổng công suất (MW)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="form-control"
                                        value={farmForm.total_capacity_mw}
                                        onChange={e => setFarmForm({ ...farmForm, total_capacity_mw: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Trạng thái</label>
                                    <select
                                        className="form-control"
                                        value={farmForm.status}
                                        onChange={e => setFarmForm({ ...farmForm, status: e.target.value })}
                                    >
                                        <option value="OPERATING">Đang vận hành</option>
                                        <option value="UNDER_CONSTRUCTION">Đang xây dựng</option>
                                        <option value="PLANNED">Quy hoạch</option>
                                        <option value="DECOMMISSIONED">Ngừng hoạt động</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Năm vận hành</label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={farmForm.commissioning_year}
                                        onChange={e => setFarmForm({ ...farmForm, commissioning_year: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setShowFarmModal(false)} className="btn btn-default">Hủy</button>
                                <button type="submit" className="btn btn-primary">Lưu trang trại</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Turbine */}
            {showTurbineModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '560px', maxWidth: '90%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '18px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            Thêm tuabin gió
                        </h3>
                        <form onSubmit={handleSaveTurbine}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Mã vị trí *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={turbineForm.point_id}
                                        onChange={e => setTurbineForm({ ...turbineForm, point_id: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Trang trại gió *</label>
                                    <select
                                        className="form-control"
                                        value={turbineForm.farm}
                                        onChange={e => setTurbineForm({ ...turbineForm, farm: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Chọn trang trại --</option>
                                        {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Kinh độ *</label>
                                    <input
                                        type="number"
                                        step="0.000001"
                                        className="form-control"
                                        value={turbineForm.lon}
                                        onChange={e => setTurbineForm({ ...turbineForm, lon: e.target.value })}
                                        required
                                        placeholder="Ví dụ: 105.748"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Vĩ độ *</label>
                                    <input
                                        type="number"
                                        step="0.000001"
                                        className="form-control"
                                        value={turbineForm.lat}
                                        onChange={e => setTurbineForm({ ...turbineForm, lat: e.target.value })}
                                        required
                                        placeholder="Ví dụ: 9.245"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Công suất tuabin (MW)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="form-control"
                                        value={turbineForm.capacity_mw}
                                        onChange={e => setTurbineForm({ ...turbineForm, capacity_mw: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Loại móng</label>
                                    <select
                                        className="form-control"
                                        value={turbineForm.foundation_type}
                                        onChange={e => setTurbineForm({ ...turbineForm, foundation_type: e.target.value })}
                                    >
                                        <option value="MONOPILE">Móng đơn</option>
                                        <option value="JACKET">Móng chân đế</option>
                                        <option value="FLOATING">Móng nổi</option>
                                        <option value="ONSHORE">Móng trụ bê tông trên bờ</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setShowTurbineModal(false)} className="btn btn-default">Hủy</button>
                                <button type="submit" className="btn btn-primary">Lưu tuabin</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

AdminFarmsRoute.propTypes = {
    config: PropTypes.object
};

export default AdminFarmsRoute;
