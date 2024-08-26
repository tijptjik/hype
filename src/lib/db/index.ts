import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@auth/d1-adapter';
import * as schema from './schema';

const client = (database: D1Database) => {
  return drizzle(database, { schema });
};

export default client;
