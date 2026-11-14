/*
 * Copyright 2026, GeoNode Project.
 * Wind Grid Color Scale Legend Bar
 */

import React from 'react';
import PropTypes from 'prop-types';

const WindGridLegend = ({ maxSpeed = 25, unit = 'm/s' }) => {
    const stops = [
        { label: '0', color: 'hsla(240, 85%, 50%, 0.85)' },
        { label: '5', color: 'hsla(192, 85%, 50%, 0.85)' },
        { label: '10', color: 'hsla(144, 85%, 50%, 0.85)' },
        { label: '15', color: 'hsla(96, 85%, 50%, 0.85)' },
        { label: '20', color: 'hsla(48, 85%, 50%, 0.85)' },
        { label: `${maxSpeed}+`, color: 'hsla(0, 85%, 50%, 0.85)' }
    ];

    const gradient = 'linear-gradient(to right, ' +
        'hsla(240, 85%, 50%, 0.85) 0%, ' +
        'hsla(192, 85%, 50%, 0.85) 20%, ' +
        'hsla(144, 85%, 50%, 0.85) 40%, ' +
        'hsla(96, 85%, 50%, 0.85) 60%, ' +
        'hsla(48, 85%, 50%, 0.85) 80%, ' +
        'hsla(0, 85%, 50%, 0.85) 100%)';

    return (
        <div
            style={{
                position: 'absolute',
                bottom: '90px',
                right: '28px',
                zIndex: 1000,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                padding: '12px 16px',
                borderRadius: '10px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
                border: '1px solid rgba(203, 213, 225, 0.9)',
                backdropFilter: 'blur(8px)',
                minWidth: '240px',
                fontSize: '12px',
                color: '#1e293b'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontWeight: 600 }}>
                <span>Thang tốc độ gió</span>
                <span style={{ color: '#64748b' }}>({unit})</span>
            </div>

            <div
                style={{
                    height: '12px',
                    borderRadius: '6px',
                    background: gradient,
                    border: '1px solid rgba(0,0,0,0.1)',
                    marginBottom: '4px'
                }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#475569', fontWeight: 600 }}>
                {stops.map((st, i) => (
                    <span key={i}>{st.label}</span>
                ))}
            </div>
        </div>
    );
};

WindGridLegend.propTypes = {
    maxSpeed: PropTypes.number,
    unit: PropTypes.string
};

export default WindGridLegend;
