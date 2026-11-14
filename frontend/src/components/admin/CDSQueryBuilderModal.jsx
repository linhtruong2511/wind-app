import React, { useState } from 'react';
import PropTypes from 'prop-types';
import CDSOpenLayersMiniMap from './CDSOpenLayersMiniMap';
import {
    decomposeDateRange,
    HOUR_PRESETS,
    DEFAULT_WIND_VARIABLES
} from '../../utils/cdsQueryUtils';

const DEFAULT_VIETNAM_BBOX = [24.0, 102.0, 8.0, 118.0];
const DEFAULT_GLOBAL_BBOX = [90.0, -180.0, -90.0, 180.0];

const CDSQueryBuilderModal = ({
    show,
    onClose,
    credentials = [],
    datasets = [],
    catalog = {},
    areaPresets = {},
    onSave
}) => {
    if (!show) return null;

    // Wizard step: 1 | 2 | 3 | 4
    const [step, setStep] = useState(1);
    const [errorMsg, setErrorMsg] = useState('');

    // Step 1: General Info & Datasets
    const [name, setName] = useState('');
    const [credentialId, setCredentialId] = useState(credentials[0]?.id || '');
    const [datasetName, setDatasetName] = useState('reanalysis-era5-single-levels');
    const [customDatasetName, setCustomDatasetName] = useState('');
    const [targetDatasetId, setTargetDatasetId] = useState(datasets[0]?.id || '');

    // Step 2: Variables
    const [selectedVariables, setSelectedVariables] = useState([...DEFAULT_WIND_VARIABLES]);

    // Step 3: Temporal
    const [mode, setMode] = useState('ONCE'); // 'ONCE' | 'RECURRING'
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 10);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        return d.toISOString().split('T')[0];
    });
    const [selectedHours, setSelectedHours] = useState([...HOUR_PRESETS.EVERY_3H]);
    const [lagDays, setLagDays] = useState(5);
    const [autoLatest, setAutoLatest] = useState(true);

    // Step 4: Spatial Bounding Box
    const [bbox, setBbox] = useState([...DEFAULT_VIETNAM_BBOX]);

    // Helpers for Step 2: Variables
    const toggleVariable = (code) => {
        if (selectedVariables.includes(code)) {
            setSelectedVariables(selectedVariables.filter(v => v !== code));
        } else {
            setSelectedVariables([...selectedVariables, code]);
        }
    };

    const selectCategoryAll = (categoryVars) => {
        const codes = categoryVars.map(v => v.code);
        const combined = Array.from(new Set([...selectedVariables, ...codes]));
        setSelectedVariables(combined);
    };

    const deselectCategory = (categoryVars) => {
        const codes = new Set(categoryVars.map(v => v.code));
        setSelectedVariables(selectedVariables.filter(v => !codes.has(v)));
    };

    // Validation per step
    const validateStep = (currentStep) => {
        setErrorMsg('');
        if (currentStep === 1) {
            if (!name.trim()) {
                setErrorMsg('Vui lòng nhập tên nhận diện tác vụ.');
                return false;
            }
            if (!credentialId) {
                setErrorMsg('Vui lòng chọn tài khoản Copernicus.');
                return false;
            }
            if (!targetDatasetId) {
                setErrorMsg('Vui lòng chọn bộ dữ liệu lưu trữ.');
                return false;
            }
            if (datasetName === 'custom' && !customDatasetName.trim()) {
                setErrorMsg('Vui lòng nhập tên bộ dữ liệu tùy chỉnh.');
                return false;
            }
        } else if (currentStep === 2) {
            if (selectedVariables.length === 0) {
                setErrorMsg('Vui lòng chọn ít nhất 1 biến dữ liệu khí tượng.');
                return false;
            }
        } else if (currentStep === 3) {
            if (mode === 'ONCE') {
                if (!startDate || !endDate) {
                    setErrorMsg('Vui lòng chọn đầy đủ ngày bắt đầu và kết thúc.');
                    return false;
                }
                if (new Date(startDate) > new Date(endDate)) {
                    setErrorMsg('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
                    return false;
                }
                if (selectedHours.length === 0) {
                    setErrorMsg('Vui lòng chọn ít nhất 1 mốc giờ trong ngày.');
                    return false;
                }
            }
        } else if (currentStep === 4) {
            const [north, west, south, east] = bbox;
            if (isNaN(north) || isNaN(west) || isNaN(south) || isNaN(east)) {
                setErrorMsg('Tọa độ khu vực không hợp lệ.');
                return false;
            }
            if (north <= south) {
                setErrorMsg('Vĩ độ Bắc phải lớn hơn vĩ độ Nam.');
                return false;
            }
        }
        return true;
    };

    const handleNext = () => {
        if (validateStep(step)) {
            setStep(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        setErrorMsg('');
        setStep(prev => prev - 1);
    };

    const handleSubmit = (runImmediately = false) => {
        if (!validateStep(step)) return;

        const effectiveDatasetName = datasetName === 'custom' ? customDatasetName.trim() : datasetName;

        let requestParams = {
            product_type: ['reanalysis'],
            variable: selectedVariables,
            area: bbox.map(v => parseFloat(v)),
            data_format: 'netcdf',
            download_format: 'unarchived'
        };

        if (mode === 'ONCE') {
            const decomposed = decomposeDateRange(startDate, endDate, selectedHours);
            requestParams = {
                ...requestParams,
                year: decomposed.years,
                month: decomposed.months,
                day: decomposed.days,
                time: decomposed.time
            };
        } else {
            // Mode RECURRING
            requestParams = {
                ...requestParams,
                time: selectedHours.length > 0 ? selectedHours : ['00:00']
            };
        }

        const payload = {
            name: name.trim(),
            credential: parseInt(credentialId, 10),
            dataset: parseInt(targetDatasetId, 10),
            dataset_name: effectiveDatasetName,
            mode: mode,
            lag_days: parseInt(lagDays, 10) || 5,
            auto_latest: mode === 'RECURRING' ? autoLatest : false,
            request_params: requestParams,
            run_immediately: runImmediately
        };

        onSave(payload, runImmediately);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                width: '840px',
                maxWidth: '96%',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#f8fafc'
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fa fa-cloud-download" style={{ color: '#0284c7' }}></i>
                            Tạo tác vụ tải dữ liệu ERA5
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                            Tải dữ liệu khí tượng tái phân tích ERA5 và nạp tự động vào hệ thống.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ border: 'none', background: 'transparent', fontSize: '22px', color: '#94a3b8', cursor: 'pointer' }}
                    >
                        &times;
                    </button>
                </div>

                {/* Stepper Bar */}
                <div style={{
                    display: 'flex',
                    borderBottom: '1px solid #e2e8f0',
                    background: '#ffffff',
                    padding: '12px 24px',
                    gap: '12px',
                    justifyContent: 'space-between'
                }}>
                    {[
                        { num: 1, label: 'Cấu hình chung', icon: 'fa-cog' },
                        { num: 2, label: 'Biến dữ liệu', icon: 'fa-cubes' },
                        { num: 3, label: 'Thời gian', icon: 'fa-calendar' },
                        { num: 4, label: 'Bản đồ và tọa độ', icon: 'fa-globe' }
                    ].map(s => {
                        const isActive = step === s.num;
                        const isDone = step > s.num;
                        return (
                            <div
                                key={s.num}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '13px',
                                    fontWeight: isActive ? 700 : 500,
                                    color: isActive ? '#0284c7' : isDone ? '#10b981' : '#94a3b8',
                                    cursor: isDone ? 'pointer' : 'default'
                                }}
                                onClick={() => { if (isDone) setStep(s.num); }}
                            >
                                <span style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    backgroundColor: isActive ? '#0284c7' : isDone ? '#10b981' : '#f1f5f9',
                                    color: (isActive || isDone) ? '#ffffff' : '#64748b'
                                }}>
                                    {isDone ? <i className="fa fa-check"></i> : s.num}
                                </span>
                                <span>{s.label}</span>
                            </div>
                        );
                    })}
                </div>

                {/* Error Banner */}
                {errorMsg && (
                    <div style={{ margin: '12px 24px 0 24px', padding: '10px 14px', borderRadius: '6px', background: '#fee2e2', color: '#b91c1c', fontSize: '13px' }}>
                        <i className="fa fa-exclamation-triangle" style={{ marginRight: '6px' }}></i>
                        {errorMsg}
                    </div>
                )}

                {/* Modal Body */}
                <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
                    {/* BƯỚC 1: CẤU HÌNH CHUNG */}
                    {step === 1 && (
                        <div>
                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Tên nhận diện tác vụ *</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Ví dụ: Cập nhật ERA5 gió Biển Đông, tháng 1/2024"
                                    required
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Tài khoản Copernicus *</label>
                                    <select
                                        className="form-control"
                                        value={credentialId}
                                        onChange={e => setCredentialId(e.target.value)}
                                        required
                                    >
                                        <option value="">-- Chọn tài khoản --</option>
                                        {credentials.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Bộ dữ liệu lưu trữ *</label>
                                    <select
                                        className="form-control"
                                        value={targetDatasetId}
                                        onChange={e => setTargetDatasetId(e.target.value)}
                                        required
                                    >
                                        <option value="">-- Chọn bộ dữ liệu nạp vào --</option>
                                        {datasets.map(d => (
                                            <option key={d.id} value={d.id}>
                                                {d.name}
                                            </option>
                                        ))}
                                    </select>
                                    <small style={{ color: '#64748b', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                                        Toàn bộ dữ liệu tải về sẽ được tự động nạp vào bộ dữ liệu này.
                                    </small>
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Bộ dữ liệu trên Copernicus</label>
                                <select
                                    className="form-control"
                                    value={datasetName}
                                    onChange={e => setDatasetName(e.target.value)}
                                >
                                    <option value="reanalysis-era5-single-levels">
                                        ERA5 theo giờ, từ 1940 đến nay (mặc định cho dữ liệu gió)
                                    </option>
                                    <option value="reanalysis-era5-land">
                                        ERA5-Land theo giờ, từ 1950 đến nay, độ phân giải 9 km trên đất liền
                                    </option>
                                    <option value="custom">-- Nhập tên bộ dữ liệu khác... --</option>
                                </select>
                            </div>

                            {datasetName === 'custom' && (
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Tên bộ dữ liệu tùy chỉnh *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={customDatasetName}
                                        onChange={e => setCustomDatasetName(e.target.value)}
                                        placeholder="Ví dụ: reanalysis-era5-pressure-levels"
                                        required
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* BƯỚC 2: BIẾN DỮ LIỆU */}
                    {step === 2 && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                                        Chọn các biến khí tượng cần tải:
                                    </span>
                                    <span className="badge" style={{ marginLeft: '8px', backgroundColor: '#0284c7' }}>
                                        Đã chọn {selectedVariables.length} biến
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        className="btn btn-xs btn-default"
                                        onClick={() => setSelectedVariables([...DEFAULT_WIND_VARIABLES])}
                                    >
                                        <i className="fa fa-bolt" style={{ color: '#0284c7', marginRight: '4px' }}></i>Mặc định cho gió
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-xs btn-default"
                                        onClick={() => setSelectedVariables([])}
                                    >
                                        Bỏ chọn tất cả
                                    </button>
                                </div>
                            </div>

                            {/* Cụm biến theo 4 nhóm */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                {Object.entries(catalog).map(([catKey, catData]) => (
                                    <div
                                        key={catKey}
                                        style={{
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            padding: '12px',
                                            background: '#f8fafc'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                                                {catData.title || catKey}
                                            </span>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-xs btn-link"
                                                    style={{ padding: '0 4px', fontSize: '11px', textDecoration: 'none' }}
                                                    onClick={() => selectCategoryAll(catData.variables || [])}
                                                >
                                                    Chọn hết
                                                </button>
                                                <span style={{ color: '#cbd5e1' }}>|</span>
                                                <button
                                                    type="button"
                                                    className="btn btn-xs btn-link"
                                                    style={{ padding: '0 4px', fontSize: '11px', textDecoration: 'none', color: '#64748b' }}
                                                    onClick={() => deselectCategory(catData.variables || [])}
                                                >
                                                    Bỏ
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                                            {(catData.variables || []).map(v => (
                                                <label
                                                    key={v.code}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        margin: 0,
                                                        fontSize: '12px',
                                                        fontWeight: selectedVariables.includes(v.code) ? 600 : 400,
                                                        color: selectedVariables.includes(v.code) ? '#0284c7' : '#334155',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedVariables.includes(v.code)}
                                                        onChange={() => toggleVariable(v.code)}
                                                    />
                                                    <span>{v.name}</span>
                                                    {v.unit && <span style={{ color: '#94a3b8', fontSize: '11px' }}>({v.unit})</span>}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* BƯỚC 3: THỜI GIAN */}
                    {step === 3 && (
                        <div>
                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Chế độ tải dữ liệu</label>
                                <div style={{ display: 'flex', gap: '20px', marginTop: '6px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="job_mode"
                                            value="ONCE"
                                            checked={mode === 'ONCE'}
                                            onChange={() => setMode('ONCE')}
                                            style={{ marginRight: '6px' }}
                                        />
                                        Tải một lần theo khoảng ngày chỉ định (thủ công)
                                    </label>
                                    <label style={{ fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="job_mode"
                                            value="RECURRING"
                                            checked={mode === 'RECURRING'}
                                            onChange={() => setMode('RECURRING')}
                                            style={{ marginRight: '6px' }}
                                        />
                                        Đồng bộ định kỳ hằng ngày
                                    </label>
                                </div>
                            </div>

                            {mode === 'ONCE' ? (
                                <div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                        <div className="form-group">
                                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Từ ngày *</label>
                                            <input
                                                type="date"
                                                className="form-control"
                                                value={startDate}
                                                onChange={e => setStartDate(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Đến ngày *</label>
                                            <input
                                                type="date"
                                                className="form-control"
                                                value={endDate}
                                                onChange={e => setEndDate(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Mốc giờ quan sát */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', margin: 0 }}>
                                                Mốc giờ trong ngày, theo giờ UTC:
                                            </label>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-xs btn-default"
                                                    onClick={() => setSelectedHours([...HOUR_PRESETS.ALL_24])}
                                                >
                                                    Đủ 24h
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-xs btn-default"
                                                    onClick={() => setSelectedHours([...HOUR_PRESETS.EVERY_3H])}
                                                >
                                                    Mỗi 3h
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-xs btn-default"
                                                    onClick={() => setSelectedHours([...HOUR_PRESETS.SYNOPTIC_6H])}
                                                >
                                                    Mỗi 6h
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' }}>
                                            {HOUR_PRESETS.ALL_24.map(h => (
                                                <button
                                                    key={h}
                                                    type="button"
                                                    onClick={() => {
                                                        if (selectedHours.includes(h)) {
                                                            setSelectedHours(selectedHours.filter(x => x !== h));
                                                        } else {
                                                            setSelectedHours([...selectedHours, h].sort());
                                                        }
                                                    }}
                                                    className={`btn btn-xs ${selectedHours.includes(h) ? 'btn-primary' : 'btn-default'}`}
                                                    style={{ fontWeight: 600 }}
                                                >
                                                    {h}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <div className="checkbox" style={{ margin: '0 0 12px 0' }}>
                                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                                            <input
                                                type="checkbox"
                                                checked={autoLatest}
                                                onChange={e => setAutoLatest(e.target.checked)}
                                            />
                                            Tự động nạp từ dữ liệu mới nhất đến hôm nay (trừ độ trễ)
                                        </label>
                                    </div>
                                    <div className="form-group" style={{ margin: 0, maxWidth: '240px' }}>
                                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Độ trễ dữ liệu ERA5 (ngày)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={lagDays}
                                            onChange={e => setLagDays(e.target.value)}
                                            min="1"
                                            max="30"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* BƯỚC 4: BẢN ĐỒ & TỌA ĐỘ */}
                    {step === 4 && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                                    Khu vực cần tải:
                                </span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        className="btn btn-xs btn-default"
                                        onClick={() => setBbox([...DEFAULT_VIETNAM_BBOX])}
                                    >
                                        🇻🇳 Việt Nam và Biển Đông
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-xs btn-default"
                                        onClick={() => setBbox([...DEFAULT_GLOBAL_BBOX])}
                                    >
                                        🌐 Toàn cầu
                                    </button>
                                </div>
                            </div>

                            {/* Bản đồ OpenLayers */}
                            <CDSOpenLayersMiniMap bbox={bbox} onChange={newBbox => setBbox(newBbox)} />

                            {/* 4 ô tọa độ */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Bắc</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="form-control input-sm"
                                        value={bbox[0]}
                                        onChange={e => setBbox([parseFloat(e.target.value) || 0, bbox[1], bbox[2], bbox[3]])}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Tây</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="form-control input-sm"
                                        value={bbox[1]}
                                        onChange={e => setBbox([bbox[0], parseFloat(e.target.value) || 0, bbox[2], bbox[3]])}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Nam</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="form-control input-sm"
                                        value={bbox[2]}
                                        onChange={e => setBbox([bbox[0], bbox[1], parseFloat(e.target.value) || 0, bbox[3]])}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Đông</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="form-control input-sm"
                                        value={bbox[3]}
                                        onChange={e => setBbox([bbox[0], bbox[1], bbox[2], parseFloat(e.target.value) || 0])}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div>
                        {step > 1 && (
                            <button
                                type="button"
                                className="btn btn-default"
                                onClick={handlePrev}
                                style={{ borderRadius: '6px' }}
                            >
                                <i className="fa fa-arrow-left" style={{ marginRight: '6px' }}></i>Quay lại
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            type="button"
                            className="btn btn-default"
                            onClick={onClose}
                            style={{ borderRadius: '6px' }}
                        >
                            Đóng
                        </button>

                        {step < 4 ? (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleNext}
                                style={{ borderRadius: '6px', fontWeight: 600 }}
                            >
                                Tiếp theo<i className="fa fa-arrow-right" style={{ marginLeft: '6px' }}></i>
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="btn btn-default"
                                    onClick={() => handleSubmit(false)}
                                    style={{ borderRadius: '6px', fontWeight: 600 }}
                                    title="Chỉ lưu tác vụ vào danh sách để chạy sau"
                                >
                                    <i className="fa fa-save" style={{ marginRight: '6px' }}></i>Lưu tác vụ
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-success"
                                    onClick={() => handleSubmit(true)}
                                    style={{ borderRadius: '6px', fontWeight: 700, backgroundColor: '#0284c7', borderColor: '#0284c7' }}
                                    title="Lưu tác vụ và bắt đầu tải dữ liệu ngay"
                                >
                                    <i className="fa fa-rocket" style={{ marginRight: '6px' }}></i>Lưu và chạy ngay
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

CDSQueryBuilderModal.propTypes = {
    show: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    credentials: PropTypes.array.isRequired,
    datasets: PropTypes.array.isRequired,
    catalog: PropTypes.object,
    areaPresets: PropTypes.object,
    onSave: PropTypes.func.isRequired
};

export default CDSQueryBuilderModal;
