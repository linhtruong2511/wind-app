import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import {
    getAdminStations,
    createStation,
    updateStation,
    deleteStation,
    getAdminDatasets,
    getDataLakeOverview,
    getDataLakePartitions,
    importDataLakeFile,
    deleteDataLakePartition,
    queryDataLake,
    syncDataLakeFromDb,
    getDownloadLakeDataUrl
} from '../../api/admin';

// Tệp CSV mẫu cho chức năng nạp số liệu (khớp với STANDARD_COLUMNS ở backend)
const IMPORT_TEMPLATE_HEADER = [
    'station_code', 'obs_time', 'wind_speed', 'wind_dir', 'temp_2m', 'temp_min', 'temp_max',
    'humidity', 'pressure', 'rain_06h', 'rain_24h'
];
const STATION_TYPE_LABELS = {
    SURFACE: 'Bề mặt',
    MET_MAST: 'Cột khí tượng',
    BUOY: 'Phao biển'
};

// Tệp CSV mẫu và định dạng cho chức năng nhập/xuất danh sách trạm đo
const STATION_CSV_HEADER = ['station_code', 'name', 'station_type', 'elevation', 'lat', 'lon', 'is_active'];
const STATION_CSV_TEMPLATE_ROWS = [
    ['PHU_QUY', 'Trạm khí tượng Phú Quý', 'SURFACE', '15.5', '10.518', '108.932', '1'],
    ['COT_DO_01', 'Cột đo gió số 1', 'MET_MAST', '42', '11.254', '109.101', '1'],
    ['PHAO_01', 'Phao quan trắc số 1', 'BUOY', '', '9.876', '107.654', '0'],
];
// Chấp nhận cả mã loại trạm lẫn tên hiển thị tiếng Việt
const STATION_TYPE_LOOKUP = {
    surface: 'SURFACE',
    met_mast: 'MET_MAST',
    buoy: 'BUOY',
    'bề mặt': 'SURFACE',
    'cột khí tượng': 'MET_MAST',
    'phao biển': 'BUOY'
};
const TRUE_VALUES = ['1', 'true', 'yes', 'có', 'hoạt động', 'đang vận hành'];
const FALSE_VALUES = ['0', 'false', 'no', 'không', 'tắt'];

const csvEscape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Thêm BOM UTF-8 ở đầu tệp để Excel nhận đúng tiếng Việt khi mở tệp
const UTF8_BOM = String.fromCharCode(0xFEFF);

const downloadCsvFile = (filename, rows) => {
    const content = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([UTF8_BOM + content + '\r\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// Trả về danh sách dòng, mỗi dòng kèm số thứ tự dòng trong tệp; tự nhận dấu phân cách "," hoặc ";"
const parseCsv = (text) => {
    const src = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const firstLine = src.split(/\r\n|\n|\r/)[0] || '';
    const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let line = 1;
    let rowLine = 1;
    const pushRow = () => {
        row.push(field);
        rows.push({ line: rowLine, cells: row });
        row = [];
        field = '';
    };
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
            } else {
                if (ch === '\n') line++;
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === delimiter) {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && src[i + 1] === '\n') i++;
            pushRow();
            line++;
            rowLine = line;
        } else {
            field += ch;
        }
    }
    if (field !== '' || row.length > 0) pushRow();
    return rows.filter(r => r.cells.some(c => c.trim() !== ''));
};

// Kiểm tra nội dung tệp CSV trạm đo; existingByCode là bản đồ mã trạm -> trạm đã có
const parseStationCsv = (text, existingByCode) => {
    const rows = parseCsv(text);
    if (rows.length === 0) return { fatal: 'Tệp không có dữ liệu.', items: [], errors: [] };

    const header = rows[0].cells.map(c => c.trim().toLowerCase());
    const missing = ['station_code', 'name', 'lat', 'lon'].filter(c => !header.includes(c));
    if (missing.length > 0) {
        return { fatal: `Tệp thiếu các cột bắt buộc: ${missing.join(', ')}.`, items: [], errors: [] };
    }
    const idx = (name) => header.indexOf(name);

    const items = [];
    const errors = [];
    const seen = new Set();

    rows.slice(1).forEach(({ line, cells }) => {
        const get = (name) => {
            const i = idx(name);
            return i >= 0 && cells[i] !== undefined ? cells[i].trim() : '';
        };
        const problems = [];

        const code = get('station_code');
        if (!code) problems.push('thiếu mã trạm');
        else if (seen.has(code.toLowerCase())) problems.push(`mã trạm ${code} bị trùng trong tệp`);
        const name = get('name');
        if (!name) problems.push('thiếu tên trạm');

        const typeRaw = get('station_type');
        const stationType = typeRaw ? STATION_TYPE_LOOKUP[typeRaw.toLowerCase()] : 'SURFACE';
        if (!stationType) problems.push(`loại trạm "${typeRaw}" không hợp lệ`);

        const lat = Number(get('lat'));
        if (get('lat') === '' || Number.isNaN(lat) || lat < -90 || lat > 90) problems.push('vĩ độ không hợp lệ');
        const lon = Number(get('lon'));
        if (get('lon') === '' || Number.isNaN(lon) || lon < -180 || lon > 180) problems.push('kinh độ không hợp lệ');

        let elevation = null;
        if (get('elevation') !== '') {
            elevation = Number(get('elevation'));
            if (Number.isNaN(elevation)) problems.push('độ cao không hợp lệ');
        }

        let isActive = true;
        const activeRaw = get('is_active').toLowerCase();
        if (activeRaw !== '') {
            if (TRUE_VALUES.includes(activeRaw)) isActive = true;
            else if (FALSE_VALUES.includes(activeRaw)) isActive = false;
            else problems.push('trạng thái hoạt động không hợp lệ');
        }

        if (problems.length > 0) {
            errors.push({ line, message: problems.join('; ') });
            return;
        }
        seen.add(code.toLowerCase());
        const existing = existingByCode[code.toLowerCase()];
        items.push({
            line,
            existingId: existing ? existing.id : null,
            payload: {
                station_code: code,
                name,
                station_type: stationType,
                elevation,
                lat,
                lon,
                is_active: isActive
            }
        });
    });

    return { fatal: null, items, errors };
};

