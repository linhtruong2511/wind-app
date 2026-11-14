/*
 * Copyright 2026, GeoNode Project.
 * Wind Grid Time Animation Player Bottom Bar
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Button, ButtonGroup } from 'react-bootstrap';

const WindGridTimePlayer = ({
    availableHours = [],
    selectedHour = '',
    onSelectHour = () => {},
    onPrev = null,
    onNext = null,
    isPlaying = false,
    onTogglePlay = () => {},
    playSpeed = 1,
    onChangePlaySpeed = () => {},
    selectedDateStr = '',
    totalSteps = 0
}) => {
    const currentIndex = availableHours.indexOf(selectedHour);
    const hasMultipleSteps = totalSteps > 1 || availableHours.length > 1;

    const handlePrev = () => {
        if (onPrev) {
            onPrev();
            return;
        }
        if (availableHours.length === 0) return;
        const prevIdx = (currentIndex - 1 + availableHours.length) % availableHours.length;
        onSelectHour(availableHours[prevIdx]);
    };

    const handleNext = () => {
        if (onNext) {
            onNext();
            return;
        }
        if (availableHours.length === 0) return;
        const nextIdx = (currentIndex + 1) % availableHours.length;
        onSelectHour(availableHours[nextIdx]);
    };

    const handleSpeedClick = () => {
        const speeds = [1, 2, 5];
        const nextSpeedIdx = (speeds.indexOf(playSpeed) + 1) % speeds.length;
        onChangePlaySpeed(speeds[nextSpeedIdx]);
    };

    return (
        <div
            style={{
                position: 'absolute',
                bottom: '92px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                backgroundColor: 'rgba(255, 255, 255, 0.96)',
                padding: '8px 20px',
                borderRadius: '32px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                border: '1px solid #cbd5e1',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                maxWidth: '90vw',
                pointerEvents: 'auto'
            }}
        >
            {/* Playback Buttons */}
            <ButtonGroup bsSize="small">
                <Button
                    onClick={handlePrev}
                    disabled={!hasMultipleSteps}
                    title="Bước thời gian trước"
                >
                    <i className="fa fa-step-backward" />
                </Button>
                <Button
                    bsStyle={isPlaying ? 'warning' : 'primary'}
                    onClick={onTogglePlay}
                    disabled={!hasMultipleSteps}
                    title={isPlaying ? 'Tạm dừng' : 'Chạy tự động'}
                >
                    <i className={`fa fa-${isPlaying ? 'pause' : 'play'}`} />
                </Button>
                <Button
                    onClick={handleNext}
                    disabled={!hasMultipleSteps}
                    title="Bước thời gian sau (chuyển ngày khi hết giờ)"
                >
                    <i className="fa fa-step-forward" />
                </Button>
            </ButtonGroup>

            {/* Speed Badge */}
            <Button
                bsSize="xs"
                bsStyle="default"
                onClick={handleSpeedClick}
                style={{ fontWeight: 700, borderRadius: '12px', minWidth: '42px' }}
                title="Thay đổi tốc độ phát"
            >
                {playSpeed}x
            </Button>

            {/* Current Time Display */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: '130px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    {selectedDateStr || 'Thời gian (UTC)'}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    {selectedHour ? `${selectedHour} UTC` : 'Chưa chọn'}
                </span>
            </div>

            {/* Hours Timeline Step Bar */}
            <div style={{ display: 'flex', gap: '3px', alignItems: 'center', overflowX: 'auto', maxWidth: '400px', padding: '2px 0' }}>
                {availableHours.map((hr) => {
                    const isSel = hr === selectedHour;
                    return (
                        <button
                            key={hr}
                            type="button"
                            onClick={() => onSelectHour(hr)}
                            style={{
                                border: isSel ? '2px solid #2563eb' : '1px solid #cbd5e1',
                                backgroundColor: isSel ? '#2563eb' : '#f8fafc',
                                color: isSel ? '#ffffff' : '#475569',
                                borderRadius: '4px',
                                padding: '3px 6px',
                                fontSize: '11px',
                                fontWeight: isSel ? 700 : 500,
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                            title={`Giờ ${hr} UTC`}
                        >
                            {hr.split(':')[0]}h
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

WindGridTimePlayer.propTypes = {
    availableHours: PropTypes.arrayOf(PropTypes.string),
    selectedHour: PropTypes.string,
    onSelectHour: PropTypes.func,
    onPrev: PropTypes.func,
    onNext: PropTypes.func,
    isPlaying: PropTypes.bool,
    onTogglePlay: PropTypes.func,
    playSpeed: PropTypes.number,
    onChangePlaySpeed: PropTypes.func,
    selectedDateStr: PropTypes.string,
    totalSteps: PropTypes.number
};

export default WindGridTimePlayer;

