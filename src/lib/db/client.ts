import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@auth/d1-adapter';

const db = (database: D1Database) => {
  return drizzle(database);
};

export default db;