const IMPORT_TEMPLATE_ROWS = [
    ['WS001', '2025-01-01 00:00:00', '3.5', '45', '18.2', '16.1', '20.4', '78', '1012.3', '0', '0'],
    ['WS001', '2025-01-01 01:00:00', '4.1', '50', '17.8', '15.9', '19.6', '80', '1012.1', '0', '0'],
    ['WS001', '2025-01-01 02:00:00', '2.8', '90', '17.5', '15.7', '19.2', '82', '1011.8', '0', '0'],
    ['WS001', '2025-01-01 03:00:00', '5.2', '135', '17.1', '15.4', '18.9', '84', '1011.5', '0', '0'],
    ['WS001', '2025-01-01 04:00:00', '6.0', '180', '16.9', '15.2', '18.5', '85', '1011.2', '0', '0.4'],
];

const AdminStationsRoute = () => {
    // Tabs: 'stations' | 'datalake' | 'import' | 'analytics'
    const [activeTab, setActiveTab] = useState('stations');
    const [stations, setStations] = useState([]);
    const [datasets, setDatasets] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // ==========================================
    // 1. Station CRUD State
    // ==========================================
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

    // Nhập danh sách trạm từ tệp CSV
    const stationFileInputRef = useRef(null);
    const [stationImport, setStationImport] = useState(null); // { fileName, items, errors, fatal }
    const [stationImportLoading, setStationImportLoading] = useState(false);
    const [stationImportChecking, setStationImportChecking] = useState(false);

    // ==========================================
    // 2. Data Lake Overview & Partitions State
    // ==========================================
    const [lakeOverview, setLakeOverview] = useState(null);
    const [partitions, setPartitions] = useState([]);
    const [lakeLoading, setLakeLoading] = useState(false);
    const [lakeStationFilter, setLakeStationFilter] = useState('');
    const [lakeYearFilter, setLakeYearFilter] = useState('');
    const [syncLoading, setSyncLoading] = useState(false);

    // Custom Export Modal State
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportForm, setExportForm] = useState({
        station_code: '',
        start_date: '',
        end_date: '',
        format: 'csv'
    });

    // ==========================================
    // 3. Ingestion State
    // ==========================================
    const [importFile, setImportFile] = useState(null);
    const [dryRunLoading, setDryRunLoading] = useState(false);
    const [dryRunData, setDryRunData] = useState(null);
    const [importLoading, setImportLoading] = useState(false);

    // ==========================================
    // 4. Analytics & SQL Playground State
    // ==========================================
    const [analyticsMode, setAnalyticsMode] = useState('wind_rose'); // 'wind_rose' | 'sql'
    const [analyticsStation, setAnalyticsStation] = useState('');
    const [analyticsStartDate, setAnalyticsStartDate] = useState('');
    const [analyticsEndDate, setAnalyticsEndDate] = useState('');
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [windRoseResult, setWindRoseResult] = useState(null);

    // SQL Playground
    const [customSql, setCustomSql] = useState('SELECT station_code, count(*) as total_obs, round(avg(wind_speed), 2) as avg_speed, round(max(wind_speed), 2) as max_speed FROM observations GROUP BY 1 ORDER BY 3 DESC');
    const [sqlResult, setSqlResult] = useState(null);

    // ==========================================
    // Data Loading Functions
    // ==========================================
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

    const loadDataLake = () => {
        setLakeLoading(true);
        Promise.all([
            getDataLakeOverview(),
            getDataLakePartitions({
                station_code: lakeStationFilter || undefined,
                year: lakeYearFilter || undefined
            })
        ]).then(([ov, parts]) => {
            setLakeOverview(ov);
            setPartitions(parts);
            setLakeLoading(false);
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Lỗi tải dữ liệu quan trắc: ' + (err.response?.data?.detail || err.message) });
            setLakeLoading(false);
        });
    };

    useEffect(() => {
        loadStations();
        getAdminDatasets().then(data => setDatasets(data));
        loadDataLake();
    }, []);

    useEffect(() => {
        if (activeTab === 'datalake') {
            loadDataLake();
        }
    }, [activeTab, lakeStationFilter, lakeYearFilter]);

    // ==========================================
    // Station CRUD Handlers
    // ==========================================
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

    // ==========================================
    // Station CSV Handlers (tải mẫu, xuất, nhập)
    // ==========================================
    const handleDownloadStationTemplate = () => {
        downloadCsvFile('mau_danh_sach_tram_do.csv', [STATION_CSV_HEADER, ...STATION_CSV_TEMPLATE_ROWS]);
    };

    const handleExportStations = () => {
        if (stations.length === 0) {
            setFeedback({ type: 'danger', message: 'Không có trạm đo nào để xuất.' });
            return;
        }
        const rows = stations.map(s => [
            s.station_code,
            s.name,
            s.station_type || 'SURFACE',
            s.elevation ?? '',
            s.lat ?? '',
            s.lon ?? '',
            s.is_active ? 1 : 0
        ]);
        downloadCsvFile('danh_sach_tram_do.csv', [STATION_CSV_HEADER, ...rows]);
    };

    const handleStationFileSelected = (e) => {
        const file = e.target.files[0];
        e.target.value = ''; // cho phép chọn lại cùng một tệp
        if (!file) return;

        setStationImportChecking(true);
        setFeedback(null);
        // Lấy danh sách trạm mới nhất (không lọc theo ô tìm kiếm) để biết trạm nào đã tồn tại
        Promise.all([file.text(), getAdminStations()]).then(([text, allStations]) => {
            const existingByCode = {};
            allStations.forEach(s => { existingByCode[String(s.station_code).toLowerCase()] = s; });
            setStationImport({ fileName: file.name, ...parseStationCsv(text, existingByCode) });
            setStationImportChecking(false);
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Không thể đọc tệp: ' + (err.response?.data?.detail || err.message) });
            setStationImportChecking(false);
        });
    };

    const handleConfirmStationImport = async () => {
        if (!stationImport || stationImport.items.length === 0) return;
        setStationImportLoading(true);
        const defaultDataset = datasets[0]?.id || null;
        let created = 0;
        let updated = 0;
        const failures = [];

        for (const item of stationImport.items) {
            try {
                if (item.existingId) {
                    await updateStation(item.existingId, item.payload);
                    updated++;
                } else {
                    await createStation({ ...item.payload, dataset: defaultDataset });
                    created++;
                }
            } catch (err) {
                const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
                failures.push(`dòng ${item.line} (${item.payload.station_code}): ${detail}`);
            }
        }

        setStationImportLoading(false);
        setStationImport(null);
        loadStations();
        const summary = `Đã thêm mới ${created} trạm, cập nhật ${updated} trạm.`;
        if (failures.length > 0) {
            setFeedback({ type: 'danger', message: `${summary} Có ${failures.length} dòng lỗi: ${failures.slice(0, 3).join(' | ')}${failures.length > 3 ? ' ...' : ''}` });
        } else {
            setFeedback({ type: 'success', message: summary });
        }
    };

    // ==========================================
    // Ingestion Handlers (Data Lake or DB)
    // ==========================================
    const handleDryRun = () => {
        if (!importFile) return;
        setDryRunLoading(true);
        setFeedback(null);
        setDryRunData(null);

        importDataLakeFile(importFile, true).then(res => {
            setDryRunData(res);
            setDryRunLoading(false);
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Kiểm tra thất bại: ' + (err.response?.data?.error || err.message) });
            setDryRunLoading(false);
        });
    };

    const handleRealImport = () => {
        if (!importFile) return;
        setImportLoading(true);

        importDataLakeFile(importFile, false).then(res => {
            setFeedback({ type: 'success', message: res.message || 'Nạp dữ liệu quan trắc thành công!' });
            setImportLoading(false);
            setImportFile(null);
            setDryRunData(null);
            loadDataLake();
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Nạp dữ liệu thất bại: ' + (err.response?.data?.error || err.message) });
            setImportLoading(false);
        });
    };

    const handleDownloadTemplate = () => {
        const csvLines = [IMPORT_TEMPLATE_HEADER, ...IMPORT_TEMPLATE_ROWS].map(row => row.join(',')).join('\r\n');
        // BOM (\uFEFF) giúp Excel nhận đúng UTF-8 khi mở tệp
        const blob = new Blob(['\uFEFF' + csvLines + '\r\n'], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'mau_import_so_lieu_quan_trac.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleSyncFromDb = () => {
        if (!window.confirm('Hệ thống sẽ sao chép toàn bộ số liệu từ cơ sở dữ liệu sang kho dữ liệu. Tiếp tục?')) return;
        setSyncLoading(true);
        syncDataLakeFromDb().then(res => {
            setFeedback({ type: 'success', message: res.message });
            setSyncLoading(false);
            loadDataLake();
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Lỗi đồng bộ: ' + (err.response?.data?.error || err.message) });
            setSyncLoading(false);
        });
    };

    const handleDeletePartition = (stationCode, year) => {
        if (!window.confirm(`Bạn có chắc muốn xóa dữ liệu của trạm ${stationCode} năm ${year}?`)) return;
        deleteDataLakePartition(stationCode, year).then(res => {
            setFeedback({ type: 'success', message: res.message });
            loadDataLake();
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Xóa thất bại: ' + (err.response?.data?.error || err.message) });
        });
    };

    // ==========================================
    // Analytics & SQL Handlers
    // ==========================================
    const handleRunWindRose = () => {
        setAnalyticsLoading(true);
        setWindRoseResult(null);
        queryDataLake({
            template: 'wind_rose',
            station_code: analyticsStation || undefined,
            start_date: analyticsStartDate || undefined,
            end_date: analyticsEndDate || undefined
        }).then(res => {
            setWindRoseResult(res);
            setAnalyticsLoading(false);
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Lỗi phân tích hoa gió: ' + (err.response?.data?.error || err.message) });
            setAnalyticsLoading(false);
        });
    };

    const handleRunCustomSql = () => {
        if (!customSql.trim()) return;
        setAnalyticsLoading(true);
        setSqlResult(null);
        queryDataLake({ sql: customSql }).then(res => {
            setSqlResult(res);
            setAnalyticsLoading(false);
        }).catch(err => {
            setFeedback({ type: 'danger', message: 'Lỗi truy vấn: ' + (err.response?.data?.error || err.message) });
            setAnalyticsLoading(false);
        });
    };

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '40px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        Quản lý trạm đo và dữ liệu quan trắc
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
                        Quản lý danh sách trạm quan trắc, nạp số liệu lớn vào kho dữ liệu nén, theo dõi dung lượng và phân tích tức thì.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {activeTab === 'stations' && (
                        <>
                            <input
                                ref={stationFileInputRef}
                                type="file"
                                accept=".csv"
                                style={{ display: 'none' }}
                                onChange={handleStationFileSelected}
                            />
                            <button
                                onClick={handleDownloadStationTemplate}
                                className="btn btn-default"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', fontWeight: 600 }}
                                title="Tải tệp CSV mẫu để điền danh sách trạm"
                            >
                                <i className="fa fa-file-text-o"></i>Tải tệp mẫu
                            </button>
                            <button
                                onClick={() => stationFileInputRef.current?.click()}
                                disabled={stationImportChecking}
                                className="btn btn-default"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', fontWeight: 600 }}
                                title="Thêm mới hoặc cập nhật trạm từ tệp CSV"
                            >
                                <i className={`fa ${stationImportChecking ? 'fa-spinner fa-spin' : 'fa-upload'}`}></i>Nhập từ tệp
                            </button>
                            <button
                                onClick={handleExportStations}
                                className="btn btn-success"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', fontWeight: 600 }}
                                title="Xuất danh sách trạm đang hiển thị ra tệp CSV"
                            >
                                <i className="fa fa-download"></i>Xuất tệp
                            </button>
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
                        </>
                    )}
                    {activeTab === 'datalake' && (
                        <>
                            <button
                                onClick={handleSyncFromDb}
                                disabled={syncLoading}
                                className="btn btn-default"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', fontWeight: 600 }}
                                title="Chuyển toàn bộ số liệu hiện có từ cơ sở dữ liệu sang kho dữ liệu"
                            >
                                <i className={`fa fa-refresh ${syncLoading ? 'fa-spin' : ''}`}></i>
                                {syncLoading ? 'Đang đồng bộ...' : 'Đồng bộ từ cơ sở dữ liệu'}
                            </button>
                            <button
                                onClick={() => setShowExportModal(true)}
                                className="btn btn-success"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', fontWeight: 600 }}
                            >
                                <i className="fa fa-download"></i>Xuất dữ liệu tùy biến
                            </button>
                        </>
                    )}
                </div>
            </div>

            {feedback && (
                <div className={`alert alert-${feedback.type === 'danger' ? 'danger' : 'success'}`} style={{ borderRadius: '8px', marginBottom: '16px' }}>
                    <i className={`fa ${feedback.type === 'danger' ? 'fa-exclamation-triangle' : 'fa-check-circle'}`} style={{ marginRight: '8px' }}></i>
                    {feedback.message}
                    <button type="button" className="close" onClick={() => setFeedback(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
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
                    <i className="fa fa-map-marker" style={{ marginRight: '8px' }}></i>Danh sách trạm đo ({stations.length})
                </button>
                <button
                    onClick={() => setActiveTab('datalake')}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: activeTab === 'datalake' ? 600 : 500,
                        color: activeTab === 'datalake' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'datalake' ? '2px solid #0284c7' : '2px solid transparent',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-database" style={{ marginRight: '8px' }}></i>Kho dữ liệu
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
                    <i className="fa fa-upload" style={{ marginRight: '8px' }}></i>Nạp số liệu
                </button>
                <button
                    onClick={() => setActiveTab('analytics')}
                    style={{
                        padding: '10px 18px',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: activeTab === 'analytics' ? 600 : 500,
                        color: activeTab === 'analytics' ? '#0284c7' : '#64748b',
                        borderBottom: activeTab === 'analytics' ? '2px solid #0284c7' : '2px solid transparent',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fa fa-area-chart" style={{ marginRight: '8px' }}></i>Phân tích và truy vấn
                </button>
            </div>

            {/* TAB 1: Stations CRUD */}
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
                                    <th style={{ padding: '12px 14px' }}>Tọa độ</th>
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
                                            <td style={{ padding: '12px 14px' }}>{STATION_TYPE_LABELS[s.station_type] || 'Bề mặt'}</td>
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

            {/* TAB 2: Kho Dữ Liệu Parquet (Data Lake) */}
            {activeTab === 'datalake' && (
                <div>
                    {/* KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Dung lượng kho dữ liệu</div>
                            <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}>
                                {lakeOverview ? lakeOverview.total_size_formatted : '-'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px', fontWeight: 600 }}>
                                <i className="fa fa-arrow-down" style={{ marginRight: '4px' }}></i>
                                Tiết kiệm khoảng {lakeOverview ? lakeOverview.saved_storage_estimate : '0 B'} so với cơ sở dữ liệu thông thường
                            </div>
                        </div>

                        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Tổng số bản ghi tích lũy</div>
                            <div style={{ fontSize: '24px', fontWeight: 700, color: '#0284c7', marginTop: '6px' }}>
                                {lakeOverview ? lakeOverview.total_records.toLocaleString() : '-'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Trên {lakeOverview ? lakeOverview.total_files : 0} tệp dữ liệu
                            </div>
                        </div>

                        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Số trạm có dữ liệu</div>
                            <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981', marginTop: '6px' }}>
                                {lakeOverview ? lakeOverview.total_stations : '-'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Trong tổng số {stations.length} trạm đo
                            </div>
                        </div>

                        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Khoảng thời gian đo</div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginTop: '8px' }}>
                                {lakeOverview?.min_date ? new Date(lakeOverview.min_date).toLocaleDateString('vi-VN') : 'Chưa có'} &rarr; {lakeOverview?.max_date ? new Date(lakeOverview.max_date).toLocaleDateString('vi-VN') : 'Chưa có'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
Theo chu kỳ quan trắc
                            </div>
                        </div>
                    </div>

                    {/* Filter & Catalog Table */}
                    <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                Danh mục dữ liệu theo trạm và năm
                            </h3>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <select
                                    value={lakeStationFilter}
                                    onChange={e => setLakeStationFilter(e.target.value)}
                                    className="form-control"
                                    style={{ width: '180px', borderRadius: '6px', fontSize: '13px' }}
                                >
                                    <option value="">-- Tất cả trạm --</option>
                                    {stations.map(s => (
                                        <option key={s.id} value={s.station_code}>{s.name}</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    placeholder="Năm, ví dụ: 2025"
                                    value={lakeYearFilter}
                                    onChange={e => setLakeYearFilter(e.target.value)}
                                    className="form-control"
                                    style={{ width: '130px', borderRadius: '6px', fontSize: '13px' }}
                                />
                                <button onClick={loadDataLake} className="btn btn-default" style={{ borderRadius: '6px' }} title="Tải lại">
                                    <i className={`fa fa-refresh ${lakeLoading ? 'fa-spin' : ''}`}></i>
                                </button>
                            </div>
                        </div>

                        <div className="table-responsive">
                            <table className="table table-hover" style={{ margin: 0 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                        <th style={{ padding: '12px 14px' }}>Mã trạm</th>
                                        <th style={{ padding: '12px 14px' }}>Tên trạm</th>
                                        <th style={{ padding: '12px 14px' }}>Năm đo</th>
                                        <th style={{ padding: '12px 14px' }}>Kích thước tệp</th>
                                        <th style={{ padding: '12px 14px' }}>Số bản ghi</th>
                                        <th style={{ padding: '12px 14px', width: '160px' }}>Độ đầy đủ số liệu</th>
                                        <th style={{ padding: '12px 14px' }}>Cập nhật cuối</th>
                                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody style={{ fontSize: '13px' }}>
                                    {partitions.length === 0 ? (
                                        <tr>
                                            <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                                {lakeLoading ? 'Đang tải danh mục kho...' : 'Chưa có dữ liệu trong kho. Hãy nạp tệp ở mục "Nạp số liệu" hoặc bấm "Đồng bộ từ cơ sở dữ liệu".'}
                                            </td>
                                        </tr>
                                    ) : (
                                        partitions.map(p => (
                                            <tr key={`${p.station_code}_${p.year}`}>
                                                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0284c7' }}>{p.station_code}</td>
                                                <td style={{ padding: '12px 14px', fontWeight: 500 }}>{p.station_name}</td>
                                                <td style={{ padding: '12px 14px', fontWeight: 700 }}>{p.year}</td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <span className="label label-info" style={{ backgroundColor: '#0284c7' }}>{p.file_size_formatted}</span>
                                                </td>
                                                <td style={{ padding: '12px 14px', fontWeight: 600 }}>{p.record_count.toLocaleString()}</td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                                            <div
                                                                style={{
                                                                    width: `${Math.min(100, p.completeness_pct)}%`,
                                                                    height: '100%',
                                                                    backgroundColor: p.completeness_pct >= 90 ? '#10b981' : p.completeness_pct >= 60 ? '#f59e0b' : '#ef4444'
                                                                }}
                                                            ></div>
                                                        </div>
                                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>{p.completeness_pct}%</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '12px' }}>
                                                    {new Date(p.last_modified).toLocaleString('vi-VN')}
                                                </td>
                                                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                    <a
                                                        href={getDownloadLakeDataUrl(p.station_code, p.year, 'parquet')}
                                                        className="btn btn-xs btn-default"
                                                        style={{ marginRight: '6px' }}
                                                        title="Tải tệp Parquet gốc"
                                                    >
                                                        <i className="fa fa-file-code-o"></i> Parquet
                                                    </a>
                                                    <a
                                                        href={getDownloadLakeDataUrl(p.station_code, p.year, 'csv')}
                                                        className="btn btn-xs btn-default"
                                                        style={{ marginRight: '6px' }}
                                                        title="Xuất sang file CSV"
                                                    >
                                                        <i className="fa fa-file-excel-o"></i> CSV
                                                    </a>
                                                    <button
                                                        onClick={() => handleDeletePartition(p.station_code, p.year)}
                                                        className="btn btn-xs btn-danger"
                                                        title="Xóa dữ liệu này"
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
                </div>
            )}

            {/* TAB 3: Ingestion (Nạp số liệu) */}
            {activeTab === 'import' && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginTop: 0, marginBottom: '6px' }}>
                        Nạp dữ liệu quan trắc hàng loạt
                    </h3>
                    <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
                        Hỗ trợ tệp Excel hoặc CSV. Dữ liệu sẽ được tự động làm sạch, kiểm tra trùng lặp và lưu trữ.
                    </p>

                    <div style={{ marginBottom: '20px', padding: '16px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0284c7' }}>
                            <i className="fa fa-database" style={{ marginRight: '8px' }}></i>
                            Dữ liệu được lưu vào kho dữ liệu nén
                        </div>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: '8px 0 0 0' }}>
                            Dữ liệu được nén theo cột, chia tệp theo trạm và năm, ghi nhanh mà không làm chậm hệ thống.
                        </p>
                    </div>

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
                                    Tệp cần có tối thiểu hai cột <code>station_code</code> và <code>obs_time</code>, thời gian theo định dạng YYYY-MM-DD HH:MM:SS.
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
                            type="button"
                            onClick={handleDownloadTemplate}
                            className="btn btn-default"
                            style={{ borderRadius: '6px', fontWeight: 600 }}
                        >
                            <i className="fa fa-download" style={{ marginRight: '6px' }}></i>
                            Tải tệp mẫu
                        </button>
                        <button
                            onClick={handleDryRun}
                            disabled={!importFile || dryRunLoading || importLoading}
                            className="btn btn-primary"
                            style={{ borderRadius: '6px', fontWeight: 600 }}
                        >
                            <i className={`fa fa-check ${dryRunLoading ? 'fa-spin' : ''}`} style={{ marginRight: '6px' }}></i>
                            {dryRunLoading ? 'Đang kiểm tra...' : 'Kiểm tra cấu trúc'}
                        </button>
                        <button
                            onClick={handleRealImport}
                            disabled={!importFile || importLoading || dryRunLoading}
                            className="btn btn-success"
                            style={{ borderRadius: '6px', fontWeight: 600 }}
                        >
                            <i className={`fa fa-cloud-upload ${importLoading ? 'fa-spin' : ''}`} style={{ marginRight: '6px' }}></i>
                            {importLoading ? 'Đang nạp số liệu...' : 'Nạp dữ liệu'}
                        </button>
                    </div>

                    {/* Dry-run Preview */}
                    {dryRunData && (
                        <div style={{ marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div style={{ fontWeight: 700, color: '#10b981', fontSize: '14px' }}>
                                    <i className="fa fa-check-circle" style={{ marginRight: '6px' }}></i>
                                    Tệp hợp lệ! Tìm thấy {dryRunData.total_rows} dòng dữ liệu
                                    {dryRunData.stations_affected && ` của các trạm: ${dryRunData.stations_affected.join(', ')}`}
                                    {dryRunData.years_affected && ` thuộc năm: ${dryRunData.years_affected.join(', ')}`}
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>
                                    Xem trước 10 dòng đầu tiên:
                                </div>
                            </div>
                            <div className="table-responsive">
                                <table className="table table-bordered table-condensed" style={{ fontSize: '12px', background: '#f8fafc' }}>
                                    <thead>
                                        <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                                            {dryRunData.preview?.length > 0 && Object.keys(dryRunData.preview[0]).map(col => (
                                                <th key={col}>{col}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dryRunData.preview?.map((row, idx) => (
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

            {/* TAB 4: Analytics & DuckDB SQL Playground */}
            {activeTab === 'analytics' && (
                <div>
                    <div style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '18px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: analyticsMode === 'wind_rose' ? 700 : 500, color: analyticsMode === 'wind_rose' ? '#0284c7' : '#64748b' }}>
                                <input
                                    type="radio"
                                    name="analytics_mode"
                                    checked={analyticsMode === 'wind_rose'}
                                    onChange={() => setAnalyticsMode('wind_rose')}
                                />
                                <i className="fa fa-compass"></i> Hoa gió
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: analyticsMode === 'sql' ? 700 : 500, color: analyticsMode === 'sql' ? '#0284c7' : '#64748b' }}>
                                <input
                                    type="radio"
                                    name="analytics_mode"
                                    checked={analyticsMode === 'sql'}
                                    onChange={() => setAnalyticsMode('sql')}
                                />
                                <i className="fa fa-code"></i> Truy vấn tùy biến
                            </label>
                        </div>

                        {analyticsMode === 'wind_rose' && (
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Trạm đo gió</label>
                                        <select
                                            value={analyticsStation}
                                            onChange={e => setAnalyticsStation(e.target.value)}
                                            className="form-control"
                                            style={{ borderRadius: '6px', fontSize: '13px' }}
                                        >
                                            <option value="">-- Tất cả trạm trong kho --</option>
                                            {stations.map(s => (
                                                <option key={s.id} value={s.station_code}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Từ ngày</label>
                                        <input
                                            type="date"
                                            className="form-control"
                                            value={analyticsStartDate}
                                            onChange={e => setAnalyticsStartDate(e.target.value)}
                                            style={{ borderRadius: '6px', fontSize: '13px' }}
                                        />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Đến ngày</label>
                                        <input
                                            type="date"
                                            className="form-control"
                                            value={analyticsEndDate}
                                            onChange={e => setAnalyticsEndDate(e.target.value)}
                                            style={{ borderRadius: '6px', fontSize: '13px' }}
                                        />
                                    </div>
                                    <div>
                                        <button
                                            onClick={handleRunWindRose}
                                            disabled={analyticsLoading}
                                            className="btn btn-primary"
                                            style={{ width: '100%', borderRadius: '6px', fontWeight: 600 }}
                                        >
                                            <i className={`fa fa-bolt ${analyticsLoading ? 'fa-spin' : ''}`} style={{ marginRight: '6px' }}></i>
                                            {analyticsLoading ? 'Đang tính toán...' : 'Phân tích hoa gió'}
                                        </button>
                                    </div>
                                </div>

                                {windRoseResult && (
                                    <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                                            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>Tổng số mốc đo</div>
                                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{windRoseResult.total_records.toLocaleString()}</div>
                                            </div>
                                            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>Tốc độ gió trung bình</div>
                                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0284c7' }}>{windRoseResult.avg_wind_speed} m/s</div>
                                            </div>
                                            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>Tỷ lệ lặng gió</div>
                                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>{windRoseResult.calm_percent}%</div>
                                            </div>
                                            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>Phân vị 50, 90, 99</div>
                                                <div style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>
                                                    {windRoseResult.distribution?.percentiles?.p50} / {windRoseResult.distribution?.percentiles?.p90} / {windRoseResult.distribution?.percentiles?.p99} m/s
                                                </div>
                                            </div>
                                        </div>

                                        <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>Tần suất hoa gió theo 16 hướng và 6 cấp tốc độ</h4>
                                        <div className="table-responsive">
                                            <table className="table table-bordered table-condensed" style={{ fontSize: '12px', textAlign: 'center' }}>
                                                <thead>
                                                    <tr style={{ background: '#f1f5f9' }}>
                                                        <th style={{ textAlign: 'left' }}>Cấp tốc độ</th>
                                                        {windRoseResult.directions.map(d => <th key={d} style={{ textAlign: 'center' }}>{d}</th>)}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {windRoseResult.speed_bins.map((bin, bIdx) => (
                                                        <tr key={bIdx}>
                                                            <td style={{ textAlign: 'left', fontWeight: 600 }}>{bin.label}</td>
                                                            {bin.values.map((v, dIdx) => (
                                                                <td key={dIdx} style={{ background: v > 5 ? '#e0f2fe' : 'transparent', fontWeight: v > 5 ? 700 : 400 }}>
                                                                    {v > 0 ? `${v}%` : '-'}
                                                                </td>
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

                        {analyticsMode === 'sql' && (
                            <div>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', alignSelf: 'center' }}>Mẫu truy vấn nhanh:</span>
                                    <button
                                        onClick={() => setCustomSql('SELECT station_code, count(*) as total_obs, round(avg(wind_speed), 2) as avg_speed, round(max(wind_speed), 2) as max_speed FROM observations GROUP BY 1 ORDER BY 3 DESC')}
                                        className="btn btn-default btn-xs"
                                        style={{ borderRadius: '4px' }}
                                    >
                                        Thống kê theo trạm
                                    </button>
                                    <button
                                        onClick={() => setCustomSql("SELECT station_code, obs_time, wind_speed, wind_dir, temp_2m FROM observations WHERE wind_speed IS NOT NULL ORDER BY wind_speed DESC LIMIT 10")}
                                        className="btn btn-default btn-xs"
                                        style={{ borderRadius: '4px' }}
                                    >
                                        Mười mốc gió mạnh nhất
                                    </button>
                                    <button
                                        onClick={() => setCustomSql("SELECT hour(obs_time) as h, round(avg(wind_speed), 2) as avg_speed, round(avg(temp_2m), 2) as avg_temp FROM observations GROUP BY 1 ORDER BY 1")}
                                        className="btn btn-default btn-xs"
                                        style={{ borderRadius: '4px' }}
                                    >
                                        Biến thiên theo giờ trong ngày
                                    </button>
                                    <button
                                        onClick={() => setCustomSql("SELECT year(obs_time) as yr, month(obs_time) as mo, round(avg(wind_speed), 2) as avg_spd, round(avg(rain_24h), 2) as avg_rain FROM observations GROUP BY 1, 2 ORDER BY 1, 2")}
                                        className="btn btn-default btn-xs"
                                        style={{ borderRadius: '4px' }}
                                    >
                                        Diễn biến theo tháng
                                    </button>
                                </div>

                                <textarea
                                    className="form-control"
                                    rows="4"
                                    value={customSql}
                                    onChange={e => setCustomSql(e.target.value)}
                                    style={{ fontFamily: 'monospace', fontSize: '13px', borderRadius: '6px', background: '#0f172a', color: '#f8fafc', marginBottom: '12px' }}
                                    placeholder="SELECT * FROM observations WHERE ..."
                                />

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                                        Lưu ý: tên bảng trong truy vấn là <code>observations</code>, tự động liên kết tới toàn bộ kho dữ liệu. Chỉ hỗ trợ câu lệnh SELECT.
                                    </span>
                                    <button
                                        onClick={handleRunCustomSql}
                                        disabled={analyticsLoading}
                                        className="btn btn-success"
                                        style={{ borderRadius: '6px', fontWeight: 600 }}
                                    >
                                        <i className={`fa fa-play ${analyticsLoading ? 'fa-spin' : ''}`} style={{ marginRight: '6px' }}></i>
                                        {analyticsLoading ? 'Đang thực thi...' : 'Chạy truy vấn'}
                                    </button>
                                </div>

                                {sqlResult && (
                                    <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#10b981' }}>
                                                <i className="fa fa-check" style={{ marginRight: '6px' }}></i>
                                                Thành công! Trả về {sqlResult.total_rows} dòng.
                                            </span>
                                            {sqlResult.total_rows > 500 && (
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>
                                                    Hiển thị 500 dòng đầu
                                                </span>
                                            )}
                                        </div>
                                        <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                            <table className="table table-bordered table-striped table-condensed" style={{ fontSize: '12px' }}>
                                                <thead>
                                                    <tr style={{ background: '#f1f5f9' }}>
                                                        {sqlResult.columns.map(c => <th key={c}>{c}</th>)}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sqlResult.data.map((row, rIdx) => (
                                                        <tr key={rIdx}>
                                                            {sqlResult.columns.map(c => (
                                                                <td key={c}>{row[c] !== null && row[c] !== undefined ? String(row[c]) : '-'}</td>
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
                    </div>
                </div>
            )}

            {/* Modal Custom Export */}
            {showExportModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '480px', maxWidth: '90%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '18px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            Xuất dữ liệu từ kho
                        </h3>
                        <div>
                            <div className="form-group">
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Trạm quan trắc</label>
                                <select
                                    value={exportForm.station_code}
                                    onChange={e => setExportForm({ ...exportForm, station_code: e.target.value })}
                                    className="form-control"
                                >
                                    <option value="">-- Tất cả các trạm --</option>
                                    {stations.map(s => (
                                        <option key={s.id} value={s.station_code}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Từ ngày</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={exportForm.start_date}
                                        onChange={e => setExportForm({ ...exportForm, start_date: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Đến ngày</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={exportForm.end_date}
                                        onChange={e => setExportForm({ ...exportForm, end_date: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Định dạng tệp tải về</label>
                                <select
                                    value={exportForm.format}
                                    onChange={e => setExportForm({ ...exportForm, format: e.target.value })}
                                    className="form-control"
                                >
                                    <option value="csv">Bảng tính CSV</option>
                                    <option value="parquet">Parquet gốc</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setShowExportModal(false)} className="btn btn-default">Đóng</button>
                                <a
                                    href={getDownloadLakeDataUrl(exportForm.station_code, null, exportForm.format, {
                                        start_date: exportForm.start_date,
                                        end_date: exportForm.end_date
                                    })}
                                    onClick={() => setShowExportModal(false)}
                                    className="btn btn-success"
                                >
                                    <i className="fa fa-download" style={{ marginRight: '6px' }}></i> Bắt đầu tải về
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal xác nhận nhập trạm từ tệp */}
            {stationImport && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '640px', maxWidth: '90%', maxHeight: '85vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '6px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            Nhập trạm đo từ tệp
                        </h3>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>{stationImport.fileName}</div>

                        {stationImport.fatal ? (
                            <div className="alert alert-danger" style={{ borderRadius: '8px' }}>{stationImport.fatal}</div>
                        ) : (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                                    <div style={{ padding: '12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>Thêm mới</div>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>
                                            {stationImport.items.filter(i => !i.existingId).length}
                                        </div>
                                    </div>
                                    <div style={{ padding: '12px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>Cập nhật trạm đã có</div>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#0284c7' }}>
                                            {stationImport.items.filter(i => i.existingId).length}
                                        </div>
                                    </div>
                                    <div style={{ padding: '12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>Dòng lỗi, sẽ bỏ qua</div>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>
                                            {stationImport.errors.length}
                                        </div>
                                    </div>
                                </div>

                                {stationImport.errors.length > 0 && (
                                    <div style={{ marginBottom: '16px', padding: '12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', maxHeight: '160px', overflowY: 'auto', fontSize: '12px', color: '#991b1b' }}>
                                        {stationImport.errors.map((er, i) => (
                                            <div key={i}>Dòng {er.line}: {er.message}</div>
                                        ))}
                                    </div>
                                )}

                                {stationImport.items.length > 0 && (
                                    <div className="table-responsive" style={{ maxHeight: '220px', overflowY: 'auto', marginBottom: '16px' }}>
                                        <table className="table table-bordered table-condensed" style={{ fontSize: '12px', margin: 0 }}>
                                            <thead>
                                                <tr style={{ background: '#f1f5f9' }}>
                                                    <th>Dòng</th>
                                                    <th>Mã trạm</th>
                                                    <th>Tên trạm</th>
                                                    <th>Loại trạm</th>
                                                    <th>Xử lý</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {stationImport.items.map(item => (
                                                    <tr key={item.line}>
                                                        <td>{item.line}</td>
                                                        <td style={{ fontWeight: 600 }}>{item.payload.station_code}</td>
                                                        <td>{item.payload.name}</td>
                                                        <td>{STATION_TYPE_LABELS[item.payload.station_type]}</td>
                                                        <td>{item.existingId ? 'Cập nhật' : 'Thêm mới'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setStationImport(null)}
                                disabled={stationImportLoading}
                                className="btn btn-default"
                            >
                                Đóng
                            </button>
                            {!stationImport.fatal && (
                                <button
                                    type="button"
                                    onClick={handleConfirmStationImport}
                                    disabled={stationImportLoading || stationImport.items.length === 0}
                                    className="btn btn-primary"
                                >
                                    <i className={`fa ${stationImportLoading ? 'fa-spinner fa-spin' : 'fa-check'}`} style={{ marginRight: '6px' }}></i>
                                    {stationImportLoading ? 'Đang nhập...' : `Nhập ${stationImport.items.length} trạm`}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Station (Add/Edit) */}
            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#ffffff', borderRadius: '12px', width: '560px', maxWidth: '90%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '18px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            {stationForm.id ? 'Chỉnh sửa trạm quan trắc' : 'Thêm trạm quan trắc'}
                        </h3>
                        <form onSubmit={handleSaveStation}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Mã trạm *</label>
                                    <input
                                        disabled={stationForm.id != null}
                                        type="text"
                                        className="form-control"
                                        value={stationForm.station_code}
                                        onChange={e => setStationForm({ ...stationForm, station_code: e.target.value })}
                                        required
                                        placeholder="Ví dụ: PHU_QUY"
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
                                        placeholder="Ví dụ: Trạm khí tượng Phú Quý"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Loại trạm</label>
                                    <select className="form-control" value={stationForm.station_type} onChange={e => setStationForm({ ...stationForm, station_type: e.target.value })}>
                                        <option value="SURFACE">Bề mặt</option>
                                        <option value="MET_MAST">Cột khí tượng</option>
                                        <option value="BUOY">Phao biển</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Độ cao địa hình (m)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="form-control"
                                        value={stationForm.elevation}
                                        onChange={e => setStationForm({ ...stationForm, elevation: e.target.value })}
                                        placeholder="Ví dụ: 15.5"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Kinh độ *</label>
                                    <input
                                        type="number"
                                        step="0.000001"
                                        className="form-control"
                                        value={stationForm.lon}
                                        onChange={e => setStationForm({ ...stationForm, lon: e.target.value })}
                                        required
                                        placeholder="Ví dụ: 108.932"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Vĩ độ *</label>
                                    <input
                                        type="number"
                                        step="0.000001"
                                        className="form-control"
                                        value={stationForm.lat}
                                        onChange={e => setStationForm({ ...stationForm, lat: e.target.value })}
                                        required
                                        placeholder="Ví dụ: 10.518"
                                    />
                                </div>
                            </div>
                            <div className="checkbox" style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>
                                    <input
                                        type="checkbox"
                                        checked={stationForm.is_active}
                                        onChange={e => setStationForm({ ...stationForm, is_active: e.target.checked })}
                                    /> Đang vận hành
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
