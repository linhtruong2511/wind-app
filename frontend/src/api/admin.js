import axios from 'axios';

const BASE_URL = '/wind/api/v1';

export const getCsrfToken = () => {
    const name = 'csrftoken';
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                return decodeURIComponent(cookie.substring(name.length + 1));
            }
        }
    }
    return '';
};

const authConfig = (extraHeaders = {}) => ({
    headers: {
        'X-CSRFToken': getCsrfToken(),
        ...extraHeaders
    }
});

// Dashboard
export const getDashboardStats = () => {
    return axios.get(`${BASE_URL}/datasets/dashboard-stats/`, authConfig())
        .then(res => res.data);
};

// CDS Credentials
export const getCDSCredentials = () => {
    return axios.get(`${BASE_URL}/cds-credentials/`, authConfig())
        .then(res => res.data.results || res.data || []);
};

export const createCDSCredential = (data) => {
    return axios.post(`${BASE_URL}/cds-credentials/`, data, authConfig())
        .then(res => res.data);
};

export const updateCDSCredential = (id, data) => {
    return axios.patch(`${BASE_URL}/cds-credentials/${id}/`, data, authConfig())
        .then(res => res.data);
};

export const deleteCDSCredential = (id) => {
    return axios.delete(`${BASE_URL}/cds-credentials/${id}/`, authConfig());
};

export const testCDSConnection = (id) => {
    return axios.post(`${BASE_URL}/cds-credentials/${id}/test-connection/`, {}, authConfig())
        .then(res => res.data);
};

// CDS Jobs
export const getCDSJobs = () => {
    return axios.get(`${BASE_URL}/cds-jobs/`, authConfig())
        .then(res => res.data.results || res.data || []);
};

export const createCDSJob = (data) => {
    return axios.post(`${BASE_URL}/cds-jobs/`, data, authConfig())
        .then(res => res.data);
};

export const updateCDSJob = (id, data) => {
    return axios.patch(`${BASE_URL}/cds-jobs/${id}/`, data, authConfig())
        .then(res => res.data);
};

export const deleteCDSJob = (id) => {
    return axios.delete(`${BASE_URL}/cds-jobs/${id}/`, authConfig());
};

export const runCDSJob = (id) => {
    return axios.post(`${BASE_URL}/cds-jobs/${id}/run/`, {}, authConfig())
        .then(res => res.data);
};

export const getCDSJobsCatalog = () => {
    return axios.get(`${BASE_URL}/cds-jobs/catalog/`, authConfig())
        .then(res => res.data);
};

export const getCDSJobRuns = (params = {}) => {
    return axios.get(`${BASE_URL}/cds-runs/`, { ...authConfig(), params })
        .then(res => res.data.results || res.data || []);
};

// Rasters & Granules
export const uploadRasterFile = (formData, onUploadProgress) => {
    return axios.post(`${BASE_URL}/raster-granules/upload/`, formData, {
        ...authConfig({ 'Content-Type': 'multipart/form-data' }),
        onUploadProgress
    }).then(res => res.data);
};

export const getRasterGranules = (params = {}) => {
    return axios.get(`${BASE_URL}/raster-granules/`, { ...authConfig(), params })
        .then(res => res.data);
};

// Stations & Observations
export const getAdminStations = (params = {}) => {
    return axios.get(`${BASE_URL}/stations/`, { ...authConfig(), params: { all: 'true', ...params } })
        .then(res => res.data.results || res.data || []);
};

// Danh sách trạm có phân trang: trả về { count, results, next, previous }
export const getAdminStationsPage = (params = {}) => {
    return axios.get(`${BASE_URL}/stations/`, { ...authConfig(), params: { all: 'true', ...params } })
        .then(res => {
            const data = res.data;
            return Array.isArray(data) ? { count: data.length, results: data } : data;
        });
};

// Lưu tệp nhận từ API (dạng blob) về máy; lấy tên tệp từ tiêu đề phản hồi nếu có
const saveBlobResponse = (res, fallbackName) => {
    const disposition = res.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = match ? match[1] : fallbackName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// Khi lỗi, phản hồi dạng blob cần được đọc lại thành JSON để lấy thông báo
const readBlobError = (err) => {
    const blob = err.response?.data;
    if (blob instanceof Blob) {
        return blob.text().then(text => {
            try { err.response.data = JSON.parse(text); } catch (e) { /* giữ nguyên */ }
            throw err;
        });
    }
    throw err;
};

export const downloadStationTemplate = () => {
    return axios.get(`${BASE_URL}/stations/download-template/`, { ...authConfig(), responseType: 'blob' })
        .then(res => saveBlobResponse(res, 'mau_danh_sach_tram_do.csv'))
        .catch(readBlobError);
};

export const exportStations = (params = {}) => {
    return axios.get(`${BASE_URL}/stations/export/`, { ...authConfig(), params: { all: 'true', ...params }, responseType: 'blob' })
        .then(res => saveBlobResponse(res, 'danh_sach_tram_do.csv'))
        .catch(readBlobError);
};

// dryRun = true: chỉ kiểm tra tệp, chưa ghi dữ liệu
export const importStations = (file, dryRun = false) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('dry_run', dryRun ? 'true' : 'false');
    return axios.post(`${BASE_URL}/stations/import/`, formData, authConfig({ 'Content-Type': 'multipart/form-data' }))
        .then(res => res.data);
};

