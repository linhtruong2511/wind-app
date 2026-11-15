import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import {
  getAdminFarms,
  createFarm,
  updateFarm,
  deleteFarm,
  getAdminTurbines,
  createTurbine,
  deleteTurbine,
} from "../../api/admin";
import { getTurbinesExportUrl } from "../../api/wind";

const FARM_STATUS_LABELS = {
  PLANNING: "Đang lập kế hoạch",
  ASSESSMENT: "Đánh giá tài nguyên",
  CONSTRUCTION: "Đang xây dựng",
  OPERATING: "Đang hoạt động",
};

const TURBINE_STATUS_LABELS = {
  PROPOSED: "Đề xuất",
  PLANNED: "Đã lên kế hoạch",
  INSTALLED: "Đã lắp đặt",
  OPERATIONAL: "Đang vận hành",
};

const TURBINE_PAGE_SIZE = 50;

// Tệp CSV mẫu để nhập danh sách tuabin, cùng cột với tệp xuất ra
const TURBINE_CSV_HEADER = [
  "ma_trang_trai",
  "ma_tuabin",
  "ten_diem",
  "kinh_do",
  "vi_do",
  "toc_do_gio_100m",
  "huong_gio",
  "do_sau_m",
  "cong_suat_mw",
  "he_so_cong_suat",
  "trang_thai",
];
const TURBINE_CSV_REQUIRED = [
  "ma_trang_trai",
  "ma_tuabin",
  "kinh_do",
  "vi_do",
  "do_sau_m",
  "cong_suat_mw",
];
const TURBINE_CSV_SAMPLE_ROWS = [
  [
    "VBB_BAC",
    "1001",
    "Điểm tuabin 1001",
    "106.38057",
    "19.25825",
    "7.7",
    "7.9",
    "30",
    "41.6",
    "30.8",
    "PROPOSED",
  ],
  [
    "VBB_BAC",
    "1002",
    "Điểm tuabin 1002",
    "106.40012",
    "19.27100",
    "7.9",
    "8.2",
    "54",
    "44.0",
    "32.6",
    "PROPOSED",
  ],
];

const EMPTY_FARM_FORM = {
  id: null,
  code: "",
  name: "",
  location_name: "",
  description: "",
  total_capacity_mw: "",
  status: "PLANNING",
};

const FOUNDATION_LABELS = {
  FIXED: "Móng cố định",
  FLOATING: "Móng nổi",
};

const EMPTY_TURBINE_FORM = {
  point_id: "",
  name: "",
  farm: "",
  lon: "",
  lat: "",
  foundation_type: "FIXED",
  depth_m: "",
  capacity_mw: "",
  wind_speed_100m: "",
  capacity_factor: "",
  status: "PROPOSED",
};

const labelStyle = { fontSize: "13px", fontWeight: 600, color: "#334155" };
const cellStyle = { padding: "12px 14px" };
const headCellStyle = { padding: "12px 14px" };
const headRowStyle = {
  background: "#f8fafc",
  color: "#475569",
  fontSize: "12px",
  textTransform: "uppercase",
};
const cardStyle = {
  background: "#ffffff",
  borderRadius: "12px",
  padding: "20px",
  border: "1px solid #e2e8f0",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
};
const modalBackdropStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0,0,0,0.5)",
  zIndex: 100000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const modalStyle = {
  background: "#ffffff",
  borderRadius: "12px",
  width: "560px",
  maxWidth: "90%",
  maxHeight: "90vh",
  overflowY: "auto",
  padding: "24px",
  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
};
const gridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
  marginBottom: "14px",
};

const statusLabelClass = (status) => {
  if (status === "OPERATING" || status === "OPERATIONAL") return "success";
  if (status === "CONSTRUCTION" || status === "INSTALLED") return "warning";
  return "default";
};

// Phân tích nội dung CSV, hỗ trợ trường đặt trong dấu nháy kép
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const content = text.replace(/^﻿/, "");
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"' && content[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && content[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
};

const optionalNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = parseFloat(value);
  return Number.isNaN(n) ? undefined : n;
};

const errorText = (err) => {
  const data = err.response?.data;
  if (!data) return err.message;
  return data.detail || JSON.stringify(data);
};

const AdminFarmsRoute = () => {
  const [activeTab, setActiveTab] = useState("farms"); // 'farms' | 'turbines'
  const [importLoading, setImportLoading] = useState(false);
  const turbineFileInputRef = useRef(null);
  const [farms, setFarms] = useState([]);
  const [turbines, setTurbines] = useState([]);
  const [turbineCount, setTurbineCount] = useState(0);
  const [turbinePage, setTurbinePage] = useState(0);
  const [selectedFarmFilter, setSelectedFarmFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [showFarmModal, setShowFarmModal] = useState(false);
  const [farmForm, setFarmForm] = useState(EMPTY_FARM_FORM);
  const [farmModalError, setFarmModalError] = useState("");

  const [showTurbineModal, setShowTurbineModal] = useState(false);
  const [turbineForm, setTurbineForm] = useState(EMPTY_TURBINE_FORM);
  const [turbineModalError, setTurbineModalError] = useState("");

  const loadAll = () => {
    setLoading(true);
    const turbineParams = {
      page: turbinePage + 1,
      pageSize: TURBINE_PAGE_SIZE,
    };
    if (selectedFarmFilter) turbineParams.farm = selectedFarmFilter;
    Promise.all([getAdminFarms(), getAdminTurbines(turbineParams)])
      .then(([farmData, turbineData]) => {
        setFarms(farmData);
        setTurbines(turbineData.results || []);
        setTurbineCount(turbineData.count || 0);
        setLoading(false);
      })
      .catch((err) => {
        setFeedback({
          type: "danger",
          message: "Lỗi tải dữ liệu: " + errorText(err),
        });
        setLoading(false);
      });
  };

  useEffect(() => {
    loadAll();
  }, [selectedFarmFilter, turbinePage, activeTab]);

  const totalTurbinePages = Math.ceil(turbineCount / TURBINE_PAGE_SIZE) || 1;

  const handleFarmFilterChange = (value) => {
    setSelectedFarmFilter(value);
    setTurbinePage(0);
  };

  const handleExport = (output) => {
    window.location.href = getTurbinesExportUrl(
      selectedFarmFilter ? { farm: selectedFarmFilter } : {},
      output,
    );
  };

  const handleDeleteTurbine = (id) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa tuabin này?")) {
      deleteTurbine(id)
        .then(() => {
          setFeedback({
            type: "success",
            message: "Đã xóa tuabin thành công.",
          });
          loadAll();
        })
        .catch((err) => {
          setFeedback({
            type: "danger",
            message: "Xóa thất bại: " + errorText(err),
          });
        });
    }
  };

  const handleSaveFarm = (e) => {
    e.preventDefault();
    const payload = {
      code: farmForm.code,
      name: farmForm.name,
      location_name: farmForm.location_name,
      description: farmForm.description || null,
      total_capacity_mw:
        farmForm.total_capacity_mw !== ""
          ? parseFloat(farmForm.total_capacity_mw)
          : null,
      status: farmForm.status,
    };

    const promise = farmForm.id
      ? updateFarm(farmForm.id, payload)
      : createFarm(payload);

    setFarmModalError("");
    promise
      .then(() => {
        setFeedback({
          type: "success",
          message: "Lưu thông tin trang trại gió thành công!",
        });
        setShowFarmModal(false);
        loadAll();
      })
      .catch((err) => {
        const msg = "Không thể lưu: " + errorText(err);
        setFarmModalError(msg);
        setFeedback({
          type: "danger",
          message: msg,
        });
      });
  };

  const handleDeleteFarm = (farm) => {
    const warning =
      farm.turbine_count > 0
        ? `Trang trại này có ${farm.turbine_count} tuabin, tất cả sẽ bị xóa theo. Bạn có chắc chắn muốn xóa?`
        : "Bạn có chắc chắn muốn xóa trang trại gió này?";
    if (window.confirm(warning)) {
      deleteFarm(farm.id)
        .then(() => {
          setFeedback({
            type: "success",
            message: "Đã xóa trang trại gió thành công.",
          });
          setTurbinePage(0);
          loadAll();
        })
        .catch((err) => {
          setFeedback({
            type: "danger",
            message: "Xóa thất bại: " + errorText(err),
          });
        });
    }
  };

  const isFloating = turbineForm.foundation_type === "FLOATING";

  const handleSaveTurbine = (e) => {
    e.preventDefault();
    const lat = parseFloat(turbineForm.lat);
    const lon = parseFloat(turbineForm.lon);
    const payload = {
      point_id: turbineForm.point_id,
      name: turbineForm.name,
      farm: turbineForm.farm,
      capacity_mw: parseFloat(turbineForm.capacity_mw),
      foundation_type: turbineForm.foundation_type,
      depth_m: isFloating ? 0 : parseFloat(turbineForm.depth_m),
      geom: `SRID=4326;POINT(${lon} ${lat})`,
      status: turbineForm.status,
    };
    const windSpeed = optionalNumber(turbineForm.wind_speed_100m);
    const factor = optionalNumber(turbineForm.capacity_factor);
    if (windSpeed !== undefined) payload.wind_speed_100m = windSpeed;
    if (factor !== undefined) payload.capacity_factor = factor;

    setTurbineModalError("");
    createTurbine(payload)
      .then(() => {
        setFeedback({
          type: "success",
          message: "Thêm tuabin gió thành công!",
        });
        setShowTurbineModal(false);
        loadAll();
      })
      .catch((err) => {
        const msg = "Không thể thêm tuabin: " + errorText(err);
        setTurbineModalError(msg);
        setFeedback({
          type: "danger",
          message: msg,
        });
      });
  };

  const handleDownloadTurbineTemplate = () => {
    const csvLines = [TURBINE_CSV_HEADER, ...TURBINE_CSV_SAMPLE_ROWS]
      .map((row) => row.join(","))
      .join("\r\n");
    // BOM giúp Excel nhận đúng mã hóa UTF-8
    const blob = new Blob(["﻿" + csvLines + "\r\n"], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mau_import_tuabin_gio.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportTurbineFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;

    setImportLoading(true);
    setFeedback(null);
    try {
      const rows = parseCsv(await file.text());
      const header = (rows[0] || []).map((h) => h.trim().toLowerCase());
      const missing = TURBINE_CSV_REQUIRED.filter(
        (col) => !header.includes(col),
      );
      if (missing.length > 0) {
        setFeedback({
          type: "danger",
          message:
            "Tệp thiếu các cột bắt buộc: " +
            missing.join(", ") +
            ". Vui lòng tải tệp mẫu để đối chiếu.",
        });
        return;
      }
      const dataRows = rows.slice(1);
      if (dataRows.length === 0) {
        setFeedback({
          type: "danger",
          message: "Tệp không có dòng dữ liệu nào.",
        });
        return;
      }

      const farmByCode = {};
      farms.forEach((f) => {
        farmByCode[String(f.code).trim().toLowerCase()] = f;
      });
      const col = (cells, name) => {
        const idx = header.indexOf(name);
        return idx >= 0 && cells[idx] !== undefined ? cells[idx].trim() : "";
      };

      let success = 0;
      const errors = [];
      for (let i = 0; i < dataRows.length; i++) {
        const cells = dataRows[i];
        const lineNo = i + 2;
        const farm = farmByCode[col(cells, "ma_trang_trai").toLowerCase()];
        const lon = parseFloat(col(cells, "kinh_do"));
        const lat = parseFloat(col(cells, "vi_do"));
        const capacity = parseFloat(col(cells, "cong_suat_mw"));
        const depth = parseFloat(col(cells, "do_sau_m"));
        if (!farm) {
          errors.push(
            `Dòng ${lineNo}: không tìm thấy trang trại "${col(cells, "ma_trang_trai")}"`,
          );
          continue;
        }
        if (
          !col(cells, "ma_tuabin") ||
          Number.isNaN(lon) ||
          Number.isNaN(lat)
        ) {
          errors.push(
            `Dòng ${lineNo}: thiếu mã tuabin hoặc tọa độ không hợp lệ`,
          );
          continue;
        }
        if (Number.isNaN(capacity) || Number.isNaN(depth)) {
          errors.push(`Dòng ${lineNo}: thiếu công suất hoặc độ sâu`);
          continue;
        }
        const payload = {
          point_id: col(cells, "ma_tuabin"),
          farm: farm.id,
          name: col(cells, "ten_diem"),
          geom: `SRID=4326;POINT(${lon} ${lat})`,
          capacity_mw: capacity,
          depth_m: depth,
          status: col(cells, "trang_thai") || "PROPOSED",
        };
        const windSpeed = optionalNumber(col(cells, "toc_do_gio_100m"));
        const windDirection = optionalNumber(col(cells, "huong_gio"));
        const factor = optionalNumber(col(cells, "he_so_cong_suat"));
        if (windSpeed !== undefined) payload.wind_speed_100m = windSpeed;
        if (windDirection !== undefined) payload.wind_direction = windDirection;
        if (factor !== undefined) payload.capacity_factor = factor;

        try {
          await createTurbine(payload);
          success++;
        } catch (err) {
          errors.push(`Dòng ${lineNo}: ${errorText(err)}`);
        }
      }

      if (errors.length === 0) {
        setFeedback({
          type: "success",
          message: `Đã nhập thành công ${success} tuabin.`,
        });
      } else {
        const shown = errors.slice(0, 5).join("; ");
        const more =
          errors.length > 5 ? ` và ${errors.length - 5} lỗi khác` : "";
        setFeedback({
          type: "danger",
          message: `Nhập thành công ${success}, thất bại ${errors.length} dòng. ${shown}${more}`,
        });
      }
      loadAll();
    } catch (err) {
      setFeedback({
        type: "danger",
        message: "Không thể đọc tệp: " + err.message,
      });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#0f172a",
              margin: 0,
            }}
          >
            Quản lý trang trại gió và tuabin
          </h2>
          <p
            style={{ color: "#64748b", fontSize: "14px", margin: "4px 0 0 0" }}
          >
            Khai báo trang trại điện gió ngoài khơi, tọa độ, độ sâu đáy biển và
            công suất của từng điểm đặt tuabin.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "" }}>
          {activeTab === "farms" ? (
            <button
              onClick={() => {
                setFarmForm(EMPTY_FARM_FORM);
                setFarmModalError("");
                setShowFarmModal(true);
              }}
              className="btn btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                borderRadius: "6px",
                fontWeight: 600,
              }}
            >
              <i className="fa fa-plus"></i>Thêm trang trại gió
            </button>
          ) : (
            <div className="btn-group">
              <button
                type="button"
                onClick={handleDownloadTurbineTemplate}
                className="btn btn-default"
                style={{ fontWeight: 600 }}
              >
                <i
                  className="fa fa-download"
                  style={{ marginRight: "6px" }}
                ></i>
                Tải tệp mẫu
              </button>
              <button
                type="button"
                onClick={() =>
                  turbineFileInputRef.current &&
                  turbineFileInputRef.current.click()
                }
                className="btn btn-default"
                disabled={importLoading}
                style={{ fontWeight: 600 }}
              >
                <i
                  className={`fa ${importLoading ? "fa-spinner fa-spin" : "fa-upload"}`}
                  style={{ marginRight: "6px" }}
                ></i>
                {importLoading ? "Đang nhập..." : "Nhập từ tệp CSV"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTurbineForm({
                    ...EMPTY_TURBINE_FORM,
                    point_id: `${Date.now()}`.slice(-6),
                    farm: selectedFarmFilter || farms[0]?.id || "",
                  });
                  setTurbineModalError("");
                  setShowTurbineModal(true);
                }}
                className="btn btn-primary"
                style={{ fontWeight: 600 }}
              >
                <i className="fa fa-plus" style={{ marginRight: "6px" }}></i>
                Thêm tuabin gió
              </button>
              <input
                ref={turbineFileInputRef}
                type="file"
                accept=".csv"
                onChange={handleImportTurbineFile}
                style={{ display: "none" }}
              />
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`alert alert-${feedback.type === "danger" ? "danger" : "success"}`}
          style={{ borderRadius: "8px", marginBottom: "16px" }}
        >
          <i
            className={`fa ${feedback.type === "danger" ? "fa-exclamation-triangle" : "fa-check-circle"}`}
            style={{ marginRight: "8px" }}
          ></i>
          {feedback.message}
        </div>
      )}

      {/* Nav Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: "20px",
          gap: "8px",
        }}
      >
        {[
          {
            key: "farms",
            icon: "fa-bolt",
            label: `Trang trại gió (${farms.length})`,
          },
          {
            key: "turbines",
            icon: "fa-crosshairs",
            label: `Danh sách tuabin (${turbineCount})`,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 18px",
              border: "none",
              background: "transparent",
              fontWeight: activeTab === tab.key ? 600 : 500,
              color: activeTab === tab.key ? "#0284c7" : "#64748b",
              borderBottom:
                activeTab === tab.key
                  ? "2px solid #0284c7"
                  : "2px solid transparent",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            <i className={`fa ${tab.icon}`} style={{ marginRight: "8px" }}></i>
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Farms */}
      {activeTab === "farms" && (
        <div style={cardStyle}>
          <div className="table-responsive">
            <table className="table table-hover" style={{ margin: 0 }}>
              <thead>
                <tr style={headRowStyle}>
                  <th style={headCellStyle}>Mã trang trại</th>
                  <th style={headCellStyle}>Tên trang trại</th>
                  <th style={headCellStyle}>Vùng biển</th>
                  <th style={headCellStyle}>Số tuabin</th>
                  <th style={headCellStyle}>Công suất (MW)</th>
                  <th style={headCellStyle}>Trạng thái</th>
                  <th style={{ ...headCellStyle, textAlign: "right" }}>
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody style={{ fontSize: "13px" }}>
                {farms.length === 0 ? (
                  <tr>
                    <td
                      colSpan="7"
                      style={{
                        textAlign: "center",
                        padding: "24px",
                        color: "#94a3b8",
                      }}
                    >
                      {loading
                        ? "Đang tải dữ liệu..."
                        : "Chưa có trang trại gió nào."}
                    </td>
                  </tr>
                ) : (
                  farms.map((f) => (
                    <tr key={f.id}>
                      <td
                        style={{
                          ...cellStyle,
                          fontWeight: 600,
                          color: "#0284c7",
                        }}
                      >
                        {f.code}
                      </td>
                      <td
                        style={{
                          ...cellStyle,
                          fontWeight: 600,
                          color: "#0f172a",
                        }}
                      >
                        {f.name}
                      </td>
                      <td style={{ ...cellStyle, color: "#64748b" }}>
                        {f.location_name || "-"}
                      </td>
                      <td style={cellStyle}>{f.turbine_count ?? 0}</td>
                      <td style={{ ...cellStyle, fontWeight: 700 }}>
                        {f.total_capacity_mw
                          ? `${f.total_capacity_mw} MW`
                          : "-"}
                      </td>
                      <td style={cellStyle}>
                        <span
                          className={`label label-${statusLabelClass(f.status)}`}
                        >
                          {FARM_STATUS_LABELS[f.status] || f.status}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>
                        <button
                          onClick={() => {
                            setFarmForm({
                              id: f.id,
                              code: f.code,
                              name: f.name,
                              location_name: f.location_name || "",
                              description: f.description || "",
                              total_capacity_mw: f.total_capacity_mw ?? "",
                              status: f.status,
                            });
                            setFarmModalError("");
                            setShowFarmModal(true);
                          }}
                          className="btn btn-xs btn-default"
                          style={{ marginRight: "6px" }}
                          title="Chỉnh sửa"
                        >
                          <i className="fa fa-pencil"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteFarm(f)}
                          className="btn btn-xs btn-danger"
                          title="Xóa"
                        >
                          <i className="fa fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Turbines */}
      {activeTab === "turbines" && (
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{ fontSize: "13px", color: "#64748b", fontWeight: 500 }}
              >
                Lọc theo trang trại:
              </span>
              <select
                className="form-control"
                value={selectedFarmFilter}
                onChange={(e) => handleFarmFilterChange(e.target.value)}
                style={{
                  width: "240px",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              >
                <option value="">-- Tất cả trang trại --</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="btn-group">
              <button
                type="button"
                className="btn btn-default btn-sm"
                onClick={() => handleExport("csv")}
                title="Tải danh sách đang lọc dạng CSV"
              >
                <i
                  className="fa fa-download"
                  style={{ marginRight: "6px" }}
                ></i>
                Xuất CSV
              </button>
              <button
                type="button"
                className="btn btn-default btn-sm"
                onClick={() => handleExport("geojson")}
                title="Tải danh sách đang lọc dạng GeoJSON"
              >
                <i
                  className="fa fa-download"
                  style={{ marginRight: "6px" }}
                ></i>
                Xuất GeoJSON
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-hover" style={{ margin: 0 }}>
              <thead>
                <tr style={headRowStyle}>
                  <th style={headCellStyle}>Mã tuabin</th>
                  <th style={headCellStyle}>Tên điểm</th>
                  <th style={headCellStyle}>Trang trại</th>
                  <th style={headCellStyle}>Vùng biển</th>
                  <th style={headCellStyle}>Công suất (MW)</th>
                  <th style={headCellStyle}>Loại móng</th>
                  <th style={headCellStyle}>Độ sâu đáy (m)</th>
                  <th style={headCellStyle}>Trạng thái</th>
                  <th style={{ ...headCellStyle, textAlign: "right" }}>
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody style={{ fontSize: "13px" }}>
                {turbines.length === 0 ? (
                  <tr>
                    <td
                      colSpan="9"
                      style={{
                        textAlign: "center",
                        padding: "24px",
                        color: "#94a3b8",
                      }}
                    >
                      {loading
                        ? "Đang tải danh sách tuabin..."
                        : "Chưa có tuabin nào được ghi nhận."}
                    </td>
                  </tr>
                ) : (
                  turbines.map((t) => (
                    <tr key={t.id}>
                      <td
                        style={{
                          ...cellStyle,
                          fontWeight: 600,
                          color: "#0284c7",
                        }}
                      >
                        {t.point_id}
                      </td>
                      <td style={cellStyle}>{t.name || "-"}</td>
                      <td style={cellStyle}>
                        {t.farm_name || `Trang trại #${t.farm}`}
                      </td>
                      <td style={cellStyle}>{t.zone || "-"}</td>
                      <td style={{ ...cellStyle, fontWeight: 600 }}>
                        {t.capacity_mw != null
                          ? `${Number(t.capacity_mw).toFixed(1)} MW`
                          : "-"}
                      </td>
                      <td style={cellStyle}>
                        {t.foundation_type_display || "-"}
                      </td>
                      <td style={cellStyle}>{t.depth_m ?? "-"}</td>
                      <td style={cellStyle}>
                        <span
                          className={`label label-${statusLabelClass(t.status)}`}
                        >
                          {TURBINE_STATUS_LABELS[t.status] || t.status}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>
                        <button
                          onClick={() => handleDeleteTurbine(t.id)}
                          className="btn btn-xs btn-danger"
                          title="Xóa"
                        >
                          <i className="fa fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "12px",
              fontSize: "13px",
              color: "#475569",
            }}
          >
            <span>
              Tổng số: <strong>{turbineCount}</strong> tuabin
            </span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                className="btn btn-default btn-xs"
                disabled={turbinePage === 0}
                onClick={() => setTurbinePage((p) => Math.max(0, p - 1))}
              >
                &larr; Trước
              </button>
              <span>
                Trang {turbinePage + 1} / {totalTurbinePages}
              </span>
              <button
                type="button"
                className="btn btn-default btn-xs"
                disabled={turbinePage >= totalTurbinePages - 1}
                onClick={() => setTurbinePage((p) => p + 1)}
              >
                Sau &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Farm */}
      {showFarmModal && (
        <div style={modalBackdropStyle}>
          <div style={modalStyle}>
            <h3
              style={{
                marginTop: 0,
                marginBottom: "18px",
                fontSize: "18px",
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              {farmForm.id ? "Chỉnh sửa trang trại gió" : "Thêm trang trại gió"}
            </h3>
            {farmModalError && (
              <div
                className="alert alert-danger"
                style={{ borderRadius: "6px", marginBottom: "14px", fontSize: "13px" }}
              >
                {farmModalError}
              </div>
            )}
            <form onSubmit={handleSaveFarm}>
              <div style={gridStyle}>
                <div className="form-group">
                  <label style={labelStyle}>Mã trang trại *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={farmForm.code}
                    onChange={(e) =>
                      setFarmForm({ ...farmForm, code: e.target.value })
                    }
                    required
                    placeholder="Ví dụ: VBB_BAC"
                  />
                </div>
                <div className="form-group">
                  <label style={labelStyle}>Tên trang trại *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={farmForm.name}
                    onChange={(e) =>
                      setFarmForm({ ...farmForm, name: e.target.value })
                    }
                    required
                    placeholder="Ví dụ: Khu vực khảo sát Bắc Vịnh Bắc Bộ"
                  />
                </div>
              </div>
              <div style={gridStyle}>
                <div className="form-group">
                  <label style={labelStyle}>Vùng biển *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={farmForm.location_name}
                    onChange={(e) =>
                      setFarmForm({
                        ...farmForm,
                        location_name: e.target.value,
                      })
                    }
                    required
                    placeholder="Ví dụ: Bắc Vịnh Bắc Bộ"
                  />
                </div>
                <div className="form-group">
                  <label style={labelStyle}>Tổng công suất (MW)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={farmForm.total_capacity_mw}
                    onChange={(e) =>
                      setFarmForm({
                        ...farmForm,
                        total_capacity_mw: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Trạng thái</label>
                <select
                  className="form-control"
                  value={farmForm.status}
                  onChange={(e) =>
                    setFarmForm({ ...farmForm, status: e.target.value })
                  }
                >
                  {Object.entries(FARM_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Mô tả</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={farmForm.description}
                  onChange={(e) =>
                    setFarmForm({ ...farmForm, description: e.target.value })
                  }
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowFarmModal(false)}
                  className="btn btn-default"
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary">
                  Lưu trang trại
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Turbine */}
      {showTurbineModal && (
        <div style={modalBackdropStyle}>
          <div style={modalStyle}>
            <h3
              style={{
                marginTop: 0,
                marginBottom: "18px",
                fontSize: "18px",
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              Thêm tuabin gió
            </h3>
            {turbineModalError && (
              <div
                className="alert alert-danger"
                style={{ borderRadius: "6px", marginBottom: "14px", fontSize: "13px" }}
              >
                {turbineModalError}
              </div>
            )}
            <form onSubmit={handleSaveTurbine}>
              <div style={gridStyle}>
                <div className="form-group">
                  <label style={labelStyle}>Mã tuabin *</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={turbineForm.point_id}
                    onChange={(e) =>
                      setTurbineForm({
                        ...turbineForm,
                        point_id: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label style={labelStyle}>Trang trại gió *</label>
                  <select
                    className="form-control"
                    value={turbineForm.farm}
                    onChange={(e) =>
                      setTurbineForm({ ...turbineForm, farm: e.target.value })
                    }
                    required
                  >
                    <option value="">-- Chọn trang trại --</option>
                    {farms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Tên điểm</label>
                <input
                  type="text"
                  className="form-control"
                  value={turbineForm.name}
                  onChange={(e) =>
                    setTurbineForm({ ...turbineForm, name: e.target.value })
                  }
                />
              </div>
              <div style={gridStyle}>
                <div className="form-group">
                  <label style={labelStyle}>Kinh độ *</label>
                  <input
                    type="number"
                    step="0.000001"
                    className="form-control"
                    value={turbineForm.lon}
                    onChange={(e) =>
                      setTurbineForm({ ...turbineForm, lon: e.target.value })
                    }
                    required
                    placeholder="Ví dụ: 106.38057"
                  />
                </div>
                <div className="form-group">
                  <label style={labelStyle}>Vĩ độ *</label>
                  <input
                    type="number"
                    step="0.000001"
                    className="form-control"
                    value={turbineForm.lat}
                    onChange={(e) =>
                      setTurbineForm({ ...turbineForm, lat: e.target.value })
                    }
                    required
                    placeholder="Ví dụ: 19.25825"
                  />
                </div>
              </div>
              <div style={gridStyle}>
                <div className="form-group">
                  <label style={labelStyle}>Loại móng *</label>
                  <select
                    className="form-control"
                    value={turbineForm.foundation_type}
                    onChange={(e) => {
                      const foundationType = e.target.value;
                      setTurbineForm({
                        ...turbineForm,
                        foundation_type: foundationType,
                        depth_m: foundationType === "FLOATING" ? "0" : "",
                      });
                    }}
                  >
                    {Object.entries(FOUNDATION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label style={labelStyle}>
                    Độ sâu đáy biển (m){isFloating ? "" : " *"}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="form-control"
                    value={turbineForm.depth_m}
                    onChange={(e) =>
                      setTurbineForm({
                        ...turbineForm,
                        depth_m: e.target.value,
                      })
                    }
                    disabled={isFloating}
                    required={!isFloating}
                  />
                  {isFloating && (
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                      Móng nổi không cần nhập độ sâu.
                    </span>
                  )}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Công suất dự kiến (MW) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={turbineForm.capacity_mw}
                  onChange={(e) =>
                    setTurbineForm({
                      ...turbineForm,
                      capacity_mw: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div style={gridStyle}>
                <div className="form-group">
                  <label style={labelStyle}>Tốc độ gió ở 100 m (m/s)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={turbineForm.wind_speed_100m}
                    onChange={(e) =>
                      setTurbineForm({
                        ...turbineForm,
                        wind_speed_100m: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label style={labelStyle}>Hệ số công suất (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={turbineForm.capacity_factor}
                    onChange={(e) =>
                      setTurbineForm({
                        ...turbineForm,
                        capacity_factor: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Trạng thái</label>
                <select
                  className="form-control"
                  value={turbineForm.status}
                  onChange={(e) =>
                    setTurbineForm({ ...turbineForm, status: e.target.value })
                  }
                >
                  {Object.entries(TURBINE_STATUS_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowTurbineModal(false)}
                  className="btn btn-default"
                >
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary">
                  Lưu tuabin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

AdminFarmsRoute.propTypes = {
  config: PropTypes.object,
};

export default AdminFarmsRoute;
