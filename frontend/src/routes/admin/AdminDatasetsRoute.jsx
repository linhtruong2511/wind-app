import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
    getAdminDatasets,
    createDataset,
    updateDataset,
    deleteDataset,
    getAdminDatasetVariables,
    getUserGroups
} from '../../api/admin';

const ACCESS_LABELS = {
    PUBLIC: 'Công khai',
    INTERNAL: 'Cần đăng nhập',
    RESTRICTED: 'Theo nhóm'
};

const ACCESS_OPTIONS = [
    { value: 'PUBLIC', title: 'Công khai', hint: 'Ai cũng xem được, không cần đăng nhập.' },
    { value: 'INTERNAL', title: 'Cần đăng nhập', hint: 'Chỉ người đã đăng nhập mới xem được.' },
    { value: 'RESTRICTED', title: 'Theo nhóm', hint: 'Chỉ các nhóm được chọn bên dưới xem được. Quản trị viên luôn xem được.' }
];

const emptyForm = () => ({
    id: null,
    code: '',
    name: '',
    description: '',
    source_provider: 'ECMWF / Copernicus',
    access_level: 'INTERNAL',
    is_active: true,
    policies: []
});

const AdminDatasetsRoute = () => {
    const [activeTab, setActiveTab] = useState('datasets'); // 'datasets' | 'variables'
    const [datasets, setDatasets] = useState([]);
    const [variables, setVariables] = useState([]);
    const [groups, setGroups] = useState([]);
    const [selectedDatasetFilter, setSelectedDatasetFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // Modal Dataset
    const [showDatasetModal, setShowDatasetModal] = useState(false);
    const [datasetForm, setDatasetForm] = useState(emptyForm());

    const loadAll = () => {
        setLoading(true);
        Promise.allSettled([
            getAdminDatasets(),
            getAdminDatasetVariables(selectedDatasetFilter ? { dataset: selectedDatasetFilter } : {}),
            getUserGroups()
        ]).then(([dsRes, varRes, groupRes]) => {
            if (dsRes.status === 'fulfilled') {
                setDatasets(dsRes.value);
            } else {
                setFeedback({ type: 'danger', message: 'Lỗi tải bộ dữ liệu: ' + (dsRes.reason?.response?.data?.detail || dsRes.reason?.message) });
            }
            if (varRes.status === 'fulfilled') {
                setVariables(varRes.value);
            }
            if (groupRes.status === 'fulfilled') {
                setGroups(groupRes.value);
            }
            setLoading(false);
        });
    };

    useEffect(() => {
        loadAll();
    }, [selectedDatasetFilter]);

    const togglePolicyGroup = (groupId, checked) => {
        setDatasetForm(prev => ({
            ...prev,
            policies: checked
                ? [...prev.policies, { group: groupId, can_download: false }]
                : prev.policies.filter(p => p.group !== groupId)
        }));
    };

    const setPolicyDownload = (groupId, value) => {
        setDatasetForm(prev => ({
            ...prev,
            policies: prev.policies.map(p => (p.group === groupId ? { ...p, can_download: value } : p))
        }));
    };

    const openEditModal = (d) => {
        setDatasetForm({
            id: d.id,
            code: d.code,
            name: d.name,
            description: d.description || '',
            source_provider: d.source_provider || '',
            access_level: d.access_level,
            is_active: d.is_active,
            policies: (d.access_policies || []).map(p => ({ group: p.group, can_download: p.can_download }))
        });
        setShowDatasetModal(true);
    };

    const handleSaveDataset = (e) => {
        e.preventDefault();
        const payload = {
            code: datasetForm.code,
            name: datasetForm.name,
            description: datasetForm.description,
            source_provider: datasetForm.source_provider,
            access_level: datasetForm.access_level,
            is_active: datasetForm.is_active,
            access_policies: datasetForm.access_level === 'RESTRICTED'
                ? datasetForm.policies.map(p => ({ group: p.group, can_view: true, can_download: p.can_download }))
                : [],
            // Mọi bộ dữ liệu tạo ở đây đều là dữ liệu lưới
            ...(datasetForm.id ? {} : { category: 'GRIDDED' })
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
                        Bộ dữ liệu và quyền xem
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
                        Quản lý các bộ dữ liệu gió dạng lưới, danh mục biến và người được xem từng bộ dữ liệu.
                    </p>
                </div>
                <div>
                    {activeTab === 'datasets' && (
                        <button
                            onClick={() => {
                                setDatasetForm(emptyForm());
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
            </div>

            {/* TAB 1: Datasets */}
            {activeTab === 'datasets' && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div className="table-responsive">
                        <table className="table table-hover" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px 14px' }}>Mã bộ dữ liệu</th>
                                    <th style={{ padding: '12px 14px' }}>Tên bộ dữ liệu</th>
                                    <th style={{ padding: '12px 14px' }}>Nguồn cung cấp</th>
                                    <th style={{ padding: '12px 14px' }}>Ai được xem</th>
                                    <th style={{ padding: '12px 14px' }}>Kích hoạt</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody style={{ fontSize: '13px' }}>
                                {datasets.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                            {loading ? 'Đang tải dữ liệu...' : 'Chưa có bộ dữ liệu nào.'}
                                        </td>
                                    </tr>
                                ) : (
                                    datasets.map(d => (
                                        <tr key={d.id}>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0284c7' }}>{d.code}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>{d.name}</td>
                                            <td style={{ padding: '12px 14px', color: '#64748b' }}>{d.source_provider || '-'}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span className={`label label-${d.access_level === 'PUBLIC' ? 'success' : d.access_level === 'INTERNAL' ? 'info' : 'warning'}`}>
                                                    {ACCESS_LABELS[d.access_level] || d.access_level}
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
                                                    onClick={() => openEditModal(d)}
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
                                    <option key={d.id} value={d.id}>{d.name}</option>
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
                                    <th style={{ padding: '12px 14px' }}>Thành phần cấu thành</th>
                                    <th style={{ padding: '12px 14px' }}>Loại biến</th>
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
                                                {v.components && v.components.length > 0 ? v.components.join(', ') : '-'}
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                {v.is_component ? (
                                                    <span className="badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>Thành phần dữ liệu</span>
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
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Mã định danh *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={datasetForm.code}
                                        onChange={e => setDatasetForm({ ...datasetForm, code: e.target.value })}
                                        required
                                        placeholder="Ví dụ: ERA5_HOURLY"
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
                                        placeholder="Ví dụ: Gió ERA5 theo giờ của ECMWF"
                                    />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Ai được xem</label>
                                {ACCESS_OPTIONS.map(opt => (
                                    <label key={opt.value} style={{ display: 'block', fontWeight: 400, margin: '6px 0', cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="dataset-access-level"
                                            checked={datasetForm.access_level === opt.value}
                                            onChange={() => setDatasetForm({ ...datasetForm, access_level: opt.value })}
                                            style={{ marginRight: '8px' }}
                                        />
                                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{opt.title}</span>
                                        <span style={{ color: '#64748b', fontSize: '12px', marginLeft: '8px' }}>{opt.hint}</span>
                                    </label>
                                ))}
                                {datasetForm.access_level === 'RESTRICTED' && (
                                    <div data-testid="dataset-group-list" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', marginTop: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                                        {groups.length === 0 ? (
                                            <div style={{ color: '#94a3b8', fontSize: '13px' }}>Chưa có nhóm người dùng nào để chọn.</div>
                                        ) : (
                                            groups.map(g => {
                                                const policy = datasetForm.policies.find(p => p.group === g.id);
                                                return (
                                                    <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                                                        <label style={{ fontWeight: 500, margin: 0, cursor: 'pointer' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!policy}
                                                                onChange={e => togglePolicyGroup(g.id, e.target.checked)}
                                                                style={{ marginRight: '8px' }}
                                                            />
                                                            {g.name}
                                                        </label>
                                                        {policy && (
                                                            <label style={{ fontWeight: 400, fontSize: '12px', color: '#475569', margin: 0, cursor: 'pointer' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={policy.can_download}
                                                                    onChange={e => setPolicyDownload(g.id, e.target.checked)}
                                                                    style={{ marginRight: '6px' }}
                                                                />
                                                                Cho phép tải về
                                                            </label>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
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
                                    /> Cho phép sử dụng bộ dữ liệu
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
