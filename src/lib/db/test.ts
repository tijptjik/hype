// import { drizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '$lib/db/schema';
// import { randomUUID } from 'crypto';
// import { join } from 'path';
// import fs from 'node:fs'

// Ensure test database directory exists
// const TEST_DB_DIR = join(process.cwd(), '.test-dbs');
// fs.mkdirSync(TEST_DB_DIR, { recursive: true });

// Create a unique database file for this test run
// const dbPath = join(TEST_DB_DIR, `test-${randomUUID()}.db`);
// const dbPath = join(TEST_DB_DIR, `test.db`);
// const dbPath = `/home/io/code/ghostsigns/.test-dbs/test.db`;
const dbPath = `http://127.0.0.1:8080`;

console.log(`DATABASE URL: ${dbPath}`);

export const db: LibSQLDatabase<typeof schema> = drizzle(dbPath
  // , { schema }
);