// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { hub, organisation, project, layer } from '#lib/db/schema/index.js'
import { publicationSqlite } from './fixtures/publicationSqlite'
import { publicEmbedLayers } from '#lib/embed/server.js'
import { parseEmbedConfig } from '#lib/embed/config.js'
import type { Database } from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'

const core: HubOptsExtended = {
  isCore: true,
  isAdminRequest: false,
  isSuperAdmin: false,
  i18n: {},
}

function fixture() {
  const { sqlite, db } = publicationSqlite({})
  for (const [name, table] of Object.entries({ hub, organisation, project, layer })) {
    sqlite.exec(
      `CREATE TABLE ${name} (${Object.values(getTableColumns(table))
        .map(column => `"${column.name}" ${column.getSQLType()}`)
        .join(',')})`,
    )
  }
  sqlite.exec(`
    INSERT INTO hub(id,code,domain,isPublished,isArchived) VALUES('h','test','test.hk',1,0);
    INSERT INTO organisation(id,code,hubId,isPublished,isArchived,isCoreInclusive,isHubExclusive) VALUES('o','org','h',1,0,1,0),('other','other','h',1,0,1,0);
    INSERT INTO project(id,code,organisationId,isPublished,isArchived,flags) VALUES('p','project','o',1,0,'{}'),('p2','other','other',1,0,'{}');
    INSERT INTO layer(id,projectId,organisationId,isPublished,isArchived,historicalSourceLayerId) VALUES('a','p','o',1,0,NULL),('b','p','o',1,0,NULL),('c','p2','other',1,0,NULL),('draft','p','o',0,0,NULL);
  `)
  return { sqlite, db: db as unknown as Database }
}

describe('embed SQL visibility boundary', () => {
  it('unions mixed scopes without leaking unrelated or draft layers', async () => {
    const { db, sqlite } = fixture()
    try {
      const config = parseEmbedConfig(new URLSearchParams('projects=p&layers=c,draft'))
      const rows = await publicEmbedLayers(db, config, core)
      expect(rows.map(row => row.id).sort()).toEqual(['a', 'b', 'c'])
      const missing = await publicEmbedLayers(
        db,
        parseEmbedConfig(new URLSearchParams('layers=missing')),
        core,
      )
      expect(missing).toEqual([])
    } finally {
      sqlite.close()
    }
  })
  it('preserves exclusions while allowing future public descendants', async () => {
    const { db, sqlite } = fixture()
    try {
      const config = parseEmbedConfig(
        new URLSearchParams('projects=p&exclude=b&active=a'),
      )
      expect(await publicEmbedLayers(db, config, core)).toEqual([{ id: 'a' }])
      sqlite.exec(
        "INSERT INTO layer(id,projectId,organisationId,isPublished,isArchived) VALUES('future','p','o',1,0)",
      )
      expect(
        (await publicEmbedLayers(db, config, core)).map(row => row.id).sort(),
      ).toEqual(['a', 'future'])
    } finally {
      sqlite.close()
    }
  })
  it.each(['hub', 'organisation', 'project', 'layer'])(
    'checks %s publication even for super-admin previews',
    async table => {
      const { db, sqlite } = fixture()
      try {
        sqlite.exec(`UPDATE ${table} SET isPublished=0`)
        const rows = await publicEmbedLayers(
          db,
          parseEmbedConfig(new URLSearchParams('layers=a')),
          { ...core, isAdminRequest: true, isSuperAdmin: true },
        )
        expect(rows).toEqual([])
      } finally {
        sqlite.close()
      }
    },
  )
  it('honours host exclusivity and rejects inconsistent ancestry', async () => {
    const { db, sqlite } = fixture()
    try {
      sqlite.exec("UPDATE organisation SET isHubExclusive=1 WHERE id='o'")
      const config = parseEmbedConfig(new URLSearchParams('layers=a'))
      expect(await publicEmbedLayers(db, config, core)).toEqual([])
      expect(
        await publicEmbedLayers(db, config, { ...core, isCore: false, code: 'test' }),
      ).toEqual([{ id: 'a' }])
      sqlite.exec("UPDATE layer SET organisationId='other' WHERE id='a'")
      expect(
        await publicEmbedLayers(db, config, { ...core, isCore: false, code: 'test' }),
      ).toEqual([])
    } finally {
      sqlite.close()
    }
  })
  it('keeps large selections below D1 binding limits', () => {
    const { db, sqlite } = fixture()
    try {
      const config = parseEmbedConfig(
        new URLSearchParams({
          exclude: Array.from({ length: 500 }, (_, i) => `excluded-${i}`).join(','),
          layers: Array.from({ length: 500 }, (_, i) => `layer-${i}`).join(','),
        }),
      )
      expect(publicEmbedLayers(db, config, core).toSQL().params.length).toBeLessThan(30)
    } finally {
      sqlite.close()
    }
  })
})
