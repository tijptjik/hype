// NODE
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// BUN
import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
// PIPELINE
import {
  applyAdoptions,
  prepareAdoptions,
  readIdentitySnapshot,
  targetEvidence,
  verifyAdoptionReplay,
  type AdoptionReview,
} from './lib/target-adoption'
import { planUsers, type LegacyUser } from './lib/users'

const decisions = { version: 1 as const, merges: [], excludeEmails: [] }
/** Build disposable synthetic identities and realistic credential/content references. */
function fixture(multiple = false, google = true) {
  const directory = mkdtempSync(join(tmpdir(), 'adoption-'))
  const db = new Database(':memory:')
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,username TEXT,emailVerified INTEGER,isArchived INTEGER,isAnonymous INTEGER,telephone TEXT UNIQUE);
    CREATE TABLE account(id TEXT PRIMARY KEY,userId TEXT REFERENCES user(id),providerId TEXT,accountId TEXT,password TEXT,createdAt INTEGER,updatedAt INTEGER);
    CREATE TABLE breadlineImportUser(userId TEXT PRIMARY KEY REFERENCES user(id),telephone TEXT UNIQUE,state TEXT,claimedEmail TEXT);
    CREATE TABLE breadlineImportIdentity(sourceUserId INTEGER PRIMARY KEY,sourceVolunteerId INTEGER,userId TEXT REFERENCES user(id),email TEXT,name TEXT,sourceUid TEXT);
    CREATE TABLE organisationRole(organisationId TEXT,userId TEXT REFERENCES user(id),role TEXT,PRIMARY KEY(organisationId,userId));
    CREATE TABLE image(id TEXT PRIMARY KEY,contributorId TEXT REFERENCES user(id),caption TEXT);
    CREATE TABLE featureImage(id TEXT PRIMARY KEY,publisherId TEXT);
    CREATE TABLE passkey(id TEXT PRIMARY KEY,userId TEXT REFERENCES user(id),publicKey TEXT);
    INSERT INTO user VALUES('anchor','PERSON','person@example.test','person',1,0,0,NULL);
    INSERT INTO organisationRole VALUES('org','anchor','member');
  `)
  if (google)
    db.exec(
      "INSERT INTO account VALUES('google','anchor','google','123456789012345678901',NULL,1,1)",
    )
  if (multiple)
    db.exec(`
    INSERT INTO user VALUES('loser','Second','second@example.test','second',1,0,0,NULL);
    INSERT INTO account VALUES('password','loser','credential','loser','synthetic-password-hash',1,1);
    INSERT INTO passkey VALUES('passkey','loser','synthetic-public-key');
    INSERT INTO organisationRole VALUES('org','loser','owner');
    INSERT INTO image VALUES('image','loser','keep this caption');
    INSERT INTO featureImage VALUES('link','loser');
  `)
  const source: LegacyUser[] = [
    {
      id: 1,
      volunteer_id: 2,
      name: 'person',
      email: 'person@example.test',
      uid: google ? '123456789012345678901' : 'legacy-facebook',
      telephone: '+85291234567',
      locale: 'en',
      picture: null,
      created_at: '2020-01-01T00:00:00Z',
      last_updated_at: '2020-01-01T00:00:00Z',
    },
  ]
  if (multiple)
    source.push({
      ...source[0],
      id: 3,
      volunteer_id: 4,
      email: 'second@example.test',
      uid: '223456789012345678901',
    })
  const review: AdoptionReview = {
    snapshot: 'synthetic',
    manifestSha256: 'synthetic',
    decisions: [
      {
        caseId: 'test',
        sourceUserIds: source.map(r => r.id),
        anchorHypeUserId: 'anchor',
        scope: multiple ? 'merge_all_source_and_hype_candidates' : 'target_adoption',
        ...(multiple ? { hypeUserIds: ['anchor', 'loser'] } : {}),
      },
    ],
  }
  return {
    db,
    source,
    review,
    backup: join(directory, 'before.sqlite'),
    close: () => {
      db.close()
      rmSync(directory, { recursive: true })
    },
  }
}

describe('reviewed target adoption', () => {
  it('keeps reviewed distinct people separate when a shared source phone is cleared', () => {
    const f = fixture(true)
    try {
      f.source[1].name = 'Different person'
      const corrected = {
        ...decisions,
        telephoneOverrides: f.source.map(row => ({
          sourceUserId: row.id,
          expectedTelephone: row.telephone!,
          telephone: null,
        })),
      }
      f.review.decisions = [
        {
          caseId: 'first',
          sourceUserIds: [1],
          anchorHypeUserId: 'anchor',
          scope: 'target_adoption',
        },
        {
          caseId: 'second',
          sourceUserIds: [3],
          anchorHypeUserId: 'loser',
          scope: 'target_adoption',
        },
      ]
      const beforeReferences = f.db
        .query('SELECT * FROM organisationRole ORDER BY userId')
        .all()
      const plan = prepareAdoptions(f.db, f.source, f.review, 'seed', corrected)
      const receipt = applyAdoptions(
        f.db,
        f.source,
        f.review,
        plan,
        'seed',
        corrected,
        f.backup,
      )
      expect(receipt.mergedUsers).toBe(0)
      expect(f.db.query('SELECT id,telephone FROM user ORDER BY id').all()).toEqual([
        { id: 'anchor', telephone: null },
        { id: 'loser', telephone: null },
      ])
      expect(
        f.db
          .query(
            'SELECT sourceUserId,userId FROM breadlineImportIdentity ORDER BY sourceUserId',
          )
          .all(),
      ).toEqual([
        { sourceUserId: 1, userId: 'anchor' },
        { sourceUserId: 3, userId: 'loser' },
      ])
      expect(
        f.db.query('SELECT * FROM organisationRole ORDER BY userId').all(),
      ).toEqual(beforeReferences)
      expect(
        f.db.query("SELECT userId,password FROM account WHERE id='password'").get(),
      ).toEqual({ userId: 'loser', password: 'synthetic-password-hash' })
      expect(f.db.query('SELECT contributorId FROM image').get()).toEqual({
        contributorId: 'loser',
      })
      expect(
        planUsers(f.source, readIdentitySnapshot(f.db), 'seed', corrected).exceptions,
      ).toEqual([])
      expect(f.source.every(row => row.telephone === '+85291234567')).toBe(true)
    } finally {
      f.close()
    }
  })

  it('coalesces independent organisation grants without weakening either assignment', () => {
    const f = fixture(true)
    try {
      f.db.exec(
        "ALTER TABLE organisationRole ADD COLUMN grant TEXT; UPDATE organisationRole SET grant=json_object('manual',role)",
      )
      f.db.exec(
        "UPDATE organisationRole SET grant=json_set(grant,'$.onboarding','user') WHERE userId='anchor'",
      )
      f.db.exec(
        "UPDATE organisationRole SET grant=json_set(grant,'$.breadline:3','user') WHERE userId='loser'",
      )
      const plan = prepareAdoptions(f.db, f.source, f.review, 'seed', decisions)
      applyAdoptions(f.db, f.source, f.review, plan, 'seed', decisions, f.backup)
      const row = f.db.query('SELECT role,grant FROM organisationRole').get() as {
        role: string
        grant: string
      }
      expect(row.role).toBe('owner')
      expect(JSON.parse(row.grant)).toEqual({
        manual: 'owner',
        onboarding: 'user',
        'breadline:3': 'user',
      })
    } finally {
      f.close()
    }
  })

  it('adopts several reviewed source rows to one owner with email-only fallback', () => {
    const f = fixture()
    try {
      f.source[0].telephone = null
      f.source.push({ ...f.source[0], id: 3, volunteer_id: 4 })
      f.review.decisions[0].sourceUserIds.push(3)
      const plan = prepareAdoptions(f.db, f.source, f.review, 'seed', decisions)
      applyAdoptions(f.db, f.source, f.review, plan, 'seed', decisions, f.backup)
      expect(f.db.query('SELECT telephone FROM user').get()).toEqual({
        telephone: null,
      })
      expect(
        planUsers(f.source, readIdentitySnapshot(f.db), 'seed', decisions).mapping.map(
          row => row.targetUserId,
        ),
      ).toEqual(['anchor', 'anchor'])
      expect(f.db.query('SELECT count(*) n FROM account').get()).toEqual({ n: 1 })
    } finally {
      f.close()
    }
  })
  it('rejects a changed seed or source decision set', () => {
    const f = fixture()
    try {
      const plan = prepareAdoptions(f.db, f.source, f.review, 'seed', decisions)
      expect(() =>
        applyAdoptions(
          f.db,
          f.source,
          f.review,
          plan,
          'different-seed',
          decisions,
          f.backup,
        ),
      ).toThrow('Stale adoption plan')
      expect(() =>
        applyAdoptions(
          f.db,
          f.source,
          f.review,
          plan,
          'seed',
          { ...decisions, excludeEmails: ['other@example.test'] },
          f.backup,
        ),
      ).toThrow('Stale adoption plan')
    } finally {
      f.close()
    }
  })
  for (const google of [true, false])
    it(`adopts one existing owner and replays exactly (Google=${google})`, () => {
      const f = fixture(false, google)
      try {
        const plan = prepareAdoptions(f.db, f.source, f.review, 'seed', decisions)
        const receipt = applyAdoptions(
          f.db,
          f.source,
          f.review,
          plan,
          'seed',
          decisions,
          f.backup,
        )
        expect(receipt.sourceRows).toBe(1)
        expect(f.db.query('SELECT name FROM user').get()).toEqual({ name: 'Person' })
        expect(
          planUsers(f.source, readIdentitySnapshot(f.db), 'seed', decisions).exceptions,
        ).toEqual([])
        verifyAdoptionReplay(f.db, f.source, f.review, plan, receipt.afterHash)
        const restored = new Database(f.backup, { readonly: true })
        expect(targetEvidence(restored, f.review.decisions)).toBe(plan.beforeHash)
        restored.close()
      } finally {
        f.close()
      }
    })
  it('merges all approved owners, credentials, passkeys, roles and unconstrained attribution', () => {
    const f = fixture(true)
    try {
      const plan = prepareAdoptions(f.db, f.source, f.review, 'seed', decisions)
      const receipt = applyAdoptions(
        f.db,
        f.source,
        f.review,
        plan,
        'seed',
        decisions,
        f.backup,
      )
      expect(receipt.mergedUsers).toBe(1)
      expect(
        f.db
          .query("SELECT userId,accountId,password FROM account WHERE id='password'")
          .get(),
      ).toEqual({
        userId: 'anchor',
        accountId: 'loser',
        password: 'synthetic-password-hash',
      })
      expect(f.db.query('SELECT userId,publicKey FROM passkey').get()).toEqual({
        userId: 'anchor',
        publicKey: 'synthetic-public-key',
      })
      expect(f.db.query('SELECT * FROM organisationRole').all()).toEqual([
        { organisationId: 'org', userId: 'anchor', role: 'owner' },
      ])
      expect(f.db.query('SELECT contributorId,caption FROM image').get()).toEqual({
        contributorId: 'anchor',
        caption: 'keep this caption',
      })
      expect(f.db.query('SELECT publisherId FROM featureImage').get()).toEqual({
        publisherId: 'anchor',
      })
      expect(
        planUsers(f.source, readIdentitySnapshot(f.db), 'seed', decisions).mapping.map(
          r => r.targetUserId,
        ),
      ).toEqual(['anchor', 'anchor'])
    } finally {
      f.close()
    }
  })
  for (const change of [
    'source',
    'decision',
    'role',
    'phone',
    'archived',
    'anonymous',
    'credential',
    'latent',
    'claimed',
  ])
    it(`rejects stale ${change} state atomically`, () => {
      const f = fixture()
      try {
        const plan = prepareAdoptions(f.db, f.source, f.review, 'seed', decisions)
        if (change === 'source') f.source[0].name = 'Changed'
        if (change === 'decision') f.review.decisions[0].requestedName = 'Changed'
        if (change === 'role') f.db.exec('DELETE FROM organisationRole')
        if (change === 'phone') f.db.exec("UPDATE user SET telephone='+85292345678'")
        if (change === 'archived') f.db.exec('UPDATE user SET isArchived=1')
        if (change === 'anonymous') f.db.exec('UPDATE user SET isAnonymous=1')
        if (change === 'credential') f.db.exec("UPDATE account SET password='changed'")
        if (change === 'latent' || change === 'claimed')
          f.db
            .query('INSERT INTO breadlineImportUser VALUES(?,?,?,?)')
            .run(
              'anchor',
              '+85291234567',
              change === 'latent' ? 'unclaimed' : 'claimed',
              change === 'latent' ? null : 'person@example.test',
            )
        const before = targetEvidence(f.db, f.review.decisions)
        expect(() =>
          applyAdoptions(f.db, f.source, f.review, plan, 'seed', decisions, f.backup),
        ).toThrow()
        expect(targetEvidence(f.db, f.review.decisions)).toBe(before)
      } finally {
        f.close()
      }
    })
  it('rolls back mutations if an unreviewed credential owner is discovered', () => {
    const f = fixture(true)
    try {
      const plan = prepareAdoptions(f.db, f.source, f.review, 'seed', decisions)
      f.db.exec(
        "INSERT INTO user VALUES('other','Other','other@example.test','other',1,0,0,NULL); INSERT INTO account VALUES('conflict','other','google','223456789012345678901',NULL,1,1)",
      )
      const before = targetEvidence(f.db, f.review.decisions)
      expect(() =>
        applyAdoptions(f.db, f.source, f.review, plan, 'seed', decisions, f.backup),
      ).toThrow('Conflicting credential owner')
      expect(targetEvidence(f.db, f.review.decisions)).toBe(before)
      expect(f.db.query('SELECT count(*) n FROM user').get()).toEqual({ n: 3 })
    } finally {
      f.close()
    }
  })
  it('rejects a changed post-state on exact replay', () => {
    const f = fixture()
    try {
      const plan = prepareAdoptions(f.db, f.source, f.review, 'seed', decisions)
      const receipt = applyAdoptions(
        f.db,
        f.source,
        f.review,
        plan,
        'seed',
        decisions,
        f.backup,
      )
      f.db.exec('DELETE FROM organisationRole')
      expect(() =>
        verifyAdoptionReplay(f.db, f.source, f.review, plan, receipt.afterHash),
      ).toThrow()
    } finally {
      f.close()
    }
  })
})
