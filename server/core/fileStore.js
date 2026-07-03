import pg from "pg";
import fs from "fs";

const { Pool } = pg;

let pool = null;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  }
  return pool;
}

export async function saveFileToDB(filename, originalName, mimeType, size, filePath) {
  const p = getPool();
  if (!p) return;
  try {
    const data = fs.readFileSync(filePath);
    await p.query(
      `INSERT INTO uploaded_files(filename, original_name, mime_type, size, data)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(filename) DO UPDATE
       SET data=EXCLUDED.data, original_name=EXCLUDED.original_name,
           mime_type=EXCLUDED.mime_type, size=EXCLUDED.size`,
      [filename, originalName, mimeType, size, data]
    );
  } catch (err) {
    console.warn("[fileStore] saveFileToDB error:", err.message);
  }
}

export async function loadFileFromDB(filename) {
  const p = getPool();
  if (!p) return null;
  try {
    const result = await p.query(
      "SELECT data, mime_type, original_name FROM uploaded_files WHERE filename=$1",
      [filename]
    );
    if (!result.rows.length) return null;
    return result.rows[0];
  } catch (err) {
    console.warn("[fileStore] loadFileFromDB error:", err.message);
    return null;
  }
}

export async function restoreFilesToDisk(uploadDir) {
  const p = getPool();
  if (!p) return 0;
  try {
    const result = await p.query("SELECT filename, data FROM uploaded_files");
    let restored = 0;
    for (const row of result.rows) {
      const dest = `${uploadDir}/${row.filename}`;
      if (!fs.existsSync(dest)) {
        fs.writeFileSync(dest, row.data);
        restored++;
      }
    }
    if (restored > 0) console.log(`[fileStore] Restored ${restored} file(s) from DB to disk.`);
    return restored;
  } catch (err) {
    console.warn("[fileStore] restoreFilesToDisk error:", err.message);
    return 0;
  }
}
