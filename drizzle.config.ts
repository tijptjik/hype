// import { defineConfig } from 'drizzle-kit';
import type { Config } from 'drizzle-kit';
const {
  DATABASE_URL,
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_DATABASE_ID,
  CLOUDFLARE_D1_TOKEN
} = process.env;

export default DATABASE_URL
  ? ({
      schema: './src/lib/db/schema.ts',
      out: './migrations',
      dialect: 'sqlite',
      dbCredentials: {
        url: DATABASE_URL
      }
    } satisfies Config)
  : ({
      schema: './src/lib/db/schema.ts',
      out: './migrations',
      dialect: 'sqlite',
      driver: 'd1-http',
      dbCredentials: {
        accountId: CLOUDFLARE_ACCOUNT_ID!,
        databaseId: CLOUDFLARE_DATABASE_ID!,
        token: CLOUDFLARE_D1_TOKEN!
      }
    } satisfies Config);
