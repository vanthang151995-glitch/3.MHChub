const mysql = require('mysql2/promise');

async function run() {
  const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'mhchub',
    port: 3308,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    console.log("Adding columns to safety_warnings table...");
    
    const cols = [
      "ADD COLUMN production_line VARCHAR(255) NULL",
      "ADD COLUMN machine_name VARCHAR(255) NULL",
      "ADD COLUMN location_detail VARCHAR(1000) NULL",
      "ADD COLUMN detected_at DATETIME NULL",
      "ADD COLUMN coordinator VARCHAR(255) NULL",
      "ADD COLUMN additional_notes TEXT NULL",
      "ADD COLUMN additional_notes_i18n_json JSON NULL"
    ];

    for (const col of cols) {
      try {
        await pool.query(`ALTER TABLE safety_warnings ${col}`);
        console.log(`Success: ${col}`);
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
          console.log(`Column already exists (skipping): ${col}`);
        } else {
          console.error(`Error adding column: ${col}`, e.message);
        }
      }
    }

    console.log("Database schema updated successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await pool.end();
  }
}

run();
