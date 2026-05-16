import { Client } from 'pg';
import { readFileSync } from 'fs';

const connectionString = 'postgresql://postgres:Jt2_SecureDb_2026!xK9mP@db.nligtfvaxrwtrhdvwuug.supabase.co:5432/postgres';

async function applyMigrationWithRetry(maxRetries = 10, delayMs = 10000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🎩 Attempt ${attempt}/${maxRetries}...`);

    const client = new Client({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
      connectionTimeoutMillis: 15000,
    });

    try {
      console.log('🔌 Connecting to Supabase database...');
      await client.connect();
      console.log('✅ Connected!');

      const migrationSQL = readFileSync('./supabase_migration.sql', 'utf-8');
      console.log('📄 Executing migration SQL...');

      await client.query(migrationSQL);

      console.log('🎉 Migration completed successfully!');

      const { rows } = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
      `);

      console.log('\n📊 Tables created:');
      rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });

      await client.end();
      console.log('\n✅ Done! You can now use the Supabase dashboard.');
      return true;

    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);
      await client.end().catch(() => {});
      
      if (attempt < maxRetries) {
        console.log(`⏳ Waiting ${delayMs/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error('❌ All attempts failed.');
  return false;
}

applyMigrationWithRetry().then(success => {
  process.exit(success ? 0 : 1);
});
