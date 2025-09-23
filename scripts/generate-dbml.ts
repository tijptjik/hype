// DRIZZLE
import { sqliteGenerate } from 'drizzle-dbml-generator';
// DB
import * as schema from '../src/lib/db/schema';

const out = './schema.dbml';
const relational = true;

console.log('🚀 Generating DBML from Drizzle schema...');

try {
  const dbml = sqliteGenerate({ schema, out, relational });
  console.log('✅ DBML generated successfully!');
  console.log(`📄 Output: ${out}`);
  console.log(`🔗 Relational mode: ${relational ? 'enabled' : 'disabled'}`);
} catch (error) {
  console.error('❌ Error generating DBML:', error);
  process.exit(1);
}
