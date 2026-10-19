// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTING
import { describe, expect, it } from 'vitest'

const migration = readFileSync('migrations/0092_project_org_context_name.sql', 'utf8')

describe('project organisation-context name migration', () => {
  it('enables only the known project and preserves unrelated and curated short names', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(`
        CREATE TABLE project (id TEXT PRIMARY KEY, code TEXT, modifiedAt TEXT);
        CREATE TABLE projectI18n (projectId TEXT, locale TEXT, name TEXT, nameShort TEXT);
        INSERT INTO project VALUES ('YuSFnia9VOtG','hkghostsigns','before'), ('other','other','before');
        INSERT INTO projectI18n VALUES
          ('YuSFnia9VOtG','en','HK Ghost Signs','All'),
          ('YuSFnia9VOtG','zhHant','香港幽靈招牌','幽靈招牌'),
          ('other','en','Other','All');
      `)
      db.exec(migration)
      expect(
        db.prepare('SELECT code,useAllInOrgContext FROM project ORDER BY code').all(),
      ).toEqual([
        { code: 'hkghostsigns', useAllInOrgContext: 1 },
        { code: 'other', useAllInOrgContext: 0 },
      ])
      expect(
        db.prepare('SELECT nameShort FROM projectI18n ORDER BY rowid').all(),
      ).toEqual([
        { nameShort: 'HK Ghost Signs' },
        { nameShort: '幽靈招牌' },
        { nameShort: 'All' },
      ])
      db.exec("INSERT INTO project (id,code) VALUES ('new','new')")
      expect(
        db.prepare("SELECT useAllInOrgContext FROM project WHERE id='new'").get()
          ?.useAllInOrgContext,
      ).toBe(0)
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })
})
