import { account, geoProject, session, user } from './schema';
import connect from '../../lib/db';

import userJson from './data/user.json';
import accountJson from './data/account.json';
import sessionJson from './data/session.json';
import geoProjectJson from './data/geoProject.json';
import type { DrizzleD1Database } from 'drizzle-orm/d1/driver';
import { count } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core/table';
import type { SQLiteInsertValue } from 'drizzle-orm/sqlite-core';

// Mapping between JSON files and Tables
const seedBank = {
  user: {
    name: 'Users',
    table: user,
    data: userJson
  },
  account: {
    name: 'Accounts',
    table: account,
    data: accountJson
  },
  session: {
    name: 'Sessions',
    table: session,
    data: sessionJson
  },
  geoProject: {
    name: 'GeoProjects',
    table: geoProject,
    data: geoProjectJson
  }
};

// Function to perform database operations
async function insertData(
  db: DrizzleD1Database,
  name: string,
  table: SQLiteTable,
  data: SQLiteInsertValue<SQLiteTable>[]
) {
  const inserted = await db.insert(table).values(data);
  console.log(`> ${name} inserted:`, inserted.meta.changes);
}

type CountResult = {
  count: number;
};

const takeUniqueOrThrow = <T extends unknown[]>(values: T): T[number] => {
  if (values.length !== 1) throw new Error('Found non unique or absent value');
  return values[0]!;
};

async function isEmpty(db: DrizzleD1Database, table: SQLiteTable) {
  const result: CountResult = await db
    .select({ count: count() })
    .from(table)
    .then(takeUniqueOrThrow);
  return result.count === 0;
}

export default async function seed(printData: boolean = false) {
  if (printData) {
    Object.values(seedBank).map((val) => console.log(val.data));
  }

  if (process.env.VITE_WRANGLER_ENV === 'local') {
    // This is an ugly hack to avoid Vite loading in the wrangler dep regardless
    // of the conditional import, and throwing errors when building for CF workers
    // as wrangler itself has node requirements :doh:
    const wrangler = 'wrangler';
    // When developing, this hook will add proxy objects to the `platform` object
    // which will emulate any bindings defined in `wrangler.toml`.
    const { getPlatformProxy } = await import(/* @vite-ignore */ wrangler);
    const platform = await getPlatformProxy();
    const db = connect(platform.env.DB);

    let hasSeedingStarted = false;

    for (const item of Object.values(seedBank)) {
      // DB : Only insert data if there is no data present in the table
      // @ts-ignore
      if (await isEmpty(db, item.table)) {
        if (!hasSeedingStarted) {
          console.log('\n🌱 SEEDING START');
          hasSeedingStarted = true;
        }
        // @ts-ignore
        await insertData(db, item.name, item.table, item.data);
      } else {
        if (hasSeedingStarted) {
          console.log(`> ${item.name} skipped`);
        }
      }
    }
    if (hasSeedingStarted) {
      console.log('🌼 SEEDING DONE\n');
    }
  }
}
