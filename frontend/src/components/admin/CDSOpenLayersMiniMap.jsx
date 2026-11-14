import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import { fromLonLat, toLonLat } from 'ol/proj';
import DragBox from 'ol/interaction/DragBox';
import { always } from 'ol/events/condition';
import { Style, Stroke, Fill } from 'ol/style';
import 'ol/ol.css';

const CDSOpenLayersMiniMap = ({ bbox, onChange }) => {
    const mapElement = useRef(null);
    const mapRef = useRef(null);
    const vectorSourceRef = useRef(new VectorSource());
    const dragBoxRef = useRef(null);
    const [isDrawMode, setIsDrawMode] = useState(false);

    useEffect(() => {
        if (!mapElement.current) return;

        const vectorLayer = new VectorLayer({
            source: vectorSourceRef.current,
            style: new Style({
                stroke: new Stroke({ color: '#0284c7', width: 2 }),
                fill: new Fill({ color: 'rgba(2, 132, 199, 0.15)' })
            })
        });

        const map = new Map({
            target: mapElement.current,
            layers: [
                new TileLayer({
                    source: new OSM()
                }),
                vectorLayer
            ],
            view: new View({
                center: fromLonLat([108.0, 16.0]),
                zoom: 4.5
            })
        });

        const dragBox = new DragBox({
            condition: always
        });
        dragBox.setActive(false);

        dragBox.on('boxend', () => {
            const extent = dragBox.getGeometry().getExtent();
            const minCoord = toLonLat([extent[0], extent[1]]);
            const maxCoord = toLonLat([extent[2], extent[3]]);

            const west = parseFloat(minCoord[0].toFixed(2));
            const south = parseFloat(minCoord[1].toFixed(2));
            const east = parseFloat(maxCoord[0].toFixed(2));
            const north = parseFloat(maxCoord[1].toFixed(2));

            if (onChange) {
                onChange([north, west, south, east]);
            }
            setIsDrawMode(false);
            dragBox.setActive(false);
        });

        map.addInteraction(dragBox);
        dragBoxRef.current = dragBox;
        mapRef.current = map;

        // Cập nhật lại kích thước bản đồ khi render xong
        setTimeout(() => {
            map.updateSize();
        }, 200);

        return () => {
            map.setTarget(null);
        };
    }, []);

    // Bật/tắt chế độ vẽ vùng
    const toggleDrawMode = () => {
        const nextMode = !isDrawMode;
        setIsDrawMode(nextMode);
        if (dragBoxRef.current) {
            dragBoxRef.current.setActive(nextMode);
        }
    };

    // Đồng bộ bbox vào vector layer khi bbox props thay đổi
    useEffect(() => {
        if (!bbox || bbox.length !== 4) return;
        const [north, west, south, east] = bbox;
        if (isNaN(north) || isNaN(west) || isNaN(south) || isNaN(east)) return;

        vectorSourceRef.current.clear();

        const p1 = fromLonLat([west, south]);
        const p2 = fromLonLat([east, south]);
        const p3 = fromLonLat([east, north]);
        const p4 = fromLonLat([west, north]);

        const poly = new Polygon([[p1, p2, p3, p4, p1]]);
        const feature = new Feature({ geometry: poly });
        vectorSourceRef.current.addFeature(feature);

        if (mapRef.current) {
            mapRef.current.getView().fit(poly.getExtent(), {
                padding: [25, 25, 25, 25],
                maxZoom: 6,
                duration: 300
            });
        }
    }, [bbox]);

    return (
        <div style={{ position: 'relative', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
            <div ref={mapElement} style={{ width: '100%', height: '280px', cursor: isDrawMode ? 'crosshair' : 'default' }} />
            
            {/* Thanh công cụ bản đồ */}
            <div style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                zIndex: 10,
                display: 'flex',
                gap: '6px'
            }}>
                <button
                    type="button"
                    onClick={toggleDrawMode}
                    className={`btn btn-xs ${isDrawMode ? 'btn-danger' : 'btn-primary'}`}
                    style={{
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    <i className={`fa ${isDrawMode ? 'fa-times' : 'fa-pencil-square-o'}`}></i>
                    {isDrawMode ? 'Hủy vẽ' : 'Vẽ vùng chọn'}
                </button>
            </div>

            <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                background: isDrawMode ? 'rgba(239, 68, 68, 0.85)' : 'rgba(15, 23, 42, 0.75)',
                color: '#f8fafc',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                pointerEvents: 'none',
                transition: 'background 0.2s ease'
            }}>
                <i className="fa fa-info-circle" style={{ marginRight: '4px' }}></i>
                {isDrawMode 
                    ? 'Đang bật chế độ vẽ: Nhấn giữ chuột trái và kéo để vẽ khung chữ nhật trên bản đồ' 
                    : 'Bấm nút "Vẽ vùng chọn" hoặc chỉnh sửa 4 ô số tọa độ bên dưới'
                }
            </div>
        </div>
    );
};

CDSOpenLayersMiniMap.propTypes = {
    bbox: PropTypes.arrayOf(PropTypes.number).isRequired,
    onChange: PropTypes.func.isRequired
};

export default CDSOpenLayersMiniMap;
