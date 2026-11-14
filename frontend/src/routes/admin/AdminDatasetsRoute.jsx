import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
    getAdminDatasets,
    createDataset,
    updateDataset,
    deleteDataset,
    getAdminDatasetVariables,
    getDatasetAccessPolicies
} from '../../api/admin';

const AdminDatasetsRoute = () => {
    const [activeTab, setActiveTab] = useState('datasets'); // 'datasets' | 'variables' | 'policies'
    const [datasets, setDatasets] = useState([]);
    const [variables, setVariables] = useState([]);
    const [policies, setPolicies] = useState([]);
    const [selectedDatasetFilter, setSelectedDatasetFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // Modal Dataset
    const [showDatasetModal, setShowDatasetModal] = useState(false);
    const [datasetForm, setDatasetForm] = useState({
        id: null,
        code: '',
        name: '',
        category: 'GRIDDED',
        description: '',
        source_provider: 'ECMWF / Copernicus CDS',
        access_level: 'INTERNAL',
        is_active: true
    });

    const loadAll = () => {
        setLoading(true);
        Promise.allSettled([
            getAdminDatasets(),
            getAdminDatasetVariables(selectedDatasetFilter ? { dataset: selectedDatasetFilter } : {}),
            getDatasetAccessPolicies()
        ]).then(([dsRes, varRes, polRes]) => {
            if (dsRes.status === 'fulfilled') {
                setDatasets(dsRes.value);
            } else {
                setFeedback({ type: 'danger', message: 'Lỗi tải bộ dữ liệu: ' + (dsRes.reason?.response?.data?.detail || dsRes.reason?.message) });
            }
            if (varRes.status === 'fulfilled') {
                setVariables(varRes.value);
            }
            if (polRes.status === 'fulfilled') {
                setPolicies(polRes.value);
            }
            setLoading(false);
        });
    };

    useEffect(() => {
        loadAll();
    }, [selectedDatasetFilter]);

    const handleSaveDataset = (e) => {
        e.preventDefault();
        const payload = {
            code: datasetForm.code,
            name: datasetForm.name,
            category: datasetForm.category,
            description: datasetForm.description,
            source_provider: datasetForm.source_provider,
            access_level: datasetForm.access_level,
            is_active: datasetForm.is_active
        };

        const promise = datasetForm.id
            ? updateDataset(datasetForm.id, payload)
            : createDataset(payload);

        promise.then(() => {
            setFeedback({ type: 'success', message: 'Lưu bộ dữ liệu thành công!' });
            setShowDatasetModal(false);
            loadAll();
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Không thể lưu: ' + JSON.stringify(err.response?.data || err.message) });
        });
    };

    const handleDeleteDataset = (id) => {
        if (window.confirm('Bạn có chắc chắn muốn xóa bộ dữ liệu này?')) {
            deleteDataset(id).then(() => {
                setFeedback({ type: 'success', message: 'Đã xóa bộ dữ liệu thành công.' });
                loadAll();
            }).catch(err => {
                setFeedback({ type: 'danger', message: 'Xóa thất bại: ' + (err.response?.data?.detail || err.message) });
            });
        }
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        Bộ Dữ liệu & Phân quyền Truy cập
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
                        Quản lý định danh các nguồn dữ liệu tái phân tích / quan trắc, danh mục biến khí quyển và ma trận phân quyền người dùng GeoNode.
                    </p>
                </div>
                <div>
                    {activeTab === 'datasets' && (
                        <button
                            onClick={() => {
                                setDatasetForm({
                                    id: null,
                                    code: '',
                                    name: '',
                                    category: 'GRIDDED',
                                    description: '',
                                    source_provider: 'ECMWF / Copernicus CDS',
                                    access_level: 'INTERNAL',
                                    is_active: true
                                });
                                setShowDatasetModal(true);
                            }}
                            className="btn btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', fontWeight: 600 }}
                        >
                            <i className="fa fa-plus"></i>Tạo bộ dữ liệu mới
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
                    onClick={() => setActiveTab('datasets')}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: activeTab === 'datasets' ? 600 : 500,
                        color: activeTab === 'datasets' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'datasets' ? '2px solid #0284c7' : '2px solid transparent',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-database" style={{ marginRight: '8px' }}></i>Bộ dữ liệu ({datasets.length})
                </button>
                <button
                    onClick={() => setActiveTab('variables')}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: activeTab === 'variables' ? 600 : 500,
                        color: activeTab === 'variables' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'variables' ? '2px solid #0284c7' : '2px solid transparent',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-sliders" style={{ marginRight: '8px' }}></i>Biến dữ liệu ({variables.length})
                </button>
                <button
                    onClick={() => setActiveTab('policies')}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: activeTab === 'policies' ? 600 : 500,
                        color: activeTab === 'policies' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'policies' ? '2px solid #0284c7' : '2px solid transparent',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-shield" style={{ marginRight: '8px' }}></i>Chính sách phân quyền ({policies.length})
                </button>
            </div>

            {/* TAB 1: Datasets */}
            {activeTab === 'datasets' && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div className="table-responsive">
                        <table className="table table-hover" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px 14px' }}>Mã Dataset</th>
                                    <th style={{ padding: '12px 14px' }}>Tên bộ dữ liệu</th>
                                    <th style={{ padding: '12px 14px' }}>Phân loại</th>
                                    <th style={{ padding: '12px 14px' }}>Nguồn cung cấp</th>
                                    <th style={{ padding: '12px 14px' }}>Cấp truy cập</th>
                                    <th style={{ padding: '12px 14px' }}>Kích hoạt</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody style={{ fontSize: '13px' }}>
                                {datasets.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                            {loading ? 'Đang tải dữ liệu...' : 'Chưa có bộ dữ liệu nào.'}
                                        </td>
                                    </tr>
                                ) : (
                                    datasets.map(d => (
                                        <tr key={d.id}>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0284c7' }}>{d.code}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>{d.name}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span className="badge" style={{ backgroundColor: '#6366f1' }}>{d.category}</span>
                                            </td>
                                            <td style={{ padding: '12px 14px', color: '#64748b' }}>{d.source_provider || '-'}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span className={`label label-${d.access_level === 'PUBLIC' ? 'success' : d.access_level === 'INTERNAL' ? 'info' : 'warning'}`}>
                                                    {d.access_level}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                {d.is_active ? (
                                                    <span className="label label-success" style={{ backgroundColor: '#10b981' }}>Hoạt động</span>
                                                ) : (
                                                    <span className="label label-default">Tắt</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => {
                                                        setDatasetForm({
                                                            id: d.id,
                                                            code: d.code,
                                                            name: d.name,
                                                            category: d.category,
                                                            description: d.description || '',
                                                            source_provider: d.source_provider || '',
                                                            access_level: d.access_level,
                                                            is_active: d.is_active
                                                        });
                                                        setShowDatasetModal(true);
                                                    }}
                                                    className="btn btn-xs btn-default"
                                                    style={{ marginRight: '6px' }}
                                                    title="Chỉnh sửa"
                                                >
                                                    <i className="fa fa-pencil"></i>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteDataset(d.id)}
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

            {/* TAB 2: Variables */}
            {activeTab === 'variables' && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Lọc theo bộ dữ liệu:</span>
                            <select
                                className="form-control"
                                value={selectedDatasetFilter}
                                onChange={e => setSelectedDatasetFilter(e.target.value)}
                                style={{ width: '240px', borderRadius: '6px', fontSize: '13px' }}
                            >
                                <option value="">-- Tất cả bộ dữ liệu --</option>
                                {datasets.map(d => (
                                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="table-responsive">
                        <table className="table table-hover" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px 14px' }}>Mã biến</th>
                                    <th style={{ padding: '12px 14px' }}>Tên hiển thị</th>
                                    <th style={{ padding: '12px 14px' }}>Đơn vị đo</th>
                                    <th style={{ padding: '12px 14px' }}>Biến thành phần [u, v]</th>
                                    <th style={{ padding: '12px 14px' }}>Thuộc tính thành phần</th>
                                </tr>
                            </thead>
                            <tbody style={{ fontSize: '13px' }}>
                                {variables.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                            {loading ? 'Đang tải biến dữ liệu...' : 'Không có biến dữ liệu nào.'}
                                        </td>
                                    </tr>
                                ) : (
                                    variables.map(v => (
                                        <tr key={v.id}>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0284c7' }}>{v.variable_code}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{v.variable_name}</td>
                                            <td style={{ padding: '12px 14px' }}>{v.unit || '-'}</td>
                                            <td style={{ padding: '12px 14px', fontFamily: 'monospace' }}>
                                                {v.components && v.components.length > 0 ? JSON.stringify(v.components) : '-'}
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                {v.is_component ? (
                                                    <span className="badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>Thành phần NetCDF</span>
                                                ) : (
                                                    <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>Biến chính</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 3: Access Policies */}
            {activeTab === 'policies' && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div className="table-responsive">
                        <table className="table table-hover" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px 14px' }}>Mã chính sách</th>
                                    <th style={{ padding: '12px 14px' }}>Bộ dữ liệu</th>
                                    <th style={{ padding: '12px 14px' }}>Nhóm người dùng (GeoNode Group)</th>
                                    <th style={{ padding: '12px 14px' }}>Xem</th>
                                    <th style={{ padding: '12px 14px' }}>Truy vấn</th>
                                    <th style={{ padding: '12px 14px' }}>Tải về</th>
                                </tr>
                            </thead>
                            <tbody style={{ fontSize: '13px' }}>
                                {policies.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                            {loading ? 'Đang tải chính sách...' : 'Chưa cấu hình chính sách phân quyền riêng (Mặc định tuân theo cấp độ truy cập của Dataset).'}
                                        </td>
                                    </tr>
                                ) : (
                                    policies.map(p => (
                                        <tr key={p.id}>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>#{p.id}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{p.dataset_name || `Bộ #${p.dataset}`}</td>
                                            <td style={{ padding: '12px 14px' }}>{p.group_name || `Nhóm #${p.group}`}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                {p.can_view ? <span className="label label-success" style={{ backgroundColor: '#10b981' }}>Có</span> : <span className="label label-default">Không</span>}
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                {p.can_query ? <span className="label label-success" style={{ backgroundColor: '#10b981' }}>Có</span> : <span className="label label-default">Không</span>}
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                {p.can_download ? <span className="label label-success" style={{ backgroundColor: '#10b981' }}>Có</span> : <span className="label label-default">Không</span>}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal Dataset */}
            {showDatasetModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '560px', maxWidth: '90%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '18px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            {datasetForm.id ? 'Chỉnh sửa bộ dữ liệu' : 'Tạo mới bộ dữ liệu'}
                        </h3>
                        <form onSubmit={handleSaveDataset}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Mã định danh (Code) *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={datasetForm.code}
                                        onChange={e => setDatasetForm({ ...datasetForm, code: e.target.value })}
                                        required
                                        placeholder="VD: ERA5_HOURLY"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Tên hiển thị *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={datasetForm.name}
                                        onChange={e => setDatasetForm({ ...datasetForm, name: e.target.value })}
                                        required
                                        placeholder="VD: ECMWF ERA5 Hourly Wind"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Phân loại</label>
                                    <select
                                        className="form-control"
                                        value={datasetForm.category}
                                        onChange={e => setDatasetForm({ ...datasetForm, category: e.target.value })}
                                    >
                                        <option value="GRIDDED">Lưới tọa độ (NetCDF/GRIB)</option>
                                        <option value="STATION">Trạm quan trắc (Obs)</option>
                                        <option value="SATELLITE">Vệ tinh viễn thám</option>
                                        <option value="EVENT">Hiện tượng cực đoan (Bão)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Cấp độ truy cập</label>
                                    <select
                                        className="form-control"
                                        value={datasetForm.access_level}
                                        onChange={e => setDatasetForm({ ...datasetForm, access_level: e.target.value })}
                                    >
                                        <option value="PUBLIC">Công khai (Tất cả)</option>
                                        <option value="INTERNAL">Nội bộ (Đăng nhập)</option>
                                        <option value="RESTRICTED">Giới hạn (Theo nhóm)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Nguồn cung cấp</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={datasetForm.source_provider}
                                    onChange={e => setDatasetForm({ ...datasetForm, source_provider: e.target.value })}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Mô tả bộ dữ liệu</label>
                                <textarea
                                    className="form-control"
                                    rows="3"
                                    value={datasetForm.description}
                                    onChange={e => setDatasetForm({ ...datasetForm, description: e.target.value })}
                                />
                            </div>
                            <div className="checkbox" style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>
                                    <input
                                        type="checkbox"
                                        checked={datasetForm.is_active}
                                        onChange={e => setDatasetForm({ ...datasetForm, is_active: e.target.checked })}
                                    /> Kích hoạt sử dụng bộ dữ liệu
                                </label>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setShowDatasetModal(false)} className="btn btn-default">Hủy</button>
                                <button type="submit" className="btn btn-primary">Lưu bộ dữ liệu</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

AdminDatasetsRoute.propTypes = {
    config: PropTypes.object
};

export default AdminDatasetsRoute;
