// @vitest-environment node
// THIRD-PARTY
import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
// DB
import { hub, organisation, project, layer, feature } from '#lib/db/schema/index.js'
// SHARING
import { publicShareVisibility } from '#lib/sharing/visibility.server.js'
// FIXTURES
import { publicationSqlite } from './fixtures/publicationSqlite'
// TYPES
import type { Database } from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'

const host = {
  isCore: true,
  isAdminRequest: true,
  isSuperAdmin: true,
  i18n: {},
} as HubOptsExtended
function fixture() {
  const { sqlite, db } = publicationSqlite({})
  for (const [name, table] of Object.entries({
    hub,
    organisation,
    project,
    layer,
    feature,
  })) {
    sqlite.exec(
      `CREATE TABLE ${name} (${Object.values(getTableColumns(table))
        .map(column => `"${column.name}" ${column.getSQLType()}`)
        .join(',')})`,
    )
  }
  sqlite.exec(`
    INSERT INTO hub(id,code,isPublished,isArchived) VALUES('h','example',1,0);
    INSERT INTO organisation(id,code,hubId,isPublished,isArchived,isCoreInclusive,isHubExclusive) VALUES('o','org','h',1,0,1,0);
    INSERT INTO project(id,code,organisationId,isPublished,isArchived,flags) VALUES('p','project','o',1,0,'{}');
    INSERT INTO layer(id,projectId,organisationId,isPublished,isArchived) VALUES('l','p','o',1,0);
    INSERT INTO feature(id,projectId,organisationId,layerId,isPublished,isArchived,isDraft,isIntangible) VALUES('f','p','o','l',1,0,0,0);
  `)
  const database = db as unknown as Database
  const read = () =>
    database
      .select({ id: feature.id })
      .from(feature)
      .where(publicShareVisibility(database, host).feature)
  return { sqlite, read, database }
}

describe('public sharing visibility', () => {
  it('allows a published feature with consistent public ancestry', async () => {
    const { sqlite, read } = fixture()
    try {
      expect(await read()).toEqual([{ id: 'f' }])
    } finally {
      sqlite.close()
    }
  })
  it.each(['hub', 'organisation', 'project', 'layer', 'feature'])(
    'rejects unpublished %s even for staff',
    async table => {
      const { sqlite, read } = fixture()
      try {
        sqlite.exec(`UPDATE ${table} SET isPublished=0`)
        expect(await read()).toEqual([])
      } finally {
        sqlite.close()
      }
    },
  )
  it.each(['hub', 'organisation', 'project', 'layer', 'feature'])(
    'rejects archived %s',
    async table => {
      const { sqlite, read } = fixture()
      try {
        sqlite.exec(`UPDATE ${table} SET isArchived=1`)
        expect(await read()).toEqual([])
      } finally {
        sqlite.close()
      }
    },
  )
  it.each([
    'UPDATE organisation SET isHubExclusive=1',
    'UPDATE organisation SET isCoreInclusive=0',
    'UPDATE feature SET isDraft=1',
    "UPDATE feature SET organisationId='other'",
    "UPDATE layer SET organisationId='other'",
  ])('rejects hidden or inconsistent scope: %s', async mutation => {
    const { sqlite, read } = fixture()
    try {
      sqlite.exec(mutation)
      expect(await read()).toEqual([])
    } finally {
      sqlite.close()
    }
  })
  it('allows an exclusive organisation only on its own hub', async () => {
    const { sqlite, database } = fixture()
    try {
      sqlite.exec('UPDATE organisation SET isHubExclusive=1')
      const visibility = publicShareVisibility(database, {
        ...host,
        isCore: false,
        code: 'example',
      })
      expect(
        await database
          .select({ id: feature.id })
          .from(feature)
          .where(visibility.feature),
      ).toEqual([{ id: 'f' }])
    } finally {
      sqlite.close()
    }
  })
})
