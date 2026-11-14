/**
 * Phân rã dải ngày (Từ ngày -> Đến ngày) và danh sách mốc giờ thành định dạng mảng chuẩn cdsapi.
 * Đảm bảo các ngày và tháng được format dạng 2 chữ số ('01', '02'...).
 */
export const decomposeDateRange = (startDateStr, endDateStr, hoursList = []) => {
    if (!startDateStr || !endDateStr) {
        return { years: [], months: [], days: [], time: [] };
    }

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    if (start > end) {
        return { years: [], months: [], days: [], time: [] };
    }

    const yearsSet = new Set();
    const monthsSet = new Set();
    const daysSet = new Set();

    const current = new Date(start);
    while (current <= end) {
        const year = current.getFullYear().toString();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');

        yearsSet.add(year);
        monthsSet.add(month);
        daysSet.add(day);

        current.setDate(current.getDate() + 1);
    }

    const formatHour = (h) => {
        if (h.includes(':')) return h;
        return String(h).padStart(2, '0') + ':00';
    };

    return {
        years: Array.from(yearsSet).sort(),
        months: Array.from(monthsSet).sort(),
        days: Array.from(daysSet).sort(),
        time: (hoursList && hoursList.length > 0) ? hoursList.map(formatHour).sort() : ['00:00']
    };
};

export const HOUR_PRESETS = {
    ALL_24: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00'),
    EVERY_3H: ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
    SYNOPTIC_6H: ['00:00', '06:00', '12:00', '18:00']
};

export const DEFAULT_WIND_VARIABLES = [
    '10m_u_component_of_wind',
    '10m_v_component_of_wind',
    '100m_u_component_of_wind',
    '100m_v_component_of_wind'
];
