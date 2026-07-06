/**
 * placeStore.js
 * Quản lý danh sách địa điểm nội bộ (không liên quan đến QR locations)
 * JSON fallback only (MySQL optional extension sau)
 *
 * status: "active"   — đã duyệt, hiện trong form
 *         "pending"  — chờ admin duyệt (người dùng tự thêm qua form)
 *         "rejected" — đã từ chối (ẩn, lưu lịch sử)
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomBytes } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "../data/places.json");

const newId = () => `pl-${randomBytes(6).toString("hex")}`;
const now   = () => new Date().toISOString();

function readData() {
  if (!existsSync(DATA_FILE)) return { places: [] };
  try { return JSON.parse(readFileSync(DATA_FILE, "utf8")); }
  catch { return { places: [] }; }
}

function writeData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

/** Kiểm tra place có "active" không (tương thích cả field status lẫn active cũ) */
function isActive(p) {
  if (p.status) return p.status === "active";
  return p.active !== false;
}

export function createPlaceStore() {
  return {
    /** Lấy tất cả địa điểm đã duyệt (active) — dùng trong form */
    async listPlaces() {
      const { places } = readData();
      return (places || [])
        .filter(p => isActive(p))
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name, "vi"));
    },

    /** Lấy tất cả (bao gồm pending/rejected/inactive) — chỉ dùng trong admin */
    async listAllPlaces() {
      const { places } = readData();
      return (places || [])
        .sort((a, b) => {
          // Pending lên đầu
          const so = { pending:0, active:1, rejected:2 };
          const sa = so[a.status] ?? 1;
          const sb = so[b.status] ?? 1;
          if (sa !== sb) return sa - sb;
          return (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name, "vi");
        });
    },

    /** Đếm số địa điểm đang chờ duyệt */
    async countPending() {
      const { places } = readData();
      return (places || []).filter(p => p.status === "pending").length;
    },

    /** Tạo mới (admin) — tự động duyệt luôn */
    async createPlace({ name, description = "", factoryCode = "", sortOrder = 999 }) {
      if (!name || !String(name).trim()) throw new Error("Tên địa điểm không được trống");
      const data = readData();
      const places = data.places || [];
      const trimmed = String(name).trim();
      if (places.some(p => isActive(p) && p.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(`Địa điểm "${trimmed}" đã tồn tại`);
      }
      const place = {
        id: newId(),
        name: trimmed,
        description: String(description || "").trim(),
        factoryCode: String(factoryCode || "").trim(),
        sortOrder: Number(sortOrder) || 999,
        status: "active",
        active: true,
        createdAt: now(),
        updatedAt: now(),
      };
      places.push(place);
      writeData({ places });
      return place;
    },

    /** Cập nhật */
    async updatePlace(id, fields) {
      const data = readData();
      const places = data.places || [];
      const idx = places.findIndex(p => p.id === id);
      if (idx === -1) throw new Error("Không tìm thấy địa điểm");
      if (fields.name) {
        const trimmed = String(fields.name).trim();
        const dup = places.find((p, i) => i !== idx && isActive(p) && p.name.toLowerCase() === trimmed.toLowerCase());
        if (dup) throw new Error(`Địa điểm "${trimmed}" đã tồn tại`);
      }
      // Đồng bộ active theo status nếu được set
      const newStatus = fields.status ?? places[idx].status;
      const newActive = newStatus === "active" ? true : false;
      places[idx] = { ...places[idx], ...fields, id, status: newStatus, active: newActive, updatedAt: now() };
      writeData({ places });
      return places[idx];
    },

    /** Phê duyệt (pending → active) */
    async approvePlace(id) {
      const data = readData();
      const places = data.places || [];
      const idx = places.findIndex(p => p.id === id);
      if (idx === -1) throw new Error("Không tìm thấy địa điểm");
      places[idx] = { ...places[idx], status: "active", active: true, approvedAt: now(), updatedAt: now() };
      writeData({ places });
      return places[idx];
    },

    /** Từ chối (pending → rejected) */
    async rejectPlace(id) {
      const data = readData();
      const places = data.places || [];
      const idx = places.findIndex(p => p.id === id);
      if (idx === -1) throw new Error("Không tìm thấy địa điểm");
      places[idx] = { ...places[idx], status: "rejected", active: false, rejectedAt: now(), updatedAt: now() };
      writeData({ places });
      return places[idx];
    },

    /** Xoá mềm (active → rejected) */
    async deletePlace(id) {
      const data = readData();
      const places = data.places || [];
      const idx = places.findIndex(p => p.id === id);
      if (idx === -1) throw new Error("Không tìm thấy địa điểm");
      places[idx] = { ...places[idx], status: "rejected", active: false, updatedAt: now() };
      writeData({ places });
      return { ok: true };
    },

    /**
     * Gợi ý / tự động thêm địa điểm mới khi người dùng nhập tên mới trong form.
     * Nếu đã tồn tại (active) → trả về bản ghi cũ.
     * Nếu mới → tạo với status:"pending" (chờ admin duyệt).
     */
    async suggestPlace(name) {
      if (!name || !String(name).trim()) throw new Error("Tên không hợp lệ");
      const data = readData();
      const places = data.places || [];
      const trimmed = String(name).trim();

      // Đã tồn tại và đang active
      const existing = places.find(p => isActive(p) && p.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) return { place: existing, created: false };

      // Đã tồn tại nhưng pending (tránh trùng)
      const pending = places.find(p => p.status === "pending" && p.name.toLowerCase() === trimmed.toLowerCase());
      if (pending) return { place: pending, created: false, pending: true };

      const maxSort = places.reduce((m, p) => Math.max(m, p.sortOrder || 0), 0);
      const place = {
        id: newId(),
        name: trimmed,
        description: "",
        factoryCode: "",
        sortOrder: maxSort + 1,
        status: "pending",
        active: false,
        createdAt: now(),
        updatedAt: now(),
      };
      places.push(place);
      writeData({ places });
      return { place, created: true, pending: true };
    },
  };
}
