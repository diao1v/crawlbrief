import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

async function runMigrations() {
  const databaseUrl = process.env.CRAWLBRIEF_DATABASE_URL;

  if (!databaseUrl) {
    console.error('CRAWLBRIEF_DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('Connecting to database...');

  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });

  const db = drizzle(pool);

  console.log('Running migrations...');

  await migrate(db, { migrationsFolder: './drizzle' });

  console.log('Migrations completed successfully');

  await pool.end();
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
