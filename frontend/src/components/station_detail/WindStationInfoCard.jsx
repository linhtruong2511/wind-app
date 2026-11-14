import React from 'react';
import PropTypes from 'prop-types';
import { Panel, Label } from 'react-bootstrap';

const STATION_TYPE_LABELS = {
    SYNOP: 'Bề mặt',
    SURFACE: 'Bề mặt',
    MET_MAST: 'Cột khí tượng',
    BUOY: 'Phao biển'
};

const WindStationInfoCard = ({ station }) => {
    if (!station) return null;
    const latestObs = station.latest_observation || station.properties?.latest_observation;
    const isSynop = (station.station_type || station.properties?.station_type || '').toLowerCase() === 'synop';
    const stationCode = station.station_code || station.properties?.station_code || 'N/A';
    const stationName = station.name || station.properties?.name || 'N/A';
    const stationType = (station.station_type || station.properties?.station_type || 'N/A').toUpperCase();
    const elevation = station.elevation || station.properties?.elevation;

    let lat = station.lat || station.latitude || 0;
    let lon = station.lon || station.longitude || 0;
    if (station.geometry && station.geometry.coordinates) {
        lon = station.geometry.coordinates[0];
        lat = station.geometry.coordinates[1];
    } else if (station.properties?.lat || station.properties?.latitude) {
        lat = station.properties.lat || station.properties.latitude;
        lon = station.properties.lon || station.properties.longitude;
    }

    return (
        <Panel header={<h4>Thông tin trạm quan trắc</h4>} bsStyle="primary">
            <div style={{ fontSize: '13px', lineHeight: '2.2', padding: '8px', color: '#334155' }}>
                <div style={{ borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Mã trạm:</span>
                    <strong>{stationCode}</strong>
                </div>
                <div style={{ borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Tên trạm:</span>
                    <strong>{stationName}</strong>
                </div>
                <div style={{ borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b' }}>Loại trạm:</span>
                    <Label bsStyle={isSynop ? 'info' : 'warning'}>
                        {STATION_TYPE_LABELS[stationType] || stationType}
                    </Label>
                </div>
                <div style={{ borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Cao độ:</span>
                    <strong>{elevation ? `${elevation} m` : 'N/A'}</strong>
                </div>
                <div style={{ borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Tọa độ:</span>
                    <strong>{Number(lat || 0).toFixed(4)}°N, {Number(lon || 0).toFixed(4)}°E</strong>
                </div>

                {latestObs && (
                    <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: '4px', fontSize: '12px' }}>
                            <i className="fa fa-clock-o" /> Đo đạc mới nhất:
                        </div>
                        <div style={{ fontSize: '11px', color: '#334155', lineHeight: '1.6' }}>
                            <div>Thời gian: {latestObs.obs_time ? new Date(latestObs.obs_time).toLocaleString('vi-VN') : 'N/A'}</div>
                            <div>Gió: <strong>{latestObs.wind_speed ?? 'N/A'} m/s</strong>, hướng {latestObs.wind_dir ?? 'N/A'}°</div>
                            <div>Nhiệt độ: <strong>{latestObs.temp_2m ?? 'N/A'} °C</strong>, độ ẩm: <strong>{latestObs.humidity ?? 'N/A'}%</strong></div>
                        </div>
                    </div>
                )}
            </div>
        </Panel>
    );
};

WindStationInfoCard.propTypes = {
    station: PropTypes.object
};

export default WindStationInfoCard;
