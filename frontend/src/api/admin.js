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
    return axios.get(`${BASE_URL}/stations/`, { ...authConfig(), params })
        .then(res => res.data.results || res.data || []);
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

export const importObservationsFile = (file, dryRun = false) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('dry_run', dryRun ? 'true' : 'false');
    return axios.post(`${BASE_URL}/observations/import-file/`, formData, authConfig({ 'Content-Type': 'multipart/form-data' }))
        .then(res => res.data);
};

// Wind Farms & Turbines
export const getAdminFarms = (params = {}) => {
    return axios.get(`${BASE_URL}/farms/`, { ...authConfig(), params })
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
        .then(res => res.data.results || res.data || []);
};

export const createTurbine = (data) => {
    return axios.post(`${BASE_URL}/turbines/`, data, authConfig())
        .then(res => res.data);
};

// Datasets, Variables & Policies
export const getAdminDatasets = (params = {}) => {
    return axios.get(`${BASE_URL}/datasets/`, { ...authConfig(), params })
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

export const getDatasetAccessPolicies = (params = {}) => {
    return axios.get(`${BASE_URL}/dataset-access-policies/`, { ...authConfig(), params })
        .then(res => res.data.results || res.data || []);
};
