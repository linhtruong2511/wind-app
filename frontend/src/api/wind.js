/*
 * Wind Management API Client for GeoNode MapStore Client
 */
import axios from 'axios';

const BASE_URL = '/wind/api/v1';

export const getStations = (params = {}) => {
    return axios.get(`${BASE_URL}/stations/`, { params })
        .then(response => response.data);
};

export const getStationsMap = (params = {}) => {
    return axios.get(`${BASE_URL}/stations/map/`, { params })
        .then(response => response.data);
};

export const getStationDetail = (id) => {
    return axios.get(`${BASE_URL}/stations/${id}/`)
        .then(response => response.data);
};

export const getStationObservations = (params = {}) => {
    return axios.get(`${BASE_URL}/observations/`, { params })
        .then(response => response.data.results || response.data || []);
};

export const getStationSummary = (id, mode = 'monthly-summary', params = {}) => {
    return axios.get(`${BASE_URL}/stations/${id}/${mode}/`, { params })
        .then(response => response.data.results || response.data || []);
};

export const getProvinceWfsData = () => {
    const url = '/geoserver/geonode/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=geonode%3Aviet_nam_tinh_thanh_63&maxFeatures=100&outputFormat=application%2Fjson';
    return axios.get(url).then(response => response.data);
};

export const getGridSummary = () => {
    return axios.get(`${BASE_URL}/raster-granules/summary/`)
        .then(response => response.data);
};

export const getDatasets = (params = { category: 'GRIDDED' }) => {
    return axios.get(`${BASE_URL}/datasets/`, { params })
        .then(response => response.data.results || response.data || []);
};

export const getDatasetTimeSteps = (datasetId) => {
    return axios.get(`${BASE_URL}/datasets/${datasetId}/time_steps/`)
        .then(response => response.data.time_steps || []);
};

export const getDatasetVariables = (datasetId) => {
    return axios.get(`${BASE_URL}/datasets/${datasetId}/get_variables/`, { params: { is_component: false } })
        .then(response => response.data.variables || []);
};

export const getRasterGranuleData = ({ dataset_id, variable, time, bbox, step } = {}) => {
    const params = { dataset_id, variable };
    if (time) params.time = time;
    if (bbox) params.bbox = bbox;
    if (step) params.step = step;
    return axios.get(`${BASE_URL}/raster-granules/data/`, { params })
        .then(response => response.data);
};

export const getStatisticsOverview = (params = {}) => {
    return axios.get(`${BASE_URL}/statistics/overview/`, { params })
        .then(response => response.data);
};

export const getStatisticsRankings = (params = {}) => {
    return axios.get(`${BASE_URL}/statistics/rankings/`, { params })
        .then(response => response.data);
};

export const getMultiStationComparison = (params = {}) => {
    return axios.get(`${BASE_URL}/statistics/multi-station-compare/`, { params })
        .then(response => response.data);
};

export const getWindRoseData = (params = {}) => {
    return axios.get(`${BASE_URL}/statistics/wind-rose/`, { params })
        .then(response => response.data);
};

export const getStatisticsExportUrl = (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return `${BASE_URL}/statistics/export-csv/${query ? `?${query}` : ''}`;
};

// Bỏ các tham số rỗng để không gửi lên máy chủ
const cleanParams = (params = {}) => Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
);

export const getWindFarms = (params = {}) => {
    return axios.get(`${BASE_URL}/turbines/`, { params: cleanParams(params) })
        .then(response => response.data);
};

export const getWindFarmsMap = (params = {}) => {
    return axios.get(`${BASE_URL}/turbines/map/`, { params: cleanParams(params) })
        .then(response => response.data);
};

// Lưới giá trị nội suy do máy chủ tính. params gồm method, metric và các bộ lọc như danh sách tuabin
export const getInterpolationGrid = (params = {}, { signal } = {}) => {
    return axios.get(`${BASE_URL}/turbines/interpolation/grid/`, { params: cleanParams(params), signal })
        .then(response => response.data);
};

// Giá trị nội suy tại một toạ độ. params gồm method, lon, lat và các bộ lọc
export const getInterpolationPoint = (params = {}, { signal } = {}) => {
    return axios.get(`${BASE_URL}/turbines/interpolation/point/`, { params: cleanParams(params), signal })
        .then(response => response.data);
};

// Đường dẫn tải tệp danh sách tuabin theo bộ lọc, output là 'csv' hoặc 'geojson'
export const getTurbinesExportUrl = (params = {}, output = 'csv') => {
    const { page, pageSize, ...filters } = params;
    const query = new URLSearchParams({ ...cleanParams(filters), output }).toString();
    return `${BASE_URL}/turbines/export/?${query}`;
};

export default {
    getStations,
    getStationsMap,
    getStationDetail,
    getStationObservations,
    getStationSummary,
    getProvinceWfsData,
    getGridSummary,
    getDatasets,
    getDatasetTimeSteps,
    getDatasetVariables,
    getRasterGranuleData,
    getStatisticsOverview,
    getStatisticsRankings,
    getMultiStationComparison,
    getWindRoseData,
    getStatisticsExportUrl,
    getWindFarms,
    getWindFarmsMap,
    getInterpolationGrid,
    getInterpolationPoint,
    getTurbinesExportUrl
};


