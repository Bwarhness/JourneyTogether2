import fs from 'fs';
import path from 'path';
import { getDb } from '../config/database.js';

async function initDb() {
  const db = getDb();

  const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Split by semicolons and execute each statement
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('PRAGMA'));

  console.log(`Initializing database...`);

  for (const statement of statements) {
    try {
      db.exec(statement);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Ignore "already exists" errors for triggers and indexes
      if (!message.includes('already exists')) {
        console.error(`Error executing: ${statement.slice(0, 60)}...`);
        console.error(message);
      }
    }
  }

  console.log('Database initialized successfully.');
}

initDb().catch(console.error);
