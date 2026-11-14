import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
    getAdminDatasets,
    getRasterGranules,
    uploadRasterFile
} from '../../api/admin';

const AdminRastersRoute = () => {
    const [datasets, setDatasets] = useState([]);
    const [selectedDatasetId, setSelectedDatasetId] = useState('');
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadResult, setUploadResult] = useState(null); // { success: bool, message: '' }
    
    // Granule table
    const [granules, setGranules] = useState([]);
    const [totalGranules, setTotalGranules] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(15);
    const [filterDataset, setFilterDataset] = useState('');
    const [loadingGranules, setLoadingGranules] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    useEffect(() => {
        getAdminDatasets().then(data => {
            setDatasets(data);
            if (data.length > 0) {
                setSelectedDatasetId(data[0].id);
            }
        });
    }, []);

    const loadGranules = () => {
        setLoadingGranules(true);
        const params = {
            page,
            page_size: pageSize
        };
        if (filterDataset) {
            params.dataset = filterDataset;
        }
        getRasterGranules(params).then(res => {
            setGranules(res.results || res || []);
            setTotalGranules(res.count || (res.results ? res.results.length : (res.length || 0)));
            setLoadingGranules(false);
        }).catch(() => {
            setLoadingGranules(false);
        });
    };

    useEffect(() => {
        loadGranules();
    }, [page, filterDataset]);

    const handleFileSelect = (selectedFile) => {
        if (!selectedFile) return;
        const name = selectedFile.name.toLowerCase();
        if (!name.endsWith('.nc') && !name.endsWith('.zip')) {
            alert('Vui lòng chọn tệp .nc hoặc .zip chứa dữ liệu NetCDF.');
            return;
        }
        setFile(selectedFile);
        setUploadResult(null);
    };

    const handleUpload = (e) => {
        e.preventDefault();
        if (!file || !selectedDatasetId) {
            alert('Vui lòng chọn bộ dữ liệu và tệp NetCDF/Zip.');
            return;
        }

        setUploading(true);
        setUploadProgress(0);
        setUploadResult(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('dataset_id', selectedDatasetId);

        uploadRasterFile(formData, (progressEvent) => {
            if (progressEvent.total) {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setUploadProgress(percent);
            }
        }).then(res => {
            setUploading(false);
            setUploadResult({
                success: true,
                message: res.message || `Nạp thành công ${res.granules || 0} granules!`
            });
            setFile(null);
            loadGranules();
        }).catch(err => {
            setUploading(false);
            setUploadResult({
                success: false,
                message: err.response?.data?.error || err.message || 'Lỗi khi nạp tệp NetCDF.'
            });
        });
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Quản lý Dữ liệu Lưới & Tệp NetCDF
                </h2>
                <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
                    Nạp tệp NetCDF (.nc) hoặc nén (.zip), tách tự động mốc giờ vào RasterGranuleIndex và đồng bộ biến khí quyển.
                </p>
            </div>

            {/* Upload NetCDF Card */}
            <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '28px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginTop: 0, marginBottom: '16px' }}>
                    <i className="fa fa-cloud-upload" style={{ color: '#0284c7', marginRight: '8px' }}></i>
                    Tải lên Tệp NetCDF / Lưu trữ Zip
                </h3>

                <form onSubmit={handleUpload}>
                    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px', alignItems: 'start' }}>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                                Chọn bộ dữ liệu đích *
                            </label>
                            <select
                                className="form-control"
                                value={selectedDatasetId}
                                onChange={e => setSelectedDatasetId(e.target.value)}
                                style={{ borderRadius: '6px' }}
                                required
                            >
                                {datasets.map(d => (
                                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                                ))}
                            </select>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                                Granule nạp sẽ liên kết với bộ dữ liệu này và tự động trích xuất các biến thành phần (u, v, speed).
                            </div>
                        </div>

                        {/* Drag and drop box */}
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                                Tệp NetCDF (.nc) hoặc Zip (.zip) *
                            </label>
                            <div
                                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setIsDragOver(false);
                                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                        handleFileSelect(e.dataTransfer.files[0]);
                                    }
                                }}
                                style={{
                                    border: isDragOver ? '2px dashed #0284c7' : '2px dashed #cbd5e1',
                                    borderRadius: '8px',
                                    backgroundColor: isDragOver ? '#f0f9ff' : '#f8fafc',
                                    padding: '24px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                                onClick={() => document.getElementById('netcdf-file-input').click()}
                            >
                                <input
                                    id="netcdf-file-input"
                                    type="file"
                                    accept=".nc,.zip"
                                    style={{ display: 'none' }}
                                    onChange={(e) => handleFileSelect(e.target.files[0])}
                                />
                                <i className="fa fa-file-code-o" style={{ fontSize: '36px', color: file ? '#0284c7' : '#94a3b8', marginBottom: '10px' }}></i>
                                {file ? (
                                    <div>
                                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>{file.name}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                            {(file.size / (1024 * 1024)).toFixed(2)} MB - Nhấp để chọn tệp khác
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ fontWeight: 600, color: '#334155', fontSize: '14px' }}>
                                            Kéo thả tệp .nc / .zip vào đây hoặc bấm để chọn tệp
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                                            Hỗ trợ tệp mô hình ERA5, WRF, GFS dạng mốc giờ hoặc chuỗi thời gian nhiều mốc
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {uploading && (
                        <div style={{ marginTop: '18px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                                <span>Đang tải lên và xử lý phân rã NetCDF...</span>
                                <span>{uploadProgress}%</span>
                            </div>
                            <div className="progress" style={{ height: '8px', borderRadius: '4px', marginBottom: 0 }}>
                                <div
                                    className="progress-bar progress-bar-striped active"
                                    role="progressbar"
                                    style={{ width: `${uploadProgress}%`, backgroundColor: '#0284c7' }}
                                ></div>
                            </div>
                        </div>
                    )}

                    {uploadResult && (
                        <div
                            className={`alert alert-${uploadResult.success ? 'success' : 'danger'}`}
                            style={{ borderRadius: '8px', marginTop: '16px', marginBottom: 0 }}
                        >
                            <i className={`fa ${uploadResult.success ? 'fa-check-circle' : 'fa-exclamation-triangle'}`} style={{ marginRight: '8px' }}></i>
                            {uploadResult.message}
                        </div>
                    )}

                    <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            type="submit"
                            disabled={!file || uploading}
                            className="btn btn-primary"
                            style={{ padding: '8px 20px', borderRadius: '6px', fontWeight: 600 }}
                        >
                            <i className="fa fa-play" style={{ marginRight: '6px' }}></i>
                            {uploading ? 'Đang nạp dữ liệu...' : 'Bắt đầu nạp dữ liệu'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Granules Data Table */}
            <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                    <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                            Danh mục Granule Raster Đã Chỉ mục ({totalGranules})
                        </h3>
                        <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
                            Các file raster đơn lẻ phục vụ kết xuất vector gió động và hiển thị trường nhiệt/tốc độ.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <select
                            className="form-control"
                            value={filterDataset}
                            onChange={e => { setFilterDataset(e.target.value); setPage(1); }}
                            style={{ width: '220px', borderRadius: '6px', fontSize: '13px' }}
                        >
                            <option value="">-- Tất cả bộ dữ liệu --</option>
                            {datasets.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={loadGranules}
                            disabled={loadingGranules}
                            className="btn btn-default"
                            style={{ borderRadius: '6px' }}
                            title="Làm mới"
                        >
                            <i className={`fa fa-refresh ${loadingGranules ? 'fa-spin' : ''}`}></i>
                        </button>
                    </div>
                </div>

                <div className="table-responsive">
                    <table className="table table-hover" style={{ margin: 0 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                <th style={{ padding: '12px 14px' }}>Mã Granule</th>
                                <th style={{ padding: '12px 14px' }}>Bộ dữ liệu</th>
                                <th style={{ padding: '12px 14px' }}>Mã biến</th>
                                <th style={{ padding: '12px 14px' }}>Mốc thời gian (UTC)</th>
                                <th style={{ padding: '12px 14px' }}>Đường dẫn tệp</th>
                            </tr>
                        </thead>
                        <tbody style={{ fontSize: '13px' }}>
                            {granules.length === 0 ? (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                                        {loadingGranules ? 'Đang tải dữ liệu granule...' : 'Chưa có bản ghi granule nào.'}
                                    </td>
                                </tr>
                            ) : (
                                granules.map(g => (
                                    <tr key={g.id}>
                                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>#{g.id}</td>
                                        <td style={{ padding: '12px 14px' }}>{g.dataset_detail?.name || `Bộ #${g.dataset}`}</td>
                                        <td style={{ padding: '12px 14px' }}>
                                            <span className="label label-info" style={{ backgroundColor: '#0ea5e9' }}>{g.variable_code}</span>
                                        </td>
                                        <td style={{ padding: '12px 14px', fontWeight: 500, color: '#0f172a' }}>
                                            {g.granule_time ? new Date(g.granule_time).toUTCString() : '-'}
                                        </td>
                                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: '#64748b', fontSize: '12px' }} title={g.file_location}>
                                            {g.file_location}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalGranules > pageSize && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                            Hiển thị trang {page} / {Math.ceil(totalGranules / pageSize)} ({totalGranules} bản ghi)
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                disabled={page <= 1}
                                onClick={() => setPage(page - 1)}
                                className="btn btn-default btn-sm"
                            >
                                Trước
                            </button>
                            <button
                                disabled={page * pageSize >= totalGranules}
                                onClick={() => setPage(page + 1)}
                                className="btn btn-default btn-sm"
                            >
                                Tiếp
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

AdminRastersRoute.propTypes = {
    config: PropTypes.object
};

export default AdminRastersRoute;
