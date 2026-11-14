import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
    getAdminStations,
    createStation,
    updateStation,
    deleteStation,
    importObservationsFile,
    getAdminDatasets
} from '../../api/admin';

const AdminStationsRoute = () => {
    const [activeTab, setActiveTab] = useState('stations'); // 'stations' | 'import'
    const [stations, setStations] = useState([]);
    const [datasets, setDatasets] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // Station Modal
    const [showModal, setShowModal] = useState(false);
    const [stationForm, setStationForm] = useState({
        id: null,
        station_code: '',
        name: '',
        station_type: 'SURFACE',
        elevation: '',
        lat: '',
        lon: '',
        dataset: '',
        is_active: true
    });

    // Import Observation state
    const [importFile, setImportFile] = useState(null);
    const [dryRunLoading, setDryRunLoading] = useState(false);
    const [dryRunData, setDryRunData] = useState(null); // { valid: bool, total_rows: int, preview: [] }
    const [importLoading, setImportLoading] = useState(false);

    const loadStations = () => {
        setLoading(true);
        const params = {};
        if (search) params.search = search;
        getAdminStations(params).then(data => {
            setStations(data);
            setLoading(false);
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Lỗi tải trạm đo: ' + (err.response?.data?.detail || err.message) });
            setLoading(false);
        });
    };

    useEffect(() => {
        loadStations();
        getAdminDatasets().then(data => setDatasets(data));
    }, []);

    const handleSaveStation = (e) => {
        e.preventDefault();
        const payload = {
            station_code: stationForm.station_code,
            name: stationForm.name,
            station_type: stationForm.station_type,
            elevation: stationForm.elevation ? parseFloat(stationForm.elevation) : null,
            lat: parseFloat(stationForm.lat),
            lon: parseFloat(stationForm.lon),
            dataset: stationForm.dataset || null,
            is_active: stationForm.is_active
        };

        const promise = stationForm.id
            ? updateStation(stationForm.id, payload)
            : createStation(payload);

        promise.then(() => {
            setFeedback({ type: 'success', message: 'Lưu thông tin trạm thành công!' });
            setShowModal(false);
            loadStations();
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Không thể lưu: ' + JSON.stringify(err.response?.data || err.message) });
        });
    };

    const handleDeleteStation = (id) => {
        if (window.confirm('Bạn có chắc chắn muốn xóa trạm đo này cùng các số liệu liên quan?')) {
            deleteStation(id).then(() => {
                setFeedback({ type: 'success', message: 'Đã xóa trạm đo thành công.' });
                loadStations();
            }).catch(err => {
                setFeedback({ type: 'danger', message: 'Xóa thất bại: ' + (err.response?.data?.detail || err.message) });
            });
        }
    };

    // Dry run check
    const handleDryRun = () => {
        if (!importFile) return;
        setDryRunLoading(true);
        setFeedback(null);
        setDryRunData(null);
        importObservationsFile(importFile, true).then(res => {
            setDryRunData(res);
            setDryRunLoading(false);
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Kiểm tra thất bại: ' + (err.response?.data?.error || err.message) });
            setDryRunLoading(false);
        });
    };

    // Real batch import
    const handleRealImport = () => {
        if (!importFile) return;
        setImportLoading(true);
        importObservationsFile(importFile, false).then(res => {
            setFeedback({ type: 'success', message: res.message || 'Nạp dữ liệu quan trắc thành công!' });
            setImportLoading(false);
            setImportFile(null);
            setDryRunData(null);
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Nạp dữ liệu thất bại: ' + (err.response?.data?.error || err.message) });
            setImportLoading(false);
        });
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        Quản lý Trạm đo & Số liệu Quan trắc
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
                        Khai báo tọa độ các trạm quan trắc bề mặt, tháp đo gió và nạp dữ liệu chuỗi thời gian hàng loạt từ Excel / CSV.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {activeTab === 'stations' && (
                        <button
                            onClick={() => {
                                setStationForm({
                                    id: null,
                                    station_code: '',
                                    name: '',
                                    station_type: 'SURFACE',
                                    elevation: '',
                                    lat: '',
                                    lon: '',
                                    dataset: datasets[0]?.id || '',
                                    is_active: true
                                });
                                setShowModal(true);
                            }}
                            className="btn btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', fontWeight: 600 }}
                        >
                            <i className="fa fa-plus"></i>Thêm trạm quan trắc
                        </button>
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
                    onClick={() => setActiveTab('stations')}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: activeTab === 'stations' ? 600 : 500,
                        color: activeTab === 'stations' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'stations' ? '2px solid #0284c7' : '2px solid transparent',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-map-marker" style={{ marginRight: '8px' }}></i>Danh sách Trạm đo ({stations.length})
                </button>
                <button
                    onClick={() => setActiveTab('import')}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: activeTab === 'import' ? 600 : 500,
                        color: activeTab === 'import' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'import' ? '2px solid #0284c7' : '2px solid transparent',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-upload" style={{ marginRight: '8px' }}></i>Nạp số liệu Excel / CSV
                </button>
            </div>

            {/* TAB 1: Stations */}
            {activeTab === 'stations' && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', width: '320px' }}>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Tìm mã hoặc tên trạm..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && loadStations()}
                                style={{ borderRadius: '6px' }}
                            />
                            <button onClick={loadStations} className="btn btn-default" style={{ borderRadius: '6px' }}>
                                <i className="fa fa-search"></i>
                            </button>
                        </div>
                    </div>

                    <div className="table-responsive">
                        <table className="table table-hover" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px 14px' }}>Mã trạm</th>
                                    <th style={{ padding: '12px 14px' }}>Tên trạm</th>
                                    <th style={{ padding: '12px 14px' }}>Loại trạm</th>
                                    <th style={{ padding: '12px 14px' }}>Độ cao (m)</th>
                                    <th style={{ padding: '12px 14px' }}>Tọa độ (Kinh độ, Vĩ độ)</th>
                                    <th style={{ padding: '12px 14px' }}>Trạng thái</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody style={{ fontSize: '13px' }}>
                                {stations.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                            {loading ? 'Đang tải danh sách trạm...' : 'Không tìm thấy trạm đo nào.'}
                                        </td>
                                    </tr>
                                ) : (
                                    stations.map(s => (
                                        <tr key={s.id}>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0284c7' }}>{s.station_code}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{s.name}</td>
                                            <td style={{ padding: '12px 14px' }}>{s.station_type || 'Bề mặt'}</td>
                                            <td style={{ padding: '12px 14px' }}>{s.elevation ?? '-'}</td>
                                            <td style={{ padding: '12px 14px', fontFamily: 'monospace' }}>
                                                {s.lon ? `${s.lon.toFixed(4)}, ${s.lat.toFixed(4)}` : '-'}
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                {s.is_active ? (
                                                    <span className="label label-success" style={{ backgroundColor: '#10b981' }}>Hoạt động</span>
                                                ) : (
                                                    <span className="label label-default">Tắt</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => {
                                                        setStationForm({
                                                            id: s.id,
                                                            station_code: s.station_code,
                                                            name: s.name,
                                                            station_type: s.station_type || 'SURFACE',
                                                            elevation: s.elevation || '',
                                                            lat: s.lat || '',
                                                            lon: s.lon || '',
                                                            dataset: s.dataset || '',
                                                            is_active: s.is_active
                                                        });
                                                        setShowModal(true);
                                                    }}
                                                    className="btn btn-xs btn-default"
                                                    style={{ marginRight: '6px' }}
                                                    title="Chỉnh sửa"
                                                >
                                                    <i className="fa fa-pencil"></i>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteStation(s.id)}
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

            {/* TAB 2: Observation Batch Importer */}
            {activeTab === 'import' && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginTop: 0, marginBottom: '6px' }}>
                        Nạp Tệp Quan trắc Hàng loạt (Excel .xlsx / CSV .csv)
                    </h3>
                    <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
                        Tệp cần chứa tối thiểu 2 cột bắt buộc: <code>station_code</code> và <code>obs_time</code> (định dạng YYYY-MM-DD HH:MM:SS), cùng các cột thông số như <code>wind_speed</code>, <code>wind_dir</code>, <code>temp_2m</code>, <code>humidity</code>, <code>pressure</code>, <code>rain_24h</code>.
                    </p>

                    <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '24px', textAlign: 'center', backgroundColor: '#f8fafc', marginBottom: '20px' }}>
                        <i className="fa fa-file-excel-o" style={{ fontSize: '40px', color: importFile ? '#10b981' : '#94a3b8', marginBottom: '10px' }}></i>
                        {importFile ? (
                            <div>
                                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>{importFile.name}</div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                    {(importFile.size / 1024).toFixed(1)} KB
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div style={{ fontWeight: 600, color: '#334155', fontSize: '14px' }}>
                                    Chọn tệp CSV hoặc Excel chứa số liệu quan trắc
                                </div>
                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                                    Hệ thống hỗ trợ nạp tối đa 100.000 dòng trên mỗi lượt tải lên
                                </div>
                            </div>
                        )}
                        <input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            style={{ display: 'none' }}
                            id="obs-file-input"
                            onChange={e => {
                                setImportFile(e.target.files[0] || null);
                                setDryRunData(null);
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => document.getElementById('obs-file-input').click()}
                            className="btn btn-default btn-sm"
                            style={{ marginTop: '14px', borderRadius: '6px' }}
                        >
                            {importFile ? 'Chọn tệp khác' : 'Chọn tệp từ máy tính'}
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                        <button
                            onClick={handleDryRun}
                            disabled={!importFile || dryRunLoading || importLoading}
                            className="btn btn-info"
                            style={{ borderRadius: '6px', fontWeight: 600 }}
                        >
                            <i className={`fa fa-check ${dryRunLoading ? 'fa-spin' : ''}`} style={{ marginRight: '6px' }}></i>
                            {dryRunLoading ? 'Đang kiểm tra...' : 'Kiểm tra cấu trúc (Dry-run)'}
                        </button>
                        <button
                            onClick={handleRealImport}
                            disabled={!importFile || importLoading || dryRunLoading}
                            className="btn btn-success"
                            style={{ borderRadius: '6px', fontWeight: 600 }}
                        >
                            <i className={`fa fa-cloud-upload ${importLoading ? 'fa-spin' : ''}`} style={{ marginRight: '6px' }}></i>
                            {importLoading ? 'Đang nạp số liệu...' : 'Nạp dữ liệu vào CSDL'}
                        </button>
                    </div>

                    {/* Preview Table */}
                    {dryRunData && (
                        <div style={{ marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div style={{ fontWeight: 700, color: '#10b981', fontSize: '14px' }}>
                                    <i className="fa fa-check-circle" style={{ marginRight: '6px' }}></i>
                                    Tệp hợp lệ! Tìm thấy tổng cộng {dryRunData.total_rows} dòng dữ liệu.
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>
                                    Xem trước 10 dòng đầu tiên:
                                </div>
                            </div>
                            <div className="table-responsive">
                                <table className="table table-bordered table-condensed" style={{ fontSize: '12px', background: '#f8fafc' }}>
                                    <thead>
                                        <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                                            {dryRunData.preview.length > 0 && Object.keys(dryRunData.preview[0]).map(col => (
                                                <th key={col}>{col}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dryRunData.preview.map((row, idx) => (
                                            <tr key={idx}>
                                                {Object.keys(row).map(col => (
                                                    <td key={col}>{row[col] !== null ? String(row[col]) : '-'}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Modal Station */}
            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '560px', maxWidth: '90%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '18px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            {stationForm.id ? 'Chỉnh sửa trạm quan trắc' : 'Thêm trạm quan trắc mới'}
                        </h3>
                        <form onSubmit={handleSaveStation}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Mã trạm *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={stationForm.station_code}
                                        onChange={e => setStationForm({ ...stationForm, station_code: e.target.value })}
                                        required
                                        placeholder="VD: PHU_QUY"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Tên trạm *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={stationForm.name}
                                        onChange={e => setStationForm({ ...stationForm, name: e.target.value })}
                                        required
                                        placeholder="VD: Trạm Khí tượng Phú Quý"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Loại trạm</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={stationForm.station_type}
                                        onChange={e => setStationForm({ ...stationForm, station_type: e.target.value })}
                                        placeholder="VD: SURFACE / MET_MAST / BUOY"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Độ cao địa hình (m)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="form-control"
                                        value={stationForm.elevation}
                                        onChange={e => setStationForm({ ...stationForm, elevation: e.target.value })}
                                        placeholder="VD: 15.5"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Kinh độ (Longitude) *</label>
                                    <input
                                        type="number"
                                        step="0.000001"
                                        className="form-control"
                                        value={stationForm.lon}
                                        onChange={e => setStationForm({ ...stationForm, lon: e.target.value })}
                                        required
                                        placeholder="VD: 108.932"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Vĩ độ (Latitude) *</label>
                                    <input
                                        type="number"
                                        step="0.000001"
                                        className="form-control"
                                        value={stationForm.lat}
                                        onChange={e => setStationForm({ ...stationForm, lat: e.target.value })}
                                        required
                                        placeholder="VD: 10.518"
                                    />
                                </div>
                            </div>
                            <div className="checkbox" style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>
                                    <input
                                        type="checkbox"
                                        checked={stationForm.is_active}
                                        onChange={e => setStationForm({ ...stationForm, is_active: e.target.checked })}
                                    /> Trạm đang vận hành hoạt động
                                </label>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setShowModal(false)} className="btn btn-default">Hủy</button>
                                <button type="submit" className="btn btn-primary">Lưu trạm</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

AdminStationsRoute.propTypes = {
    config: PropTypes.object
};

export default AdminStationsRoute;
