import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
    getCDSCredentials,
    createCDSCredential,
    updateCDSCredential,
    deleteCDSCredential,
    testCDSConnection,
    getCDSJobs,
    createCDSJob,
    updateCDSJob,
    deleteCDSJob,
    runCDSJob,
    getCDSJobRuns,
    getAdminDatasets,
} from '../../api/admin';

const AdminCdsRoute = () => {
    const [activeTab, setActiveTab] = useState('credentials'); // 'credentials' | 'jobs' | 'runs'
    const [credentials, setCredentials] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [runs, setRuns] = useState([]);
    const [datasets, setDatasets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState(null); // { type: 'success' | 'danger', message: '' }

    // Modals state
    const [showCredModal, setShowCredModal] = useState(false);
    const [credForm, setCredForm] = useState({ id: null, name: '', url: 'https://cds.climate.copernicus.eu/api', api_key: '', is_active: true });
    
    const [showJobModal, setShowJobModal] = useState(false);
    const [jobForm, setJobForm] = useState({
        id: null,
        name: '',
        credential: '',
        dataset: '',
        dataset_name: 'reanalysis-era5-single-levels',
        mode: 'ONCE',
        lag_days: 5,
        auto_latest: false
    });

    const loadAll = () => {
        setLoading(true);
        Promise.all([
            getCDSCredentials(),
            getCDSJobs(),
            getCDSJobRuns(),
            getAdminDatasets()
        ]).then(([credData, jobData, runData, dsData]) => {
            setCredentials(credData);
            setJobs(jobData);
            setRuns(runData);
            setDatasets(dsData);
            setLoading(false);
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Lỗi tải dữ liệu: ' + (err.response?.data?.detail || err.message) });
            setLoading(false);
        });
    };

    useEffect(() => {
        loadAll();
    }, []);

    // Handlers for Credentials
    const handleSaveCred = (e) => {
        e.preventDefault();
        const payload = {
            name: credForm.name,
            url: credForm.url,
            is_active: credForm.is_active
        };
        if (credForm.api_key) {
            payload.api_key = credForm.api_key;
        }
        const promise = credForm.id
            ? updateCDSCredential(credForm.id, payload)
            : createCDSCredential(payload);

        promise.then(() => {
            setFeedback({ type: 'success', message: 'Lưu tài khoản xác thực CDS thành công!' });
            setShowCredModal(false);
            loadAll();
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Không thể lưu: ' + JSON.stringify(err.response?.data || err.message) });
        });
    };

    const handleDeleteCred = (id) => {
        if (window.confirm('Bạn có chắc chắn muốn xóa thông tin xác thực CDS này?')) {
            deleteCDSCredential(id).then(() => {
                setFeedback({ type: 'success', message: 'Đã xóa tài khoản thành công.' });
                loadAll();
            }).catch(err => {
                setFeedback({ type: 'danger', message: 'Xóa thất bại: ' + (err.response?.data?.detail || err.message) });
            });
        }
    };

    const handleTestCred = (id) => {
        setFeedback({ type: 'info', message: 'Đang kiểm tra kết nối tới dịch vụ Copernicus CDS...' });
        testCDSConnection(id).then(res => {
            setFeedback({ type: 'success', message: `Kết nối thành công! ${res.message || ''}` });
        }).catch(err => {
            setFeedback({ type: 'danger', message: `Kiểm tra thất bại: ${err.response?.data?.message || err.message}` });
        });
    };

    // Handlers for Jobs
    const handleSaveJob = (e) => {
        e.preventDefault();
        const payload = {
            name: jobForm.name,
            credential: jobForm.credential,
            dataset: jobForm.dataset,
            dataset_name: jobForm.dataset_name,
            mode: jobForm.mode,
            lag_days: parseInt(jobForm.lag_days, 10) || 5,
            auto_latest: Boolean(jobForm.auto_latest)
        };

        const promise = jobForm.id
            ? updateCDSJob(jobForm.id, payload)
            : createCDSJob(payload);

        promise.then(() => {
            setFeedback({ type: 'success', message: 'Lưu tác vụ thu thập CDS thành công!' });
            setShowJobModal(false);
            loadAll();
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Không thể lưu: ' + JSON.stringify(err.response?.data || err.message) });
        });
    };

    const handleDeleteJob = (id) => {
        if (window.confirm('Bạn có chắc chắn muốn xóa tác vụ này?')) {
            deleteCDSJob(id).then(() => {
                setFeedback({ type: 'success', message: 'Đã xóa tác vụ thành công.' });
                loadAll();
            }).catch(err => {
                setFeedback({ type: 'danger', message: 'Xóa thất bại: ' + (err.response?.data?.detail || err.message) });
            });
        }
    };

    const handleRunJob = (id) => {
        if (window.confirm('Kích hoạt tải dữ liệu ngay bây giờ bằng Celery worker?')) {
            runCDSJob(id).then(res => {
                setFeedback({ type: 'success', message: `Đã đưa tác vụ vào hàng đợi thành công! (Task ID: ${res.task_id})` });
                loadAll();
            }).catch(err => {
                setFeedback({ type: 'danger', message: 'Không thể kích hoạt: ' + (err.response?.data?.detail || err.message) });
            });
        }
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        Quản lý Thu thập Dữ liệu CDS ERA5
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
                        Cấu hình API Key Copernicus Climate Data Store, tác vụ tự động tải reanalysis và theo dõi tiến trình.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {activeTab === 'credentials' && (
                        <button
                            onClick={() => {
                                setCredForm({ id: null, name: '', url: 'https://cds.climate.copernicus.eu/api', api_key: '', is_active: true });
                                setShowCredModal(true);
                            }}
                            className="btn btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', fontWeight: 600 }}
                        >
                            <i className="fa fa-plus"></i>Thêm tài khoản CDS
                        </button>
                    )}
                    {activeTab === 'jobs' && (
                        <button
                            onClick={() => {
                                setJobForm({
                                    id: null,
                                    name: '',
                                    credential: credentials[0]?.id || '',
                                    dataset: datasets[0]?.id || '',
                                    dataset_name: 'reanalysis-era5-single-levels',
                                    mode: 'ONCE',
                                    lag_days: 5,
                                    auto_latest: false
                                });
                                setShowJobModal(true);
                            }}
                            className="btn btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', fontWeight: 600 }}
                        >
                            <i className="fa fa-plus"></i>Tạo tác vụ tải CDS
                        </button>
                    )}
                    <button
                        onClick={loadAll}
                        disabled={loading}
                        className="btn btn-default"
                        style={{ borderRadius: '6px' }}
                        title="Làm mới"
                    >
                        <i className={`fa fa-refresh ${loading ? 'fa-spin' : ''}`}></i>
                    </button>
                </div>
            </div>

            {/* Feedback alert */}
            {feedback && (
                <div className={`alert alert-${feedback.type === 'danger' ? 'danger' : feedback.type === 'info' ? 'info' : 'success'}`} style={{ borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <i className={`fa ${feedback.type === 'danger' ? 'fa-exclamation-circle' : feedback.type === 'info' ? 'fa-info-circle' : 'fa-check-circle'}`} style={{ marginRight: '8px' }}></i>
                        {feedback.message}
                    </div>
                    <button type="button" className="close" onClick={() => setFeedback(null)} style={{ border: 'none', background: 'transparent', fontSize: '18px' }}>&times;</button>
                </div>
            )}

            {/* Nav Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '20px', gap: '8px' }}>
                <button
                    onClick={() => setActiveTab('credentials')}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: activeTab === 'credentials' ? 600 : 500,
                        color: activeTab === 'credentials' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'credentials' ? '2px solid #0284c7' : '2px solid transparent',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-key" style={{ marginRight: '8px' }}></i>Tài khoản xác thực ({credentials.length})
                </button>
                <button
                    onClick={() => setActiveTab('jobs')}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: activeTab === 'jobs' ? 600 : 500,
                        color: activeTab === 'jobs' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'jobs' ? '2px solid #0284c7' : '2px solid transparent',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-tasks" style={{ marginRight: '8px' }}></i>Tác vụ tải định kỳ ({jobs.length})
                </button>
                <button
                    onClick={() => setActiveTab('runs')}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: activeTab === 'runs' ? 600 : 500,
                        color: activeTab === 'runs' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'runs' ? '2px solid #0284c7' : '2px solid transparent',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-history" style={{ marginRight: '8px' }}></i>Lịch sử tải ({runs.length})
                </button>
            </div>

            {/* TAB 1: Credentials */}
            {activeTab === 'credentials' && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div className="table-responsive">
                        <table className="table table-hover" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px 14px' }}>Mã</th>
                                    <th style={{ padding: '12px 14px' }}>Tên nhận diện</th>
                                    <th style={{ padding: '12px 14px' }}>Dịch vụ URL</th>
                                    <th style={{ padding: '12px 14px' }}>Khóa API</th>
                                    <th style={{ padding: '12px 14px' }}>Kích hoạt</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody style={{ fontSize: '13px' }}>
                                {credentials.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                            Chưa cấu hình tài khoản CDS Copernicus nào.
                                        </td>
                                    </tr>
                                ) : (
                                    credentials.map(c => (
                                        <tr key={c.id}>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>#{c.id}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>{c.name}</td>
                                            <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: '#64748b' }}>{c.url}</td>
                                            <td style={{ padding: '12px 14px', fontFamily: 'monospace' }}>{c.masked_key || '********'}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                {c.is_active ? (
                                                    <span className="label label-success" style={{ backgroundColor: '#10b981' }}>Hoạt động</span>
                                                ) : (
                                                    <span className="label label-default">Tắt</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => handleTestCred(c.id)}
                                                    className="btn btn-xs btn-default"
                                                    style={{ marginRight: '6px' }}
                                                    title="Kiểm tra kết nối tới máy chủ CDS"
                                                >
                                                    <i className="fa fa-plug" style={{ color: '#0284c7', marginRight: '4px' }}></i>Test
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setCredForm({ id: c.id, name: c.name, url: c.url, api_key: '', is_active: c.is_active });
                                                        setShowCredModal(true);
                                                    }}
                                                    className="btn btn-xs btn-default"
                                                    style={{ marginRight: '6px' }}
                                                    title="Chỉnh sửa"
                                                >
                                                    <i className="fa fa-pencil"></i>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteCred(c.id)}
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

            {/* TAB 2: Download Jobs */}
            {activeTab === 'jobs' && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div className="table-responsive">
                        <table className="table table-hover" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px 14px' }}>Mã</th>
                                    <th style={{ padding: '12px 14px' }}>Tên tác vụ</th>
                                    <th style={{ padding: '12px 14px' }}>Bộ dữ liệu</th>
                                    <th style={{ padding: '12px 14px' }}>Chế độ</th>
                                    <th style={{ padding: '12px 14px' }}>Độ trễ</th>
                                    <th style={{ padding: '12px 14px' }}>Trạng thái</th>
                                    <th style={{ padding: '12px 14px' }}>Chạy gần nhất</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody style={{ fontSize: '13px' }}>
                                {jobs.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                            Chưa có tác vụ thu thập dữ liệu CDS nào.
                                        </td>
                                    </tr>
                                ) : (
                                    jobs.map(j => (
                                        <tr key={j.id}>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>#{j.id}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>{j.name}</td>
                                            <td style={{ padding: '12px 14px' }}>{j.dataset_detail?.name || j.dataset_name}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span className="badge" style={{ backgroundColor: j.mode === 'RECURRING' ? '#6366f1' : '#64748b' }}>
                                                    {j.mode === 'RECURRING' ? 'Định kỳ' : 'Một lần'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>{j.lag_days} ngày</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span className={`label label-${j.status === 'RUNNING' ? 'primary' : j.status === 'SUCCESS' ? 'success' : j.status === 'FAILED' ? 'danger' : 'default'}`}>
                                                    {j.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px', color: '#64748b' }}>
                                                {j.last_run_at ? new Date(j.last_run_at).toLocaleString('vi-VN') : 'Chưa chạy'}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => handleRunJob(j.id)}
                                                    className="btn btn-xs btn-success"
                                                    style={{ marginRight: '6px' }}
                                                    title="Kích hoạt tải ngay"
                                                >
                                                    <i className="fa fa-play" style={{ marginRight: '4px' }}></i>Chạy
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setJobForm({
                                                            id: j.id,
                                                            name: j.name,
                                                            credential: j.credential,
                                                            dataset: j.dataset,
                                                            dataset_name: j.dataset_name,
                                                            mode: j.mode,
                                                            lag_days: j.lag_days,
                                                            auto_latest: j.auto_latest
                                                        });
                                                        setShowJobModal(true);
                                                    }}
                                                    className="btn btn-xs btn-default"
                                                    style={{ marginRight: '6px' }}
                                                    title="Chỉnh sửa"
                                                >
                                                    <i className="fa fa-pencil"></i>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteJob(j.id)}
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

            {/* TAB 3: Job Runs History */}
            {activeTab === 'runs' && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div className="table-responsive">
                        <table className="table table-hover" style={{ margin: 0 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px 14px' }}>Mã lượt</th>
                                    <th style={{ padding: '12px 14px' }}>Tác vụ</th>
                                    <th style={{ padding: '12px 14px' }}>Bắt đầu</th>
                                    <th style={{ padding: '12px 14px' }}>Kết thúc</th>
                                    <th style={{ padding: '12px 14px' }}>Trạng thái</th>
                                    <th style={{ padding: '12px 14px' }}>Granules</th>
                                    <th style={{ padding: '12px 14px' }}>Thông tin lỗi</th>
                                </tr>
                            </thead>
                            <tbody style={{ fontSize: '13px' }}>
                                {runs.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                            Chưa có lượt chạy CDS nào được ghi nhận.
                                        </td>
                                    </tr>
                                ) : (
                                    runs.map(r => (
                                        <tr key={r.id}>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>#{r.id}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{r.job_name || `Job #${r.job}`}</td>
                                            <td style={{ padding: '12px 14px', color: '#64748b' }}>{r.started_at ? new Date(r.started_at).toLocaleString('vi-VN') : '-'}</td>
                                            <td style={{ padding: '12px 14px', color: '#64748b' }}>{r.finished_at ? new Date(r.finished_at).toLocaleString('vi-VN') : '-'}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span className={`label label-${r.status === 'SUCCESS' ? 'success' : r.status === 'RUNNING' ? 'primary' : 'danger'}`}>
                                                    {r.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{r.records_ingested ?? 0}</td>
                                            <td style={{ padding: '12px 14px', color: r.error_message ? '#ef4444' : '#64748b', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.error_message || ''}>
                                                {r.error_message || 'OK'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal CDSCredential */}
            {showCredModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '500px', maxWidth: '90%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '18px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            {credForm.id ? 'Chỉnh sửa tài khoản CDS' : 'Thêm tài khoản CDS Copernicus'}
                        </h3>
                        <form onSubmit={handleSaveCred}>
                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Tên nhận diện *</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={credForm.name}
                                    onChange={e => setCredForm({ ...credForm, name: e.target.value })}
                                    required
                                    placeholder="VD: ECMWF Production Account"
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Dịch vụ CDS URL *</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={credForm.url}
                                    onChange={e => setCredForm({ ...credForm, url: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Khóa API (Personal Access Token) {credForm.id ? '(Để trống nếu không đổi)' : '*'}</label>
                                <input
                                    type="password"
                                    className="form-control"
                                    value={credForm.api_key}
                                    onChange={e => setCredForm({ ...credForm, api_key: e.target.value })}
                                    required={!credForm.id}
                                    placeholder="Nhập khóa CDS token..."
                                />
                            </div>
                            <div className="checkbox" style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>
                                    <input
                                        type="checkbox"
                                        checked={credForm.is_active}
                                        onChange={e => setCredForm({ ...credForm, is_active: e.target.checked })}
                                    /> Kích hoạt sử dụng tài khoản này
                                </label>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setShowCredModal(false)} className="btn btn-default">Hủy</button>
                                <button type="submit" className="btn btn-primary">Lưu cấu hình</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal CDSDownloadJob */}
            {showJobModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '560px', maxWidth: '90%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '18px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            {jobForm.id ? 'Chỉnh sửa tác vụ thu thập CDS' : 'Tạo mới tác vụ thu thập CDS'}
                        </h3>
                        <form onSubmit={handleSaveJob}>
                            <div className="form-group" style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Tên tác vụ *</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={jobForm.name}
                                    onChange={e => setJobForm({ ...jobForm, name: e.target.value })}
                                    required
                                    placeholder="VD: Cập nhật ERA5 Biển Đông hàng ngày"
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Tài khoản CDS *</label>
                                    <select
                                        className="form-control"
                                        value={jobForm.credential}
                                        onChange={e => setJobForm({ ...jobForm, credential: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Chọn tài khoản --</option>
                                        {credentials.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Bộ dữ liệu đích *</label>
                                    <select
                                        className="form-control"
                                        value={jobForm.dataset}
                                        onChange={e => setJobForm({ ...jobForm, dataset: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Chọn bộ dữ liệu --</option>
                                        {datasets.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Mã Dataset Copernicus *</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={jobForm.dataset_name}
                                    onChange={e => setJobForm({ ...jobForm, dataset_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Chế độ thực thi</label>
                                    <select
                                        className="form-control"
                                        value={jobForm.mode}
                                        onChange={e => setJobForm({ ...jobForm, mode: e.target.value })}
                                    >
                                        <option value="ONCE">Chạy 1 lần (Thủ công)</option>
                                        <option value="RECURRING">Lặp lại theo lịch (Celery Beat)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Độ trễ số liệu (ngày)</label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={jobForm.lag_days}
                                        onChange={e => setJobForm({ ...jobForm, lag_days: e.target.value })}
                                        min="1"
                                    />
                                </div>
                            </div>
                            <div className="checkbox" style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>
                                    <input
                                        type="checkbox"
                                        checked={jobForm.auto_latest}
                                        onChange={e => setJobForm({ ...jobForm, auto_latest: e.target.checked })}
                                    /> Tự động tải từ granule mới nhất đến hôm nay (trừ độ trễ)
                                </label>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setShowJobModal(false)} className="btn btn-default">Hủy</button>
                                <button type="submit" className="btn btn-primary">Lưu tác vụ</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

AdminCdsRoute.propTypes = {
    config: PropTypes.object
};

export default AdminCdsRoute;
