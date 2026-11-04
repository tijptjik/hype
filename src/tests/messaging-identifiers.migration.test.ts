// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTS
import { afterEach, beforeEach, expect, it } from 'vitest'

let db: DatabaseSync
const migration = readFileSync('migrations/0165_user_messaging_identifiers.sql', 'utf8')
const phoneNormalization = readFileSync(
  'migrations/0166_messaging_discovered_phone_format.sql',
  'utf8',
)
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE user(id TEXT PRIMARY KEY, updatedAt INTEGER NOT NULL);
    CREATE TABLE organisation(id TEXT PRIMARY KEY);
    CREATE TABLE session(id TEXT PRIMARY KEY,userId TEXT REFERENCES user(id) ON DELETE CASCADE);
    INSERT INTO user VALUES ('admin',10),('wa',10),('lid',10),('handle',10),('phone',10),('native',10),('verified',10),('discovered',10);
    INSERT INTO session VALUES ('keep-session','wa');
    INSERT INTO organisation VALUES ('org');`)
  for (const name of [
    '0160_organisation_messaging',
    '0161_messaging_phone_discovery',
    '0162_messaging_phone_lookup',
    '0163_messaging_conversation_archive',
    '0164_messaging_native_archive',
  ])
    db.exec(readFileSync(`migrations/${name}.sql`, 'utf8'))
  db.exec(`INSERT INTO userMessagingPreference VALUES ('wa','telegram',20),('lid',NULL,5);
    INSERT INTO userMessagingIdentity(userId,platform,address,verifiedAt,verifiedBy,sourceTelephone,updatedAt) VALUES
    ('wa','whatsapp','85291234567@s.whatsapp.net',123,'admin',NULL,125),
    ('lid','whatsapp','987654321@lid',123,'admin',NULL,125),
    ('handle','telegram','@Some_User',NULL,NULL,NULL,125),
    ('phone','telegram','+85291234568',NULL,NULL,NULL,125),
    ('native','telegram','9007199254740993',NULL,NULL,NULL,125),
    ('verified','telegram','123456789',123,'admin',NULL,125),
    ('discovered','telegram','987654321',123,NULL,'+852 9123 4569',125);
    INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,createdAt,updatedAt)
    VALUES ('account','org','whatsapp','bridge',1,1);
    INSERT INTO messagingConversation(id,accountId,chatId,recipientUserId,isArchived,archiveSequence)
    VALUES ('thread','account','85291234567@s.whatsapp.net','wa',1,7);
    INSERT INTO messagingMessage VALUES ('account','85291234567@s.whatsapp.net','message','peer',1,1,'{"text":"keep"}');
    INSERT INTO messagingSend VALUES ('account','request','admin','wa','{"to":"85291234567@s.whatsapp.net"}','uncertain','',1,1);`)
})
afterEach(() => db.close())

/** Apply with the transaction boundary supplied by the D1 migration runner. */
function apply(): void {
  db.exec('BEGIN')
  try {
    db.exec(migration)
    db.exec(phoneNormalization)
    db.exec('COMMIT')
  } catch (cause) {
    db.exec('ROLLBACK')
    throw cause
  }
}

it('moves preferences onto users and preserves every recoverable identifier, verification and pinned thread', () => {
  const untouched = [
    'session',
    'messagingAccount',
    'messagingConversation',
    'messagingMessage',
    'messagingSend',
  ]
  const before = untouched.map(table => db.prepare(`SELECT * FROM ${table}`).all())
  apply()
  expect(untouched.map(table => db.prepare(`SELECT * FROM ${table}`).all())).toEqual(
    before,
  )
  expect(
    db
      .prepare('SELECT preferredMessagingPlatform,updatedAt FROM user WHERE id=?')
      .get('wa'),
  ).toEqual({ preferredMessagingPlatform: 'telegram', updatedAt: 20 })
  expect(
    db
      .prepare('SELECT preferredMessagingPlatform,updatedAt FROM user WHERE id=?')
      .get('lid'),
  ).toEqual({ preferredMessagingPlatform: null, updatedAt: 10 })
  expect(
    db.prepare('SELECT preferredMessagingPlatform FROM user WHERE id=?').get('native'),
  ).toEqual({ preferredMessagingPlatform: null })
  const rows = db
    .prepare(
      'SELECT userId,phoneNumber,username,nativeId,sourceTelephone,verifiedAt,verifiedBy,updatedAt FROM userMessagingIdentity ORDER BY userId',
    )
    .all()
  expect(rows).toEqual([
    {
      userId: 'discovered',
      phoneNumber: '+85291234569',
      username: null,
      nativeId: '987654321',
      sourceTelephone: '+852 9123 4569',
      verifiedAt: 123,
      verifiedBy: null,
      updatedAt: 125,
    },
    {
      userId: 'handle',
      phoneNumber: null,
      username: 'some_user',
      nativeId: null,
      sourceTelephone: null,
      verifiedAt: null,
      verifiedBy: null,
      updatedAt: 125,
    },
    {
      userId: 'lid',
      phoneNumber: null,
      username: null,
      nativeId: '987654321@lid',
      sourceTelephone: null,
      verifiedAt: 123,
      verifiedBy: 'admin',
      updatedAt: 125,
    },
    {
      userId: 'native',
      phoneNumber: null,
      username: null,
      nativeId: '9007199254740993',
      sourceTelephone: null,
      verifiedAt: null,
      verifiedBy: null,
      updatedAt: 125,
    },
    {
      userId: 'phone',
      phoneNumber: '+85291234568',
      username: null,
      nativeId: null,
      sourceTelephone: null,
      verifiedAt: null,
      verifiedBy: null,
      updatedAt: 125,
    },
    {
      userId: 'verified',
      phoneNumber: null,
      username: null,
      nativeId: '123456789',
      sourceTelephone: null,
      verifiedAt: 123,
      verifiedBy: 'admin',
      updatedAt: 125,
    },
    {
      userId: 'wa',
      phoneNumber: '+85291234567',
      username: null,
      nativeId: '85291234567@s.whatsapp.net',
      sourceTelephone: null,
      verifiedAt: 123,
      verifiedBy: 'admin',
      updatedAt: 125,
    },
  ])
  expect(
    db.prepare('SELECT count(*) AS count FROM userMessagingIdentityAlias').get(),
  ).toEqual({ count: 4 })
  expect(
    db
      .prepare("SELECT name FROM sqlite_master WHERE name='userMessagingPreference'")
      .get(),
  ).toBeUndefined()
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it('enforces native identity ownership, clears revoked aliases and keeps user cascades intact', () => {
  apply()
  expect(() =>
    db.exec("UPDATE user SET preferredMessagingPlatform='email' WHERE id='wa'"),
  ).toThrow()
  expect(() =>
    db.exec("UPDATE userMessagingIdentity SET verifiedAt=1 WHERE userId='handle'"),
  ).toThrow()
  db.exec(
    "INSERT INTO userMessagingIdentityAlias VALUES ('wa','whatsapp','444444@lid')",
  )
  expect(() =>
    db.exec(
      "UPDATE userMessagingIdentity SET nativeId='444444@lid',verifiedAt=1 WHERE userId='lid'",
    ),
  ).toThrow()
  expect(
    db.prepare("SELECT nativeId FROM userMessagingIdentity WHERE userId='lid'").get(),
  ).toEqual({ nativeId: '987654321@lid' })
  db.exec("UPDATE userMessagingIdentity SET verifiedAt=124 WHERE userId='wa'")
  expect(
    db
      .prepare("SELECT nativeId FROM userMessagingIdentityAlias WHERE userId='wa'")
      .all(),
  ).toEqual([{ nativeId: '85291234567@s.whatsapp.net' }])
  db.exec("UPDATE userMessagingIdentity SET verifiedAt=NULL WHERE userId='wa'")
  expect(
    db.prepare("SELECT * FROM userMessagingIdentityAlias WHERE userId='wa'").all(),
  ).toEqual([])
  db.exec("DELETE FROM user WHERE id='admin'")
  expect(
    db
      .prepare(
        "SELECT verifiedAt,verifiedBy FROM userMessagingIdentity WHERE userId='lid'",
      )
      .get(),
  ).toEqual({ verifiedAt: 123, verifiedBy: null })
  db.exec("DELETE FROM user WHERE id='lid'")
  expect(
    db.prepare("SELECT * FROM userMessagingIdentityAlias WHERE userId='lid'").all(),
  ).toEqual([])
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it('rolls back rather than dropping a legacy identifier that cannot be classified', () => {
  db.exec(
    "INSERT INTO userMessagingIdentity(userId,platform,address,updatedAt) VALUES ('admin','telegram','unknown legacy value',1)",
  )
  expect(apply).toThrow()
  expect(
    db.prepare("SELECT address FROM userMessagingIdentity WHERE userId='admin'").get(),
  ).toEqual({ address: 'unknown legacy value' })
  expect(
    db.prepare("SELECT platform FROM userMessagingPreference WHERE userId='wa'").get(),
  ).toEqual({ platform: 'telegram' })
  expect(
    db
      .prepare('PRAGMA table_info(user)')
      .all()
      .some(row => row.name === 'preferredMessagingPlatform'),
  ).toBe(false)
})

it.each(['9123 4569', '85291234569', '00852 9123 4569', '+852 (9123) 4569'])(
  'normalizes a discovered profile phone %s while retaining its exact provenance',
  sourceTelephone => {
    db.prepare(
      "UPDATE userMessagingIdentity SET sourceTelephone=? WHERE userId='discovered'",
    ).run(sourceTelephone)
    apply()
    expect(
      db
        .prepare(
          "SELECT phoneNumber,sourceTelephone FROM userMessagingIdentity WHERE userId='discovered'",
        )
        .get(),
    ).toEqual({ phoneNumber: '+85291234569', sourceTelephone })
  },
)

it('does not overwrite an independently edited phone when the follow-up migration runs', () => {
  db.exec(migration)
  db.exec(
    "UPDATE userMessagingIdentity SET phoneNumber='+15555550100' WHERE userId='discovered'",
  )
  const before = db
    .prepare("SELECT * FROM userMessagingIdentity WHERE userId='discovered'")
    .get()
  db.exec(phoneNormalization)
  expect(
    db.prepare("SELECT * FROM userMessagingIdentity WHERE userId='discovered'").get(),
  ).toEqual(before)
})
