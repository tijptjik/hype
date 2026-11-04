// BUN
import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
// PIPELINE
import {
  prepareRemoteAdoption,
  applyRemoteAdoption,
  type AdoptionSnapshot,
} from './lib/target-adoption-remote'
import { evidenceHash } from './lib/target-adoption'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

/** Build a synthetic live database and a reviewed post-merge copy.
 * @returns Private in-memory before/after databases and projected evidence.
 */
function fixture() {
  const live = new Database(':memory:')
  live.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE account(id TEXT PRIMARY KEY,userId TEXT REFERENCES user(id),providerId TEXT,accountId TEXT,password TEXT);
    CREATE TABLE session(id TEXT PRIMARY KEY,userId TEXT REFERENCES user(id),token TEXT NOT NULL);
    CREATE TABLE membership(organisationId TEXT,userId TEXT REFERENCES user(id),role TEXT,PRIMARY KEY(organisationId,userId));
    CREATE TABLE audit(id TEXT PRIMARY KEY,payload TEXT);
    INSERT INTO user VALUES('anchor','Person'),('absorbed','Same person');
    INSERT INTO account VALUES('credential','absorbed','credential','absorbed','old-password');
    INSERT INTO session VALUES('session','absorbed','old-token');
    INSERT INTO membership VALUES('org','anchor','member'),('org','absorbed','owner');`)
  const after = Database.deserialize(live.serialize())
  after.exec(
    `DELETE FROM membership WHERE userId='absorbed'; UPDATE membership SET role='owner'; UPDATE account SET userId='anchor'; UPDATE session SET userId='anchor'; DELETE FROM user WHERE id='absorbed';`,
  )
  const snapshots: AdoptionSnapshot[] = [
    {
      table: 'user',
      columns: ['id'],
      fields: ['id', 'name'],
      rows: live.query('SELECT * FROM user').all() as never[],
    },
    {
      table: 'account',
      columns: ['userId'],
      fields: ['id', 'userId', 'providerId', 'accountId'],
      rows: live
        .query('SELECT id,userId,providerId,accountId FROM account')
        .all() as never[],
    },
    {
      table: 'session',
      columns: ['userId'],
      fields: ['id', 'userId'],
      rows: live.query('SELECT id,userId FROM session').all() as never[],
    },
    {
      table: 'membership',
      columns: ['userId'],
      fields: ['organisationId', 'userId', 'role'],
      rows: live.query('SELECT * FROM membership').all() as never[],
    },
  ]
  const plan = prepareRemoteAdoption(
    after,
    snapshots,
    ['anchor', 'absorbed'],
    'production:synthetic',
    'reviewed',
    [{ from: 'absorbed', to: 'anchor' }],
  )
  return {
    live,
    after,
    snapshots,
    plan,
    close: () => {
      live.close()
      after.close()
    },
  }
}

/** Execute the actual SQL with D1 batch transaction and lost-response semantics.
 * @param db Synthetic database. @param loseResponse Whether to lose the first successful write response.
 * @returns D1-compatible adapter.
 */
function remote(db: Database, loseResponse = false): D1Database {
  const prepare = (sql: string, params: Array<string | number | null> = []) => ({
    bind: (...values: Array<string | number | null>) => prepare(sql, values),
    execute: () => db.query(sql).all(...params),
    sql,
  })
  return {
    prepare,
    batch: async (statements: Array<ReturnType<typeof prepare>>) => {
      const result = db.transaction(() => statements.map(s => s.execute())).immediate()
      if (loseResponse && statements.some(s => s.sql.startsWith('UPDATE'))) {
        loseResponse = false
        throw new Error('lost response')
      }
      return result
    },
  } as unknown as D1Database
}

describe('guarded production adoption', () => {
  it('excludes protected Cloudflare storage from reference scans while guarding its schema', async () => {
    const f = fixture()
    try {
      for (const db of [f.live, f.after])
        db.exec('CREATE TABLE _cf_KV(key TEXT PRIMARY KEY,value TEXT)')
      const plan = prepareRemoteAdoption(
        f.after,
        f.snapshots,
        ['anchor', 'absorbed'],
        'production:synthetic',
        'reviewed',
        [{ from: 'absorbed', to: 'anchor' }],
      )
      expect(plan.after.some(s => s.sql.includes('FROM "_cf_KV"'))).toBe(false)
      expect(plan.before[0].params[0]).toContain('_cf_KV')
      await applyRemoteAdoption(
        remote(f.live),
        plan,
        evidenceHash(plan),
        plan.targetIdentity,
      )
      expect(f.live.query('SELECT count(*) AS n FROM user').get()).toEqual({ n: 1 })
    } finally {
      f.close()
    }
  })

  it('coalesces trigger-created invalidation counters after all reference moves', async () => {
    const f = fixture()
    try {
      const schema = `CREATE TABLE featureCountUserRevision(userId TEXT PRIMARY KEY,revision INTEGER);
        CREATE TRIGGER invalidate AFTER UPDATE OF userId ON account BEGIN
          INSERT INTO featureCountUserRevision VALUES(OLD.userId,1) ON CONFLICT(userId) DO UPDATE SET revision=revision+1;
          INSERT INTO featureCountUserRevision VALUES(NEW.userId,1) ON CONFLICT(userId) DO UPDATE SET revision=revision+1;
        END;`
      f.live.exec(schema)
      f.after.exec(schema)
      f.live.exec(
        "INSERT INTO featureCountUserRevision VALUES('anchor',2),('absorbed',7)",
      )
      const snapshots = [
        ...f.snapshots,
        {
          table: 'featureCountUserRevision',
          columns: ['userId'],
          fields: ['userId', 'revision'],
          rows: f.live.query('SELECT * FROM featureCountUserRevision').all() as never[],
        },
      ]
      const plan = prepareRemoteAdoption(
        f.after,
        snapshots,
        ['anchor', 'absorbed'],
        'production:synthetic',
        'reviewed',
        [{ from: 'absorbed', to: 'anchor' }],
      )
      await applyRemoteAdoption(
        remote(f.live),
        plan,
        evidenceHash(plan),
        plan.targetIdentity,
      )
      expect(
        f.live
          .query(
            "SELECT count(*) AS n FROM featureCountUserRevision WHERE userId='absorbed'",
          )
          .get(),
      ).toEqual({ n: 0 })
      expect(
        (
          f.live
            .query(
              "SELECT revision FROM featureCountUserRevision WHERE userId='anchor'",
            )
            .get() as { revision: number }
        ).revision,
      ).toBeGreaterThan(7)
    } finally {
      f.close()
    }
  })

  it('preserves freshly rotated passwords and session tokens while moving ownership', async () => {
    const f = fixture()
    try {
      f.live.exec(
        "UPDATE account SET password='new-password'; UPDATE session SET token='new-token'",
      )
      const result = await applyRemoteAdoption(
        remote(f.live),
        f.plan,
        evidenceHash(f.plan),
        f.plan.targetIdentity,
      )
      expect(result.replay).toBe(false)
      expect(
        f.live.query('SELECT userId,password,accountId FROM account').get(),
      ).toEqual({ userId: 'anchor', password: 'new-password', accountId: 'absorbed' })
      expect(f.live.query('SELECT userId,token FROM session').get()).toEqual({
        userId: 'anchor',
        token: 'new-token',
      })
      expect(f.live.query('SELECT * FROM membership').all()).toEqual([
        { organisationId: 'org', userId: 'anchor', role: 'owner' },
      ])
      expect(f.live.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(JSON.stringify(f.plan)).not.toContain('old-password')
      expect(JSON.stringify(f.plan)).not.toContain('old-token')
      expect(
        [...f.plan.before, ...f.plan.writes, ...f.plan.after].every(
          s => s.params.length <= 2,
        ),
      ).toBe(true)
    } finally {
      f.close()
    }
  })
  it('recovers a lost response without repeating any writes', async () => {
    const f = fixture()
    try {
      const db = remote(f.live, true)
      await expect(
        applyRemoteAdoption(db, f.plan, evidenceHash(f.plan), f.plan.targetIdentity),
      ).rejects.toThrow('lost response')
      const before = f.live.query('SELECT total_changes() AS n').get()
      expect(
        (
          await applyRemoteAdoption(
            db,
            f.plan,
            evidenceHash(f.plan),
            f.plan.targetIdentity,
          )
        ).replay,
      ).toBe(true)
      expect(f.live.query('SELECT total_changes() AS n').get()).toEqual(before)
    } finally {
      f.close()
    }
  })
  it('rejects newly added references and preserves the complete before-state', async () => {
    const f = fixture()
    try {
      f.live.exec("INSERT INTO session VALUES('new-session','absorbed','fresh-token')")
      await expect(
        applyRemoteAdoption(
          remote(f.live),
          f.plan,
          evidenceHash(f.plan),
          f.plan.targetIdentity,
        ),
      ).rejects.toThrow()
      expect(f.live.query('SELECT count(*) AS n FROM user').get()).toEqual({ n: 2 })
      expect(
        f.live.query("SELECT userId FROM account WHERE id='credential'").get(),
      ).toEqual({ userId: 'absorbed' })
    } finally {
      f.close()
    }
  })
  it('rolls back when an undeclared embedded reference would be orphaned', async () => {
    const f = fixture()
    try {
      f.live.exec(`INSERT INTO audit VALUES('late','{"owner":"absorbed"}')`)
      await expect(
        applyRemoteAdoption(
          remote(f.live),
          f.plan,
          evidenceHash(f.plan),
          f.plan.targetIdentity,
        ),
      ).rejects.toThrow()
      expect(f.live.query('SELECT count(*) AS n FROM user').get()).toEqual({ n: 2 })
      expect(
        f.live.query("SELECT role FROM membership WHERE userId='anchor'").get(),
      ).toEqual({ role: 'member' })
    } finally {
      f.close()
    }
  })
  it('rejects changed schema, target and plan hashes', async () => {
    const f = fixture()
    try {
      await expect(
        applyRemoteAdoption(remote(f.live), f.plan, 'different', f.plan.targetIdentity),
      ).rejects.toThrow()
      await expect(
        applyRemoteAdoption(
          remote(f.live),
          f.plan,
          evidenceHash(f.plan),
          'production:other',
        ),
      ).rejects.toThrow()
      f.live.exec('CREATE TABLE newOwnership(id TEXT PRIMARY KEY,userId TEXT)')
      await expect(
        applyRemoteAdoption(
          remote(f.live),
          f.plan,
          evidenceHash(f.plan),
          f.plan.targetIdentity,
        ),
      ).rejects.toThrow()
    } finally {
      f.close()
    }
  })
})
