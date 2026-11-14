/*
 * Wind Management API Client for GeoNode MapStore Client
 */
import axios from 'axios';
import windFarmsData from '../data/windFarmsData.json';

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

export const getWindFarms = (params = {}) => {
    return new Promise((resolve) => {
        let filtered = [...windFarmsData];
        const { search, minPower, maxDepth, foundationType, zone, page = 1, pageSize = 50 } = params;

        if (search) {
            const query = String(search).trim().toLowerCase();
            filtered = filtered.filter(item =>
                String(item.point_id).includes(query) ||
                (item.name && item.name.toLowerCase().includes(query)) ||
                (item.zone && item.zone.toLowerCase().includes(query))
            );
        }

        if (minPower) {
            const minP = parseFloat(minPower);
            if (!isNaN(minP)) {
                filtered = filtered.filter(item => item.predicted_power_mw >= minP);
            }
        }

        if (maxDepth) {
            const maxD = parseFloat(maxDepth);
            if (!isNaN(maxD)) {
                filtered = filtered.filter(item => item.depth_m <= maxD);
            }
        }

        if (foundationType) {
            if (foundationType === 'fixed') {
                filtered = filtered.filter(item => item.depth_m <= 50);
            } else if (foundationType === 'floating') {
                filtered = filtered.filter(item => item.depth_m > 50);
            }
        }

        if (zone) {
            filtered = filtered.filter(item => item.zone === zone);
        }

        const totalCount = filtered.length;
        const start = (page - 1) * pageSize;
        const results = filtered.slice(start, start + pageSize);

        resolve({
            count: totalCount,
            results
        });
    });
};

export const getWindFarmsMap = (params = {}) => {
    return new Promise((resolve) => {
        let filtered = [...windFarmsData];
        const { search, minPower, foundationType, zone } = params;

        if (search) {
            const query = String(search).trim().toLowerCase();
            filtered = filtered.filter(item =>
                String(item.point_id).includes(query) ||
                (item.name && item.name.toLowerCase().includes(query)) ||
                (item.zone && item.zone.toLowerCase().includes(query))
            );
        }

        if (minPower) {
            const minP = parseFloat(minPower);
            if (!isNaN(minP)) {
                filtered = filtered.filter(item => item.predicted_power_mw >= minP);
            }
        }

        if (foundationType) {
            if (foundationType === 'fixed') {
                filtered = filtered.filter(item => item.depth_m <= 50);
            } else if (foundationType === 'floating') {
                filtered = filtered.filter(item => item.depth_m > 50);
            }
        }

        if (zone) {
            filtered = filtered.filter(item => item.zone === zone);
        }

        const geojson = {
            type: 'FeatureCollection',
            features: filtered.map(item => ({
                type: 'Feature',
                id: item.id,
                geometry: {
                    type: 'Point',
                    coordinates: [item.longitude, item.latitude]
                },
                properties: {
                    ...item
                }
            }))
        };

        resolve(geojson);
    });
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
    getWindFarmsMap
};


