/*
 * Copyright 2026, GeoNode Project.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import PropTypes from 'prop-types';
import WindFarmRow from './WindFarmRow';

const WindFarmList = ({ data, loading, selectedPoint, onSelectPoint }) => {
    if (loading) {
        return (
            <div style={{ padding: '35px', textAlign: 'center', color: '#64748b' }}>
                <i className="fa fa-spinner fa-spin fa-2x" style={{ color: '#3b82f6', marginBottom: '8px' }} />
                <p style={{ margin: 0 }}>Đang tải dữ liệu điểm tiềm năng điện gió...</p>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div style={{ padding: '35px', textAlign: 'center', color: '#64748b' }}>
                <i className="fa fa-info-circle fa-2x" style={{ color: '#94a3b8', marginBottom: '8px' }} />
                <p style={{ margin: 0 }}>Không tìm thấy vị trí tiềm năng nào phù hợp với bộ lọc.</p>
            </div>
        );
    }

    return (
        <div
            style={{
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                overflowY: 'auto',
                maxHeight: 'calc(100vh - 310px)',
                background: '#ffffff'
            }}
        >
            {data.map(item => {
                const isSelected = selectedPoint && (
                    (selectedPoint.point_id && selectedPoint.point_id === item.point_id) ||
                    (selectedPoint.id && selectedPoint.id === item.id)
                );
                return (
                    <WindFarmRow
                        key={item.id || item.point_id}
                        item={item}
                        isSelected={!!isSelected}
                        onSelectPoint={onSelectPoint}
                    />
                );
            })}
        </div>
    );
};

WindFarmList.propTypes = {
    data: PropTypes.array.isRequired,
    loading: PropTypes.bool,
    selectedPoint: PropTypes.object,
    onSelectPoint: PropTypes.func.isRequired
};

export default WindFarmList;