export const createStation = (data) => {
    return axios.post(`${BASE_URL}/stations/`, data, authConfig())
        .then(res => res.data);
};

export const updateStation = (id, data) => {
    return axios.patch(`${BASE_URL}/stations/${id}/`, data, authConfig())
        .then(res => res.data);
};

export const deleteStation = (id) => {
    return axios.delete(`${BASE_URL}/stations/${id}/`, authConfig());
};

// Wind Farms & Turbines
export const getAdminFarms = (params = {}) => {
    return axios.get(`${BASE_URL}/farms/`, { ...authConfig(), params: { pageSize: 1000, ...params } })
        .then(res => res.data.results || res.data || []);
};

export const createFarm = (data) => {
    return axios.post(`${BASE_URL}/farms/`, data, authConfig())
        .then(res => res.data);
};

export const updateFarm = (id, data) => {
    return axios.patch(`${BASE_URL}/farms/${id}/`, data, authConfig())
        .then(res => res.data);
};

export const deleteFarm = (id) => {
    return axios.delete(`${BASE_URL}/farms/${id}/`, authConfig());
};

export const getAdminTurbines = (params = {}) => {
    return axios.get(`${BASE_URL}/turbines/`, { ...authConfig(), params })
        .then(res => (Array.isArray(res.data) ? { count: res.data.length, results: res.data } : res.data));
};

export const createTurbine = (data) => {
    return axios.post(`${BASE_URL}/turbines/`, data, authConfig())
        .then(res => res.data);
};

export const deleteTurbine = (id) => {
    return axios.delete(`${BASE_URL}/turbines/${id}/`, authConfig());
};

// Datasets, Variables & Policies
export const getAdminDatasets = (params = {}) => {
    return axios.get(`${BASE_URL}/datasets/`, { ...authConfig(), params: { all: 'true', ...params } })
        .then(res => res.data.results || res.data || []);
};

export const createDataset = (data) => {
    return axios.post(`${BASE_URL}/datasets/`, data, authConfig())
        .then(res => res.data);
};

export const updateDataset = (id, data) => {
    return axios.patch(`${BASE_URL}/datasets/${id}/`, data, authConfig())
        .then(res => res.data);
};

export const deleteDataset = (id) => {
    return axios.delete(`${BASE_URL}/datasets/${id}/`, authConfig());
};

export const getAdminDatasetVariables = (params = {}) => {
    return axios.get(`${BASE_URL}/dataset-variables/`, { ...authConfig(), params })
        .then(res => res.data.results || res.data || []);
};

export const updateDatasetVariable = (id, data) => {
    return axios.patch(`${BASE_URL}/dataset-variables/${id}/`, data, authConfig())
        .then(res => res.data);
};

export const getUserGroups = () => {
    return axios.get(`${BASE_URL}/user-groups/`, authConfig())
        .then(res => res.data.results || res.data || []);
};

// ==========================================
// DuckDB & Parquet Data Lake APIs
// ==========================================
export const getDataLakeOverview = () => {
    return axios.get(`${BASE_URL}/datalake/overview/`, authConfig())
        .then(res => res.data);
};

export const getDataLakePartitions = (params = {}) => {
    return axios.get(`${BASE_URL}/datalake/partitions/`, { ...authConfig(), params })
        .then(res => res.data);
};

export const importDataLakeFile = (file, dryRun = false) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('dry_run', dryRun ? 'true' : 'false');
    return axios.post(`${BASE_URL}/datalake/import-file/`, formData, authConfig({ 'Content-Type': 'multipart/form-data' }))
        .then(res => res.data);
};

export const deleteDataLakePartition = (stationCode, year) => {
    return axios.post(`${BASE_URL}/datalake/delete-partition/`, { station_code: stationCode, year }, authConfig())
        .then(res => res.data);
};

export const queryDataLake = (payload) => {
    return axios.post(`${BASE_URL}/datalake/query/`, payload, authConfig())
        .then(res => res.data);
};

export const syncDataLakeFromDb = () => {
    return axios.post(`${BASE_URL}/datalake/sync-from-db/`, {}, authConfig())
        .then(res => res.data);
};

export const getDownloadLakeDataUrl = (stationCode, year, format = 'parquet', extraParams = {}) => {
    // Không dùng tên "format" vì máy chủ dành riêng tham số này để chọn bộ render, sẽ trả lỗi 404
    const query = new URLSearchParams({ file_format: format });
    Object.entries(extraParams).forEach(([key, value]) => {
        if (value) query.append(key, value);
    });
    if (stationCode) query.append('station_code', stationCode);
    if (year) query.append('year', year);
    return `${BASE_URL}/datalake/download/?${query.toString()}`;
};
