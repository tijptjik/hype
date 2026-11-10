// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// DRIZZLE
import { getTableColumns, getTableName } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
// TESTING
import { expect, it } from 'vitest'
// SCHEMA AND SNAPSHOT
import * as schema from '#lib/db/schema/index.js'
import { propertyCatalogSnapshot } from '#lib/db/services/propertyCatalogRevision.js'

const migration = readFileSync('migrations/0227_core_whatsapp_phone_field.sql', 'utf8')

it.each([false, true])(
  'captures phone migration with real catalogue triggers (enrolled=%s)',
  enrolled => {
    const db = new DatabaseSync(':memory:')
    try {
      for (const table of [
        schema.hub,
        schema.property,
        schema.propertyI18n,
        schema.propertyValue,
        schema.propertyValueI18n,
        schema.revisionChangeSet,
        schema.featureProperty,
        schema.hubProperty,
      ]) {
        db.exec(
          `CREATE TABLE "${getTableName(table)}" (${Object.values(
            getTableColumns(table),
          )
            .map(c => `"${c.name}" ${c.getSQLType()}${c.primary ? ' PRIMARY KEY' : ''}`)
            .join(',')})`,
        )
      }
      db.exec(readFileSync('migrations/0176_property_catalog_revisions.sql', 'utf8'))
      db.exec(`INSERT INTO hub(id,code) VALUES ('core-id','core');
      INSERT INTO property(id,key,scope,type,hubId,component,dataType,isTranslatable,modifiedAt)
      VALUES ('gPropWaNum01','whatsappNumber','hub','specifier','core-id','InputField','text',0,'before'),
        ('other','whatsappNumber','hub','specifier','other-hub','InputField','text',1,'before');
      INSERT INTO featureProperty(propertyId,value) VALUES ('gPropWaNum01','+852 9123 4567');
      INSERT INTO hubProperty(hubId,propertyId) VALUES ('core-id','gPropWaNum01');`)
      const query = new SQLiteSyncDialect().sqlToQuery(
        propertyCatalogSnapshot({ scope: 'hub', id: 'core-id' }),
      )
      const snapshot = (): string =>
        Object.values(
          db.prepare(`SELECT ${query.sql}`).get(...(query.params as string[])) ?? {},
        )[0] as string
      const before = snapshot()
      if (enrolled) {
        db.exec("INSERT INTO revisionChangeSet(id) VALUES ('previous');")
        db.prepare('INSERT INTO propertyCatalogRevision VALUES (?,?,?,?,?,?)').run(
          'previous',
          'hub',
          'core-id',
          null,
          'previous',
          before,
        )
        db.exec(
          "INSERT INTO propertyCatalogRevisionHead VALUES ('hub','core-id','previous',4)",
        )
      }
      const values = db.prepare('SELECT * FROM featureProperty').all()
      const assignments = db.prepare('SELECT * FROM hubProperty').all()
      const other = db.prepare("SELECT * FROM property WHERE id='other'").get()
      db.exec(migration)
      expect(
        db.prepare("SELECT component FROM property WHERE id='gPropWaNum01'").get(),
      ).toEqual({ component: 'PhoneField' })
      const history = db
        .prepare('SELECT * FROM propertyCatalogRevision ORDER BY id')
        .all()
      expect(history).toHaveLength(2)
      expect(history.find(r => r.id === '0227-whatsapp-phone')?.content).toBe(
        snapshot(),
      )
      expect(history.find(r => r.id !== '0227-whatsapp-phone')?.content).toBe(before)
      expect(
        db.prepare('SELECT generation FROM propertyCatalogRevisionHead').get()
          ?.generation,
      ).toBe(enrolled ? 5 : 1)
      db.exec(migration)
      expect(
        db.prepare('SELECT * FROM propertyCatalogRevision ORDER BY id').all(),
      ).toEqual(history)
      expect(db.prepare('SELECT * FROM propertyCatalogRevisionWrite').all()).toEqual([])
      expect(db.prepare("SELECT * FROM property WHERE id='other'").get()).toEqual(other)
      expect(db.prepare('SELECT * FROM featureProperty').all()).toEqual(values)
      expect(db.prepare('SELECT * FROM hubProperty').all()).toEqual(assignments)
      expect(() =>
        db.exec("UPDATE property SET component='InputField' WHERE id='gPropWaNum01'"),
      ).toThrow(/catalog capture/)
    } finally {
      db.close()
    }
  },
)
