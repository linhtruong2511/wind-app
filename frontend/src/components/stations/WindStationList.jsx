import React from 'react';
import PropTypes from 'prop-types';
import WindStationRow from './WindStationRow';

const WindStationList = ({ data, loading, onSelectStation, onViewDetail }) => {
    if (loading) {
        return (
            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                <i className="fa fa-spinner fa-spin fa-2x" style={{ color: '#3b82f6', marginBottom: '8px' }} />
                <p>Đang tải danh sách trạm quan trắc...</p>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                <i className="fa fa-info-circle fa-2x" style={{ color: '#94a3b8', marginBottom: '8px' }} />
                <p>Không tìm thấy trạm quan trắc nào thỏa mãn điều kiện lọc.</p>
            </div>
        );
    }

    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', background: '#fff' }}>
            {data.map(item => (
                <WindStationRow
                    key={item.id}
                    item={item}
                    onSelectStation={onSelectStation}
                    onViewDetail={onViewDetail}
                />
            ))}
        </div>
    );
};

WindStationList.propTypes = {
    data: PropTypes.array.isRequired,
    loading: PropTypes.bool,
    onSelectStation: PropTypes.func.isRequired,
    onViewDetail: PropTypes.func.isRequired
};

export default WindStationList;
