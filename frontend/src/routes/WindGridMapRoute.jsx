/*
 * Copyright 2026, GeoNode Project.
 * Full Map Wind Grid Data, Wind Flow & Heatmap Route Component
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

import {
    getGridSummary,
    getDatasets,
    getDatasetTimeSteps,
    getDatasetVariables,
    getRasterGranuleData
} from '../api/wind';

import WindGridMapContainer from '../components/grid/WindGridMapContainer';
import WindGridSidebarDrawer from '../components/grid/WindGridSidebarDrawer';
import WindGridLegend from '../components/grid/WindGridLegend';
import WindGridTimePlayer from '../components/grid/WindGridTimePlayer';
import PointGridChartPlotly from '../components/grid/PointGridChartPlotly';

const getUtcParts = (isoString) => {
    const d = new Date(isoString);
    return {
        year: d.getUTCFullYear().toString(),
        month: (d.getUTCMonth() + 1).toString().padStart(2, '0'),
        day: d.getUTCDate().toString().padStart(2, '0'),
        hour: d.getUTCHours().toString().padStart(2, '0') + ':' + d.getUTCMinutes().toString().padStart(2, '0')
    };
};

const WindGridMapRoute = () => {
    const [summary, setSummary] = useState(null);
    const [loadingSummary, setLoadingSummary] = useState(false);
    const [datasets, setDatasets] = useState([]);
    const [selectedDatasetId, setSelectedDatasetId] = useState('');
    const [timeSteps, setTimeSteps] = useState([]);
    const [datasetVariables, setDatasetVariables] = useState([]);
    const [activeVariable, setActiveVariable] = useState('');

    const [selectedYear, setSelectedYear] = useState('');
    const [selectedMonth, setSelectedMonth] = useState('');
    const [selectedDay, setSelectedDay] = useState('');
    const [selectedHour, setSelectedHour] = useState('');

    const [gridData, setGridData] = useState(null);
    const [loadingGridData, setLoadingGridData] = useState(false);

    const [layerSettings, setLayerSettings] = useState({
        showHeatmap: true,
        heatmapOpacity: 0.6,
        showParticles: true,
        particleSpeed: 0.005,
        showStations: false
    });

    const [isPlaying, setIsPlaying] = useState(false);
    const [playSpeed, setPlaySpeed] = useState(1);

    const [clickedPoint, setClickedPoint] = useState(null);

    // 1. Initial Load: Summary & Datasets
    useEffect(() => {
        setLoadingSummary(true);
        getGridSummary()
            .then(res => setSummary(res))
            .catch(err => console.error('Error fetching grid summary:', err))
            .finally(() => setLoadingSummary(false));

        getDatasets({ category: 'GRIDDED' })
            .then(res => {
                const list = res.results || (Array.isArray(res) ? res : []);
                setDatasets(list);
                if (list.length > 0) {
                    setSelectedDatasetId(list[0].id);
                }
            })
            .catch(err => console.error('Error fetching datasets:', err));
    }, []);

    // 2. When Dataset changes: Fetch Timesteps & Variables
    useEffect(() => {
        if (!selectedDatasetId) return;

        getDatasetTimeSteps(selectedDatasetId)
            .then(res => {
                const steps = res.time_steps || (Array.isArray(res) ? res : []);
                setTimeSteps(steps);
            })
            .catch(err => console.error('Error fetching timesteps:', err));

        getDatasetVariables(selectedDatasetId)
            .then(res => {
                const vars = res.variables || (Array.isArray(res) ? res : []);
                setDatasetVariables(vars);
            })
            .catch(err => console.error('Error fetching dataset variables:', err));
    }, [selectedDatasetId]);

    // Parse time steps into parts
    const parsedTimes = useMemo(() => {
        return timeSteps.map(t => ({ ...getUtcParts(t), original: t }));
    }, [timeSteps]);

    const availableYears = useMemo(() => {
        return [...new Set(parsedTimes.map(p => p.year))].sort();
    }, [parsedTimes]);

    const availableMonths = useMemo(() => {
        return [...new Set(parsedTimes.filter(p => p.year === selectedYear).map(p => p.month))].sort();
    }, [parsedTimes, selectedYear]);

    const availableDays = useMemo(() => {
        return [...new Set(parsedTimes.filter(p => p.year === selectedYear && p.month === selectedMonth).map(p => p.day))].sort();
    }, [parsedTimes, selectedYear, selectedMonth]);

    const availableHours = useMemo(() => {
        return [...new Set(parsedTimes.filter(p => p.year === selectedYear && p.month === selectedMonth && p.day === selectedDay).map(p => p.hour))].sort();
    }, [parsedTimes, selectedYear, selectedMonth, selectedDay]);

    // Update cascading dates when timeSteps load
    useEffect(() => {
        if (timeSteps.length === 0) {
            setSelectedYear('');
            setSelectedMonth('');
            setSelectedDay('');
            setSelectedHour('');
            return;
        }
        const first = getUtcParts(timeSteps[0]);
        setSelectedYear(first.year);
        setSelectedMonth(first.month);
        setSelectedDay(first.day);
        setSelectedHour(first.hour);
    }, [timeSteps]);

    // Chọn biến mặc định khi danh sách biến thay đổi
    useEffect(() => {
        if (datasetVariables.length === 0) {
            setActiveVariable('');
            return;
        }
        if (!datasetVariables.some(v => v.variable_code === activeVariable)) {
            setActiveVariable(datasetVariables[0].variable_code);
        }
    }, [datasetVariables, activeVariable]);

    // Current selected ISO time string
    const currentTimeStr = useMemo(() => {
        if (!selectedYear || !selectedMonth || !selectedDay || !selectedHour) return null;
        const matched = parsedTimes.find(p =>
            p.year === selectedYear && p.month === selectedMonth &&
            p.day === selectedDay && p.hour === selectedHour
        );
        return matched ? matched.original : null;
    }, [selectedYear, selectedMonth, selectedDay, selectedHour, parsedTimes]);

    // 3. Fetch Grid Matrix Data whenever time or variable change
    const fetchGridData = useCallback(() => {
        if (!currentTimeStr || !activeVariable || !selectedDatasetId) {
            setGridData(null);
            return;
        }

        setLoadingGridData(true);
        getRasterGranuleData({
            dataset_id: selectedDatasetId,
            variable: activeVariable,
            time: currentTimeStr,
            step: 1
        })
            .then(data => {
                if (!data || !data.lats || !data.lons) {
                    setGridData(null);
                    return;
                }
                // Biến vô hướng trả `values`: dùng như một thành phần để vẽ heatmap
                setGridData(data.values ? { ...data, u: data.values, v: null } : data);
            })
            .catch(err => {
                console.error('Error loading raster grid data:', err);
                setGridData(null);
            })
            .finally(() => setLoadingGridData(false));
    }, [currentTimeStr, activeVariable, selectedDatasetId]);

    useEffect(() => {
        fetchGridData();
    }, [fetchGridData]);

    // Multi-day step progression handlers
    const handleNextStep = useCallback(() => {
        if (parsedTimes.length <= 1) return;
        const currentIdx = parsedTimes.findIndex(p =>
            p.year === selectedYear && p.month === selectedMonth &&
            p.day === selectedDay && p.hour === selectedHour
        );
        const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % parsedTimes.length : 0;
        const nextTime = parsedTimes[nextIdx];
        if (nextTime) {
            setSelectedYear(nextTime.year);
            setSelectedMonth(nextTime.month);
            setSelectedDay(nextTime.day);
            setSelectedHour(nextTime.hour);
        }
    }, [parsedTimes, selectedYear, selectedMonth, selectedDay, selectedHour]);

    const handlePrevStep = useCallback(() => {
        if (parsedTimes.length <= 1) return;
        const currentIdx = parsedTimes.findIndex(p =>
            p.year === selectedYear && p.month === selectedMonth &&
            p.day === selectedDay && p.hour === selectedHour
        );
        const prevIdx = currentIdx >= 0 ? (currentIdx - 1 + parsedTimes.length) % parsedTimes.length : 0;
        const prevTime = parsedTimes[prevIdx];
        if (prevTime) {
            setSelectedYear(prevTime.year);
            setSelectedMonth(prevTime.month);
            setSelectedDay(prevTime.day);
            setSelectedHour(prevTime.hour);
        }
    }, [parsedTimes, selectedYear, selectedMonth, selectedDay, selectedHour]);

    // 4. Auto Time Animation Player Loop
    const timerRef = useRef(null);
    useEffect(() => {
        if (!isPlaying || parsedTimes.length <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return () => {};
        }

        const intervalMs = Math.max(400, 2000 / playSpeed);
        timerRef.current = setInterval(() => {
            handleNextStep();
        }, intervalMs);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isPlaying, playSpeed, parsedTimes.length, handleNextStep]);

    // Cascading selection handlers
    const handleYearChange = (yr) => {
        setSelectedYear(yr);
        const months = [...new Set(parsedTimes.filter(p => p.year === yr).map(p => p.month))].sort();
        const m = months[0] || '';
        setSelectedMonth(m);
        const days = [...new Set(parsedTimes.filter(p => p.year === yr && p.month === m).map(p => p.day))].sort();
        const d = days[0] || '';
        setSelectedDay(d);
        const hours = [...new Set(parsedTimes.filter(p => p.year === yr && p.month === m && p.day === d).map(p => p.hour))].sort();
        setSelectedHour(hours[0] || '');
    };

    const handleMonthChange = (m) => {
        setSelectedMonth(m);
        const days = [...new Set(parsedTimes.filter(p => p.year === selectedYear && p.month === m).map(p => p.day))].sort();
        const d = days[0] || '';
        setSelectedDay(d);
        const hours = [...new Set(parsedTimes.filter(p => p.year === selectedYear && p.month === m && p.day === d).map(p => p.hour))].sort();
        setSelectedHour(hours[0] || '');
    };

    const handleDayChange = (d) => {
        setSelectedDay(d);
        const hours = [...new Set(parsedTimes.filter(p => p.year === selectedYear && p.month === selectedMonth && p.day === d).map(p => p.hour))].sort();
        setSelectedHour(hours[0] || '');
    };

    const selectedDateStr = selectedYear && selectedMonth && selectedDay
        ? `${selectedDay}/${selectedMonth}/${selectedYear}`
        : '';

    return (
        <div style={{ position: 'relative', width: '100vw', height: 'calc(100vh - 60px)', overflow: 'hidden', backgroundColor: '#f1f5f9' }}>
            {/* Sidebar Drawer Controls */}
            <WindGridSidebarDrawer
                datasets={datasets}
                selectedDatasetId={selectedDatasetId}
                onSelectDataset={setSelectedDatasetId}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                selectedDay={selectedDay}
                selectedHour={selectedHour}
                availableYears={availableYears}
                availableMonths={availableMonths}
                availableDays={availableDays}
                availableHours={availableHours}
                onYearChange={handleYearChange}
                onMonthChange={handleMonthChange}
                onDayChange={handleDayChange}
                onHourChange={setSelectedHour}
                variables={datasetVariables}
                activeVariable={activeVariable}
                onSelectVariable={setActiveVariable}
                summary={summary}
                loadingSummary={loadingSummary}
                layerSettings={layerSettings}
                onUpdateLayerSettings={(updates) => setLayerSettings(prev => ({ ...prev, ...updates }))}
            />

            {/* Main OpenLayers Map Container */}
            <WindGridMapContainer
                gridData={gridData}
                loading={loadingGridData}
                layerSettings={layerSettings}
                onClickPoint={setClickedPoint}
            />

            {/* Color Scale Legend */}
            {layerSettings.showHeatmap && (
                <WindGridLegend maxSpeed={25} unit="m/s" />
            )}

            {/* Time Animation Player */}
            <WindGridTimePlayer
                availableHours={availableHours}
                selectedHour={selectedHour}
                onSelectHour={setSelectedHour}
                onPrev={handlePrevStep}
                onNext={handleNextStep}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying(!isPlaying)}
                playSpeed={playSpeed}
                onChangePlaySpeed={setPlaySpeed}
                selectedDateStr={selectedDateStr}
                totalSteps={parsedTimes.length}
            />

            {/* Point Forecast Plotly Popup */}
            {clickedPoint && (
                <PointGridChartPlotly
                    point={clickedPoint}
                    onClose={() => setClickedPoint(null)}
                />
            )}
        </div>
    );
};

export default WindGridMapRoute;

