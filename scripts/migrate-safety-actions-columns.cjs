const mysql = require('mysql2/promise');
const fs = require('fs');

async function run() {
  const pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3308,
    user: 'root',
    password: '',
    database: 'mhchub'
  });

  try {
    console.log("Adding columns source_module and source_id to safety_actions...");
    
    // Add columns if they don't exist
    const [columns] = await pool.query('SHOW COLUMNS FROM safety_actions');
    const columnNames = columns.map(c => c.Field);
    
    if (!columnNames.includes('source_module')) {
      await pool.query(`ALTER TABLE safety_actions ADD COLUMN source_module VARCHAR(50) DEFAULT NULL`);
      console.log("Added source_module");
    } else {
      console.log("source_module already exists");
    }
    
    if (!columnNames.includes('source_id')) {
      await pool.query(`ALTER TABLE safety_actions ADD COLUMN source_id VARCHAR(50) DEFAULT NULL`);
      console.log("Added source_id");
    } else {
      console.log("source_id already exists");
    }

    console.log("Migration completed.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await pool.end();
  }
}

run();
