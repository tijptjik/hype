// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTING
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'migrations/0095_breadline_phone_brand_properties.sql',
  'utf8',
)

/** Creates a scoped catalog fixture including established IDs and assignments. */
function fixture(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE hub (id TEXT PRIMARY KEY, code TEXT);
    CREATE TABLE organisation (id TEXT PRIMARY KEY, code TEXT);
    CREATE TABLE project (id TEXT PRIMARY KEY, code TEXT);
    CREATE TABLE property (id TEXT PRIMARY KEY, hubId TEXT REFERENCES hub(id), organisationId TEXT REFERENCES organisation(id), projectId TEXT REFERENCES project(id), scope TEXT, type TEXT, key TEXT, component TEXT, isTranslatable INTEGER, isDefaultEnabled INTEGER, modifiedAt TEXT);
    CREATE TABLE hubProperty (hubId TEXT, propertyId TEXT REFERENCES property(id), rank INTEGER, PRIMARY KEY(hubId,propertyId));
    CREATE TABLE organisationProperty (organisationId TEXT, propertyId TEXT REFERENCES property(id), rank INTEGER, PRIMARY KEY(organisationId,propertyId));
    CREATE TABLE propertyI18n (propertyId TEXT REFERENCES property(id), locale TEXT, label TEXT, placeholder TEXT, labelGen INTEGER, placeholderGen INTEGER);
    CREATE TABLE propertyValue (id TEXT PRIMARY KEY, propertyId TEXT REFERENCES property(id), rank INTEGER);
    CREATE TABLE propertyValueI18n (propertyValueId TEXT REFERENCES propertyValue(id), locale TEXT, value TEXT, valueGen INTEGER, PRIMARY KEY(propertyValueId,locale));
    CREATE TABLE featureProperty (propertyId TEXT REFERENCES property(id), propertyValueId TEXT REFERENCES propertyValue(id));
    INSERT INTO hub VALUES ('core-id','core');
    INSERT INTO organisation VALUES ('org-id','hkfoodworks');
    INSERT INTO project VALUES ('project-id','breadline');
    INSERT INTO property (id,hubId,scope,key,component,isTranslatable) VALUES ('gPropPhNum01','core-id','hub','phoneNumber','InputField',0);
    INSERT INTO property (id,projectId,scope,key,component,isTranslatable) VALUES ('WhWlW8KcN2wq','project-id','project','brand','SelectField',1);
    INSERT INTO propertyValue VALUES ('7ZvF0blB7t3c','WhWlW8KcN2wq',0),('custom-brand','WhWlW8KcN2wq',10);
    INSERT INTO featureProperty VALUES ('WhWlW8KcN2wq','7ZvF0blB7t3c');
  `)
  return db
}

describe('Breadline property migration', () => {
  it('promotes the existing brand without losing values or references and is replayable', () => {
    const db = fixture()
    try {
      db.exec(migration)
      db.exec(migration)
      expect(
        db
          .prepare(
            "SELECT scope,organisationId,projectId FROM property WHERE key='brand'",
          )
          .get(),
      ).toEqual({ scope: 'organisation', organisationId: 'org-id', projectId: null })
      expect(
        db.prepare("SELECT component FROM property WHERE key='phoneNumber'").get()
          ?.component,
      ).toBe('PhoneField')
      expect(db.prepare('SELECT count(*) AS n FROM propertyValue').get()?.n).toBe(6)
      expect(db.prepare('SELECT count(*) AS n FROM propertyValueI18n').get()?.n).toBe(
        15,
      )
      expect(db.prepare('SELECT count(*) AS n FROM featureProperty').get()?.n).toBe(1)
      expect(
        db
          .prepare(
            "SELECT value FROM propertyValueI18n WHERE propertyValueId='7ZvF0blB7t3c' AND locale='zh-hant'",
          )
          .get()?.value,
      ).toBe('美心西餅')
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })
  it('fails closed when a different organisation brand already exists', () => {
    const db = fixture()
    try {
      db.exec(
        "INSERT INTO property (id,scope,key,organisationId) VALUES ('other-brand','organisation','brand','org-id')",
      )
      expect(() => db.exec(migration)).toThrow(/CHECK/)
      expect(
        db.prepare("SELECT component FROM property WHERE key='phoneNumber'").get()
          ?.component,
      ).toBe('InputField')
    } finally {
      db.close()
    }
  })
})
