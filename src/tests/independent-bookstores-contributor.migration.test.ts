// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTING
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'migrations/0204_independent_bookstores_contributor_attribution.sql',
  'utf8',
)
const owner = 'N3g00X1rofqBiZoSwXffV7TeKTLAfRe3'

/** Create a small attribution fixture with shared task/gallery images.
 * @returns An isolated SQLite database; each test closes it.
 */
function fixture(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY, username TEXT);
    CREATE TABLE project (id TEXT PRIMARY KEY, code TEXT, imageId TEXT);
    CREATE TABLE organisation (id TEXT PRIMARY KEY, imageId TEXT);
    CREATE TABLE hub (id TEXT PRIMARY KEY, imageId TEXT);
    CREATE TABLE feature (id TEXT PRIMARY KEY, projectId TEXT, contributorId TEXT);
    CREATE TABLE image (id TEXT PRIMARY KEY, contributorId TEXT, modifiedAt TEXT DEFAULT 'before');
    CREATE TABLE featureImage (featureId TEXT, imageId TEXT);
    CREATE TABLE task (id TEXT PRIMARY KEY, isDraft INTEGER, isReviewed INTEGER, contributorId TEXT);
    CREATE TABLE taskImage (taskId TEXT, imageId TEXT);
    INSERT INTO user VALUES ('${owner}', 'Chong');
    INSERT INTO project VALUES ('-z26MuNRTJwi','independentBookstores','cover'), ('other','other',NULL);
    INSERT INTO feature VALUES ('independentBookstores','-z26MuNRTJwi','tijptjik'),
      ('already','-z26MuNRTJwi','${owner}'), ('other','other','someone');
    INSERT INTO image (id,contributorId) VALUES ('gallery','tijptjik'), ('cover',NULL),
      ('pending','someone'), ('draft','someone'), ('reviewed','someone'),
      ('task-only','someone'), ('unrelated','someone');
    INSERT INTO featureImage VALUES ('independentBookstores','gallery'), ('independentBookstores','pending'),
      ('independentBookstores','draft'), ('independentBookstores','reviewed'), ('other','unrelated');
    INSERT INTO task VALUES ('pending',0,0,'someone'), ('draft',1,0,'someone'),
      ('reviewed',0,1,'someone');
    INSERT INTO taskImage VALUES ('pending','pending'), ('draft','draft'),
      ('reviewed','reviewed'), ('pending','task-only');
  `)
  return db
}

describe('Independent Bookstores contributor attribution migration', () => {
  it('credits eligible images, preserves features and task images, and is idempotent', () => {
    const db = fixture()
    try {
      const tasks = db.prepare('SELECT * FROM task').all()
      const features = db.prepare('SELECT * FROM feature').all()
      db.exec(migration)
      expect(
        db
          .prepare('SELECT id FROM image WHERE contributorId = ? ORDER BY id')
          .all(owner),
      ).toEqual([{ id: 'cover' }, { id: 'gallery' }])
      expect(db.prepare('SELECT * FROM feature').all()).toEqual(features)
      expect(
        db.prepare("SELECT count(*) n FROM image WHERE contributorId='someone'").get()
          ?.n,
      ).toBe(5)
      expect(
        db.prepare("SELECT contributorId FROM feature WHERE id='other'").get()
          ?.contributorId,
      ).toBe('someone')
      expect(db.prepare('SELECT * FROM task').all()).toEqual(tasks)
      expect(
        db.prepare("SELECT count(*) n FROM image WHERE modifiedAt <> 'before'").get()
          ?.n,
      ).toBe(0)
      const snapshot = db.prepare('SELECT * FROM image').all()
      db.exec(migration)
      expect(db.prepare('SELECT * FROM image').all()).toEqual(snapshot)
      expect(db.prepare('SELECT * FROM feature').all()).toEqual(features)
    } finally {
      db.close()
    }
  })

  it.each([
    'DELETE FROM user',
    "UPDATE user SET username='renamed'",
    "UPDATE project SET code='renamed' WHERE code='independentBookstores'",
    "INSERT INTO featureImage VALUES ('other','gallery')",
    "UPDATE project SET imageId='cover' WHERE id='other'",
    "INSERT INTO organisation VALUES ('org','cover')",
    "INSERT INTO hub VALUES ('hub','cover')",
  ])(
    'fails before attribution writes when identity or asset scope is unsafe: %s',
    setup => {
      const db = fixture()
      try {
        db.exec(setup)
        const images = db.prepare('SELECT * FROM image').all()
        const features = db.prepare('SELECT * FROM feature').all()
        expect(() => db.exec(migration)).toThrow(/CHECK constraint failed/)
        expect(db.prepare('SELECT * FROM image').all()).toEqual(images)
        expect(db.prepare('SELECT * FROM feature').all()).toEqual(features)
      } finally {
        db.close()
      }
    },
  )
})
