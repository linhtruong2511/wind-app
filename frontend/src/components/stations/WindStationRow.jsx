import React from 'react';
import PropTypes from 'prop-types';
import { Label, Button } from 'react-bootstrap';

const STATION_TYPE_LABELS = {
    SYNOP: 'Bề mặt',
    SURFACE: 'Bề mặt',
    MET_MAST: 'Cột khí tượng',
    BUOY: 'Phao biển'
};

const WindStationRow = ({ item, onSelectStation, onViewDetail }) => {
    const stationName = item.properties?.name || item.name || `Trạm #${item.id}`;
    const stationCode = item.properties?.station_code || item.station_code || 'N/A';
    const stationType = (item.properties?.station_type || item.station_type || 'N/A').toUpperCase();
    const obs = item.properties?.latest_observation || item.latest_observation;

    let lat = 0;
    let lon = 0;
    if (item.geometry && item.geometry.coordinates) {
        lon = item.geometry.coordinates[0];
        lat = item.geometry.coordinates[1];
    } else {
        lat = item.lat || item.latitude || 0;
        lon = item.lon || item.longitude || 0;
    }

    return (
        <div
            className="station-item-row"
            style={{
                padding: '12px 15px',
                borderBottom: '1px solid #e2e8f0',
                background: '#fff',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
            }}
            onClick={() => onSelectStation(item)}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '13px', color: '#1e40af' }}>{stationName}</strong>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Mã: {stationCode}</span>
                    <Label bsStyle={stationType === 'SYNOP' ? 'info' : 'warning'}>
                        {STATION_TYPE_LABELS[stationType] || stationType}
                    </Label>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <Button
                        bsStyle="primary"
                        bsSize="xs"
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewDetail(item.id || item.properties?.id || item.pk);
                        }}
                        title="Xem chi tiết & biểu đồ"
                    >
                        <i className="fa fa-line-chart" /> Chi tiết
                    </Button>
                </div>
            </div>

            {/* Các thông số khí tượng đo đạc tức thời */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '11px', color: '#475569' }}>
                <div>
                    <i className="fa fa-thermometer-half" style={{ color: '#ef4444', marginRight: '3px' }} />
                    Nhiệt độ: <strong>{obs?.temp_2m !== null && obs?.temp_2m !== undefined ? `${obs.temp_2m} °C` : 'N/A'}</strong>
                </div>
                <div>
                    <i className="fa fa-flag" style={{ color: '#3b82f6', marginRight: '3px' }} />
                    Gió: <strong>{obs?.wind_speed !== null && obs?.wind_speed !== undefined ? `${obs.wind_speed} m/s` : 'N/A'}</strong>
                </div>
                <div>
                    <i className="fa fa-compass" style={{ color: '#8b5cf6', marginRight: '3px' }} />
                    Hướng: <strong>{obs?.wind_dir !== null && obs?.wind_dir !== undefined ? `${obs.wind_dir}°` : 'N/A'}</strong>
                </div>
                <div>
                    <i className="fa fa-tint" style={{ color: '#06b6d4', marginRight: '3px' }} />
                    Độ ẩm: <strong>{obs?.humidity !== null && obs?.humidity !== undefined ? `${obs.humidity}%` : 'N/A'}</strong>
                </div>
                <div style={{ marginLeft: 'auto', color: '#94a3b8' }}>
                    Tọa độ: {Number(lat || 0).toFixed(3)}°, {Number(lon || 0).toFixed(3)}°
                </div>
            </div>
        </div>
    );
};

WindStationRow.propTypes = {
    item: PropTypes.object.isRequired,
    onSelectStation: PropTypes.func.isRequired,
    onViewDetail: PropTypes.func.isRequired
};

export default WindStationRow;
