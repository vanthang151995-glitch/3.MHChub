/**
 * orgStructureStore.js
 * Quản lý cấu trúc tổ chức: Nhà máy → Khối → Bộ phận
 * JSON fallback + MySQL optional
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomBytes } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "../data/org-structure.json");

const newId = (prefix = "item") => `${prefix}-${randomBytes(6).toString("hex")}`;
const now = () => new Date().toISOString();

/* ── JSON persistence ──────────────────────────────────────────── */
function readData() {
  if (!existsSync(DATA_FILE)) return { factories: [], divisions: [], departments: [] };
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { factories: [], divisions: [], departments: [] };
  }
}

function writeData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

/* ── MySQL helpers (optional) ──────────────────────────────────── */
async function tryMysql(pool, fn) {
  if (!pool) return null;
  try { return await fn(pool); } catch { return null; }
}

async function ensureMysqlSchema(pool) {
  if (!pool) return;
  // Table: org_factories
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_factories (
      id VARCHAR(64) PRIMARY KEY,
      code VARCHAR(20) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      address VARCHAR(255),
      sort_order INT DEFAULT 0,
      active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Extend safety_divisions
  const divCols = [
    ["factory_codes", "JSON NULL"],
    ["color", "VARCHAR(20) NULL"],
    ["full_name", "VARCHAR(200) NULL"]
  ];
  for (const [col, def] of divCols) {
    try {
      await pool.query(`ALTER TABLE safety_divisions ADD COLUMN ${col} ${def}`);
    } catch { /* already exists */ }
  }

  // Extend safety_departments
  const deptCols = [
    ["factory_codes", "JSON NULL"],
    ["full_name", "VARCHAR(200) NULL"],
    ["color", "VARCHAR(20) NULL"],
    ["email", "VARCHAR(100) NULL"],
    ["phone", "VARCHAR(50) NULL"]
  ];
  for (const [col, def] of deptCols) {
    try {
      await pool.query(`ALTER TABLE safety_departments ADD COLUMN ${col} ${def}`);
    } catch { /* already exists */ }
  }
}

async function syncToMysql(pool, data) {
  if (!pool) return;
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  for (const f of data.factories) {
    await pool.query(
      `INSERT INTO org_factories (id, code, name, description, address, sort_order, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description),
       address=VALUES(address), sort_order=VALUES(sort_order), active=VALUES(active), updated_at=VALUES(updated_at)`,
      [f.id, f.code, f.name, f.description||"", f.address||"", f.sortOrder||0, f.active?1:0, ts, ts]
    );
  }
  for (const d of data.divisions) {
    await pool.query(
      `UPDATE safety_divisions SET factory_codes=?, color=?, full_name=?, updated_at=? WHERE code=?`,
      [JSON.stringify(d.factoryCodes||[]), d.color||null, d.name||null, ts, d.code]
    );
  }
  for (const d of data.departments) {
    await pool.query(
      `UPDATE safety_departments SET factory_codes=?, full_name=?, updated_at=? WHERE code=?`,
      [JSON.stringify(d.factoryCodes||[]), d.fullName||d.name||null, ts, d.code]
    );
  }
}

/* ══════════════════════════════════════════
   STORE FACTORY
══════════════════════════════════════════ */
export function createOrgStructureStore(pool = null) {

  // Migrate schema on startup
  (async () => {
    try {
      await ensureMysqlSchema(pool);
      // Seed MySQL from JSON if tables empty
      if (pool) {
        const [rows] = await pool.query("SELECT COUNT(*) AS cnt FROM org_factories").catch(() => [[{ cnt: -1 }]]);
        if (rows[0].cnt === 0) {
          const data = readData();
          await syncToMysql(pool, data).catch(() => {});
        }
      }
    } catch { /* skip */ }
  })();

  /* ── Factories ──────────────────────────────── */
  async function listFactories() {
    const mysql = await tryMysql(pool, async (p) => {
      const [rows] = await p.query("SELECT * FROM org_factories ORDER BY sort_order ASC, code ASC");
      return rows.map(r => ({
        id: r.id, code: r.code, name: r.name,
        description: r.description || "", address: r.address || "",
        sortOrder: r.sort_order, active: !!r.active,
        createdAt: r.created_at, updatedAt: r.updated_at
      }));
    });
    if (mysql) return mysql;
    return readData().factories;
  }

  async function createFactory(body) {
    const { code, name, description = "", address = "", sortOrder = 0 } = body;
    if (!code || !name) throw new Error("code và name là bắt buộc");
    const item = { id: newId("fy"), code: code.trim().toUpperCase(), name: name.trim(), description, address, sortOrder, active: true, createdAt: now(), updatedAt: now() };
    // JSON
    const data = readData();
    if (data.factories.find(f => f.code === item.code)) throw new Error(`Nhà máy '${item.code}' đã tồn tại`);
    data.factories.push(item);
    writeData(data);
    // MySQL
    await tryMysql(pool, async (p) => {
      const ts = item.createdAt.replace("T"," ").slice(0,19);
      await p.query(
        `INSERT INTO org_factories (id,code,name,description,address,sort_order,active,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)`,
        [item.id,item.code,item.name,item.description,item.address,item.sortOrder,ts,ts]
      );
    });
    return item;
  }

  async function updateFactory(id, body) {
    const data = readData();
    const idx = data.factories.findIndex(f => f.id === id || f.code === id);
    if (idx < 0) throw new Error("Không tìm thấy nhà máy");
    const prev = data.factories[idx];
    const updated = { ...prev, ...body, id: prev.id, code: (body.code || prev.code).trim().toUpperCase(), updatedAt: now() };
    data.factories[idx] = updated;
    writeData(data);
    await tryMysql(pool, async (p) => {
      await p.query(
        `UPDATE org_factories SET code=?,name=?,description=?,address=?,sort_order=?,active=?,updated_at=? WHERE id=?`,
        [updated.code,updated.name,updated.description||"",updated.address||"",updated.sortOrder||0,updated.active?1:0,updated.updatedAt.replace("T"," ").slice(0,19),prev.id]
      );
    });
    return updated;
  }

  async function deleteFactory(id) {
    const data = readData();
    const idx = data.factories.findIndex(f => f.id === id || f.code === id);
    if (idx < 0) throw new Error("Không tìm thấy nhà máy");
    const [removed] = data.factories.splice(idx, 1);
    writeData(data);
    await tryMysql(pool, async (p) => { await p.query("DELETE FROM org_factories WHERE id=?", [removed.id]); });
    return { ok: true };
  }

  /* ── Divisions ──────────────────────────────── */
  async function listDivisions() {
    const mysql = await tryMysql(pool, async (p) => {
      const [rows] = await p.query("SELECT * FROM safety_divisions ORDER BY sort_order ASC, code ASC");
      return rows.map(r => ({
        id: r.id || `div-${r.code.toLowerCase()}`, code: r.code, name: r.name,
        description: r.description || "", color: r.color || "#64748b",
        factoryCodes: r.factory_codes ? (typeof r.factory_codes === "string" ? JSON.parse(r.factory_codes) : r.factory_codes) : [],
        sortOrder: r.sort_order, active: !!r.active,
        createdAt: r.created_at, updatedAt: r.updated_at
      }));
    });
    if (mysql && mysql.length > 0) return mysql;
    return readData().divisions;
  }

  async function updateDivision(id, body) {
    const data = readData();
    const idx = data.divisions.findIndex(d => d.id === id || d.code === id);
    if (idx < 0) throw new Error("Không tìm thấy khối");
    const prev = data.divisions[idx];
    const updated = { ...prev, ...body, id: prev.id, code: prev.code, updatedAt: now() };
    data.divisions[idx] = updated;
    writeData(data);
    await tryMysql(pool, async (p) => {
      await p.query(
        `UPDATE safety_divisions SET factory_codes=?,color=?,description=?,updated_at=? WHERE code=?`,
        [JSON.stringify(updated.factoryCodes||[]),updated.color||null,updated.description||null,updated.updatedAt.replace("T"," ").slice(0,19),prev.code]
      );
    });
    return updated;
  }

  async function createDivision(body) {
    const { code, name, description = "", color = "#64748b", factoryCodes = [], sortOrder = 0 } = body;
    if (!code || !name) throw new Error("code và name là bắt buộc");
    const item = { id: `div-${code.toLowerCase()}`, code: code.trim().toUpperCase(), name: name.trim(), description, color, factoryCodes, sortOrder, active: true, createdAt: now(), updatedAt: now() };
    const data = readData();
    if (data.divisions.find(d => d.code === item.code)) throw new Error(`Khối '${item.code}' đã tồn tại`);
    data.divisions.push(item);
    writeData(data);
    await tryMysql(pool, async (p) => {
      const ts = item.createdAt.replace("T"," ").slice(0,19);
      await p.query(
        `INSERT INTO safety_divisions (code,name,description,sort_order,active,factory_codes,color,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name),factory_codes=VALUES(factory_codes),color=VALUES(color),updated_at=VALUES(updated_at)`,
        [item.code,item.name,item.description,item.sortOrder,JSON.stringify(item.factoryCodes),item.color,ts,ts]
      );
    });
    return item;
  }

  async function deleteDivision(id) {
    const data = readData();
    const idx = data.divisions.findIndex(d => d.id === id || d.code === id);
    if (idx < 0) throw new Error("Không tìm thấy khối");
    // Check no departments under this division
    const code = data.divisions[idx].code;
    if (data.departments.some(d => d.divisionCode === code)) throw new Error("Không thể xóa khối còn bộ phận. Xóa/chuyển bộ phận trước.");
    data.divisions.splice(idx, 1);
    writeData(data);
    return { ok: true };
  }

  /* ── Departments ────────────────────────────── */
  async function listDepartments() {
    const mysql = await tryMysql(pool, async (p) => {
      const [rows] = await p.query("SELECT * FROM safety_departments ORDER BY division_code ASC, code ASC");
      return rows.map(r => ({
        id: r.id || `dept-${r.code.toLowerCase()}`, code: r.code, name: r.name,
        fullName: r.full_name || r.name, divisionCode: r.division_code,
        factoryCodes: r.factory_codes ? (typeof r.factory_codes === "string" ? JSON.parse(r.factory_codes) : r.factory_codes) : [],
        managerName: r.manager_name || "", headcount: r.headcount || 0,
        safetyTarget: r.safety_target || 95, sortOrder: r.sort_order || 0,
        active: !!r.active, email: r.email || "", phone: r.phone || "",
        createdAt: r.created_at, updatedAt: r.updated_at
      }));
    });
    if (mysql && mysql.length > 0) return mysql;
    return readData().departments;
  }

  async function createDepartment(body) {
    const { code, name, fullName, divisionCode, factoryCodes = [], managerName = "", headcount = 0, safetyTarget = 95, sortOrder = 0 } = body;
    if (!code || !name || !divisionCode) throw new Error("code, name và divisionCode là bắt buộc");
    const item = {
      id: `dept-${code.toLowerCase().replace(/[^a-z0-9]/g,"-")}`,
      code: code.trim().toUpperCase(), name: name.trim(),
      fullName: fullName || name.trim(), divisionCode: divisionCode.trim().toUpperCase(),
      factoryCodes, managerName, headcount, safetyTarget, sortOrder,
      active: true, email: body.email||"", phone: body.phone||"",
      createdAt: now(), updatedAt: now()
    };
    const data = readData();
    if (data.departments.find(d => d.code === item.code)) throw new Error(`Bộ phận '${item.code}' đã tồn tại`);
    data.departments.push(item);
    writeData(data);
    await tryMysql(pool, async (p) => {
      const ts = item.createdAt.replace("T"," ").slice(0,19);
      await p.query(
        `INSERT INTO safety_departments (code,name,full_name,division_code,manager_name,headcount,safety_target,active,factory_codes,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,1,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name),full_name=VALUES(full_name),factory_codes=VALUES(factory_codes),updated_at=VALUES(updated_at)`,
        [item.code,item.name,item.fullName,item.divisionCode,item.managerName,item.headcount,item.safetyTarget,JSON.stringify(item.factoryCodes),ts,ts]
      );
    });
    return item;
  }

  async function updateDepartment(id, body) {
    const data = readData();
    const idx = data.departments.findIndex(d => d.id === id || d.code === id);
    if (idx < 0) throw new Error("Không tìm thấy bộ phận");
    const prev = data.departments[idx];
    const updated = { ...prev, ...body, id: prev.id, code: prev.code, updatedAt: now() };
    data.departments[idx] = updated;
    writeData(data);
    await tryMysql(pool, async (p) => {
      await p.query(
        `UPDATE safety_departments SET name=?,full_name=?,division_code=?,factory_codes=?,manager_name=?,headcount=?,safety_target=?,active=?,updated_at=? WHERE code=?`,
        [updated.name,updated.fullName||updated.name,updated.divisionCode,JSON.stringify(updated.factoryCodes||[]),updated.managerName||"",updated.headcount||0,updated.safetyTarget||95,updated.active?1:0,updated.updatedAt.replace("T"," ").slice(0,19),prev.code]
      );
    });
    return updated;
  }

  async function deleteDepartment(id) {
    const data = readData();
    const idx = data.departments.findIndex(d => d.id === id || d.code === id);
    if (idx < 0) throw new Error("Không tìm thấy bộ phận");
    data.departments.splice(idx, 1);
    writeData(data);
    return { ok: true };
  }

  /* ── Full structure tree ─────────────────────── */
  async function getStructure() {
    const [factories, divisions, departments] = await Promise.all([listFactories(), listDivisions(), listDepartments()]);
    return {
      factories: factories.filter(f => f.active),
      divisions: divisions.filter(d => d.active),
      departments: departments.filter(d => d.active),
      // Convenience: tree per factory
      tree: factories.filter(f => f.active).map(factory => ({
        ...factory,
        divisions: divisions.filter(d => d.active && (d.factoryCodes || []).includes(factory.code)).map(div => ({
          ...div,
          departments: departments.filter(dept => dept.active && dept.divisionCode === div.code && (dept.factoryCodes || []).includes(factory.code))
        }))
      }))
    };
  }

  return {
    listFactories, createFactory, updateFactory, deleteFactory,
    listDivisions, createDivision, updateDivision, deleteDivision,
    listDepartments, createDepartment, updateDepartment, deleteDepartment,
    getStructure,
  };
}
