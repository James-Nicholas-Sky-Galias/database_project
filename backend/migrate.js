require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jomitch_laundry_shop'
  });

  await db.execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255),
      ran_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const [ran] = await db.execute('SELECT filename FROM migrations');
  const ranFiles = ran.map(r => r.filename);

  const migrationsDir = path.join(__dirname, '../schema/migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (ranFiles.includes(file)) {
      console.log(`Skipping ${file} (already ran)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Running ${file}...`);
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const statement of statements) {
      await db.execute(statement);
    }
    await db.execute('INSERT INTO migrations (filename) VALUES (?)', [file]);
    console.log(`Done: ${file}`);
  }

  console.log('All migrations up to date!');
  await db.end();
}

migrate().catch(console.error);