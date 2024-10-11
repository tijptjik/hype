import {
  account,
  layer,
  layerI18n,
  feature,
  project,
  projectI18n,
  projectRole,
  organisation,
  organisationI18n,
  organisationRole,
  session,
  user
} from './schema';
import connect from '../../lib/db';

import userJson from './data/users.json';
import accountJson from './data/accounts.json';
import sessionJson from './data/sessions.json';
import projectJson from './data/projects.json';
import projectI18nJson from './data/projectsI18n.json';
import projectRoleJson from './data/projectRoles.json';
import organisationJson from './data/organisations.json';
import organisationI18nJson from './data/organisationsI18n.json';
import organisationRoleJson from './data/organisationRoles.json';
import layerJson from './data/layers.json';
import layerI18nJson from './data/layersI18n.json';
import featureStreetnamesJson from './data/features-streetnames.json';
import featureHKGhostsignsJson from './data/features-hkghostsigns.json';
import type { DrizzleD1Database } from 'drizzle-orm/d1/driver';
import { count, getTableName } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core/table';
import type { SQLiteInsertValue } from 'drizzle-orm/sqlite-core';

// Mapping between JSON files and Tables
const seedBank = {
  user: {
    name: 'Users',
    table: user,
    data: userJson,
    chunk: 0
  },
  account: {
    name: 'Accounts',
    table: account,
    data: accountJson,
    chunk: 0
  },
  session: {
    name: 'Sessions',
    table: session,
    data: sessionJson,
    chunk: 0
  },
  organisation: {
    name: 'Organisations',
    table: organisation,
    data: organisationJson,
    chunk: 0
  },
  organisationI18n: {
    name: 'OrganisationI18n',
    table: organisationI18n,
    data: organisationI18nJson,
    chunk: 0
  },
  organisationRole: {
    name: 'OrganisationRoles',
    table: organisationRole,
    data: organisationRoleJson,
    chunk: 0
  },
  project: {
    name: 'Projects',
    table: project,
    data: projectJson,
    chunk: 0
  },
  projectI18n: {
    name: 'ProjectI18n',
    table: projectI18n,
    data: projectI18nJson,
    chunk: 0
  },
  projectRole: {
    name: 'ProjectRoles',
    table: projectRole,
    data: projectRoleJson,
    chunk: 0
  },
  layer: {
    name: 'Layers',
    table: layer,
    data: layerJson,
    chunk: 0
  },
  layerI18n: {
    name: 'LayerI18n',
    table: layerI18n,
    data: layerI18nJson,
    chunk: 0
  },
  featureStreetnames: {
    name: 'Features::StreetNames',
    table: feature,
    data: featureStreetnamesJson,
    chunk: 0,
    partial: true
  },
  featureHKGhostsigns: {
    name: 'Features::HKGhostSigns',
    table: feature,
    data: featureHKGhostsignsJson,
    chunk: 8,
    partial: true
  }
};

const chunkArray = <T>(array: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

// Function to perform database operations
async function insertData(
  db: DrizzleD1Database,
  name: string,
  table: SQLiteTable,
  data: SQLiteInsertValue<SQLiteTable>[],
  chunkSize: number
) {
  let insertedCount = 0;
  if (chunkSize > 0) {
    const chunks = chunkArray(data, chunkSize);
    await Promise.all(
      chunks.map(async (dataToInsert) => {
        const inserted = await db.insert(table).values(dataToInsert);
        insertedCount = insertedCount + inserted.meta.changes;
      })
    );
  } else {
    const inserted = await db.insert(table).values(data);
    insertedCount = inserted.meta.changes;
  }
  console.info(`> ${name}`.padEnd(32), insertedCount);
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
    Object.values(seedBank).map((val) => console.info(val.data));
  }

  // Combine partial and non-partial data
  const SuperSeedBank = Object.values(seedBank).reduce((acc, member) => {
    if (member.partial === true) {
      const tableName = getTableName(member.table);
      const baseName = member.name.split('::')[0];
      if (!acc[tableName]) {
        acc[tableName] = {
          name: baseName,
          table: member.table,
          data: [],
          chunk: 0
        };
      }
      acc[tableName].data = acc[tableName].data.concat(member.data);
      acc[tableName].chunk += member.chunk || 0;
    } else {
      acc[getTableName(member.table)] = member;
    }
    return acc;
  }, {} as Record<string, typeof seedBank[keyof typeof seedBank]>);


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

    for (const item of Object.values(SuperSeedBank)) {
      // DB : Only insert data if there is no data present in the table
      // @ts-ignore
      if (await isEmpty(db, item.table)) {
        if (!hasSeedingStarted) {
          console.info('\n🌱 SEEDING\n');
          hasSeedingStarted = true;
        }
        // @ts-ignore
        await insertData(db, item.name, item.table, item.data, item.chunk);
      } else {
        if (hasSeedingStarted) {
          console.info(`> ${item.name} skipped`);
        }
      }
    }
    if (hasSeedingStarted) {
      console.info('\n🌼 ALL FLOURISHING\n');
    }
  }
}
