import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { D1Helper } from '@nerdfolio/drizzle-d1-helpers';

// Load environment variables from .dev.vars
config({ path: '.dev.vars' });

// Replace with your D1 database binding name
const crawledDbHelper = D1Helper.get('DB');
const isProd = () => process.env.NODE_ENV === 'production';

const getCredentials = () => {
  const prod = {
    driver: 'd1-http',
    dbCredentials: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
      databaseId: process.env.CLOUDFLARE_DATABASE_ID,
      token: process.env.CLOUDFLARE_D1_TOKEN!
      // ...crawledDbHelper.withCfCredentials(
      //   process.env.CLOUDFLARE_ACCOUNT_ID,
      //   process.env.CLOUDFLARE_D1_TOKEN
      // ).proxyCredentials
    }
  };

  const dev = {
    dbCredentials: {
      url: crawledDbHelper.sqliteLocalFileCredentials.url
    }
  };
  return isProd() ? prod : dev;
};

export default defineConfig({
  schema: './src/lib/db/schema',
  out: './migrations',
  dialect: 'sqlite',
  ...getCredentials()
});
