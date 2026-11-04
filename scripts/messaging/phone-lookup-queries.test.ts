// BUN
import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, expect, it } from 'bun:test'
// NODE
import { readFileSync } from 'node:fs'
// MESSAGING
import {
  findPhoneLookupCandidates,
  hasConflictingMessagingOwner,
} from './phone-lookup-queries'

let db: Database
const now = 1_800_000_000_000
const candidate = {
  userId: 'candidate',
  accountId: 'account',
  platform: 'telegram',
} as const

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE user(id TEXT PRIMARY KEY,username TEXT,telephone TEXT,isAnonymous INT DEFAULT 0,isArchived INT DEFAULT 0,updatedAt INT NOT NULL DEFAULT 0);
    CREATE TABLE organisation(id TEXT PRIMARY KEY,code TEXT,isArchived INT DEFAULT 0);
    INSERT INTO organisation(id,code) VALUES ('org','example');
    INSERT INTO user(id,username,telephone) VALUES ('candidate','candidate','+85291234567'),('owner','owner','+85291234568');
  `)
  for (const name of [
    '0160_organisation_messaging',
    '0161_messaging_phone_discovery',
    '0162_messaging_phone_lookup',
    '0163_messaging_conversation_archive',
    '0164_messaging_native_archive',
    '0165_user_messaging_identifiers',
    '0166_messaging_discovered_phone_format',
  ])
    db.exec(
      readFileSync(new URL(`../../migrations/${name}.sql`, import.meta.url), 'utf8'),
    )
  db.exec(`
    INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,externalAccountId,enabled,createdAt,updatedAt)
    VALUES ('account','org','telegram','bridge','native',1,1,1);
  `)
})

afterEach(() => db.close())

it('skips pending manual claims and valid verification while allowing stale discovery to refresh', () => {
  db.exec(`
    INSERT INTO userMessagingIdentity(userId,platform,username,updatedAt)
    VALUES ('candidate','telegram','saved_username',1);
    INSERT INTO userMessagingIdentity(userId,platform,nativeId,sourceTelephone,verifiedAt,updatedAt)
    VALUES ('owner','telegram','42','+85291234568',1,1);
  `)
  expect(findPhoneLookupCandidates(db, 'example', 50, now)).toEqual([])
  db.exec("UPDATE user SET telephone='+85291234569' WHERE id='owner'")
  expect(
    findPhoneLookupCandidates(db, 'example', 50, now).map(row => row.userId),
  ).toEqual(['owner'])
  db.exec("UPDATE userMessagingIdentity SET sourceTelephone=NULL WHERE userId='owner'")
  expect(findPhoneLookupCandidates(db, 'example', 50, now)).toEqual([])
})

it.each([
  ['expired result', `UPDATE messagingPhoneLookup SET expiresAt=${now}`],
  [
    'changed profile phone',
    "UPDATE user SET telephone='+85291234569' WHERE id='candidate'",
  ],
  ['relinked account', "UPDATE messagingAccount SET externalAccountId='relinked'"],
])(
  'refreshes discovery after %s while keeping fresh entries scoped',
  (_label, change) => {
    db.exec(
      `INSERT INTO messagingPhoneLookup VALUES ('account','candidate','native','+85291234567','42',NULL,${now},${now + 60000})`,
    )
    expect(
      findPhoneLookupCandidates(db, 'example', 50, now).map(row => row.userId),
    ).toEqual(['owner'])
    db.exec(change)
    expect(
      findPhoneLookupCandidates(db, 'example', 50, now).map(row => row.userId),
    ).toEqual(['candidate', 'owner'])
  },
)

it('bounds the batch and excludes disabled accounts and inactive recipients', () => {
  expect(
    findPhoneLookupCandidates(db, 'example', 1, now).map(row => row.userId),
  ).toEqual(['candidate'])
  expect(findPhoneLookupCandidates(db, 'other', 50, now)).toEqual([])
  db.exec(
    "UPDATE user SET isArchived=1 WHERE id='candidate'; UPDATE user SET isAnonymous=1 WHERE id='owner'",
  )
  expect(findPhoneLookupCandidates(db, 'example', 50, now)).toEqual([])
  db.exec(
    'UPDATE user SET isArchived=0,isAnonymous=0; UPDATE messagingAccount SET enabled=0',
  )
  expect(findPhoneLookupCandidates(db, 'example', 50, now)).toEqual([])
})

it.each([
  [
    'pending native claim',
    "INSERT INTO userMessagingIdentity(userId,platform,nativeId,updatedAt) VALUES ('owner','telegram','42',1)",
  ],
  [
    'verified alias',
    "INSERT INTO userMessagingIdentity(userId,platform,nativeId,verifiedAt,updatedAt) VALUES ('owner','telegram','43',1,1); INSERT INTO userMessagingIdentityAlias VALUES ('owner','telegram','42')",
  ],
  [
    'existing conversation',
    "INSERT INTO messagingConversation(id,accountId,chatId,recipientUserId) VALUES ('thread','account','42','owner')",
  ],
])('rejects a different owner through a %s', (_label, setup) => {
  db.exec(setup)
  expect(hasConflictingMessagingOwner(db, candidate, '42')).toBe(true)
  expect(hasConflictingMessagingOwner(db, candidate, '44')).toBe(false)
})

it('allows the same owner but cannot let that claim mask a conflicting reservation', () => {
  db.exec(`
    INSERT INTO userMessagingIdentity(userId,platform,nativeId,verifiedAt,updatedAt)
    VALUES ('candidate','telegram','42',1,1);
    INSERT INTO userMessagingIdentityAlias VALUES ('candidate','telegram','43');
    INSERT INTO messagingConversation(id,accountId,chatId,recipientUserId)
    VALUES ('thread','account','43','candidate');
  `)
  expect(hasConflictingMessagingOwner(db, candidate, '42')).toBe(false)
  expect(hasConflictingMessagingOwner(db, candidate, '43')).toBe(false)
  db.exec(
    "INSERT INTO userMessagingIdentity(userId,platform,nativeId,updatedAt) VALUES ('owner','telegram','43',1)",
  )
  expect(hasConflictingMessagingOwner(db, candidate, '43')).toBe(true)
})

it('keeps native aliases scoped to their platform and conversation owners to their account', () => {
  db.exec(`
    INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,externalAccountId,enabled,createdAt,updatedAt)
    VALUES ('wa','org','whatsapp','wa-bridge','wa-native',1,1,1);
    INSERT INTO userMessagingIdentity(userId,platform,nativeId,verifiedAt,updatedAt)
    VALUES ('owner','whatsapp','85291234568@s.whatsapp.net',1,1);
    INSERT INTO messagingConversation(id,accountId,chatId,recipientUserId)
    VALUES ('thread','wa','42','owner');
  `)
  expect(
    hasConflictingMessagingOwner(db, candidate, '85291234568@s.whatsapp.net'),
  ).toBe(false)
  expect(hasConflictingMessagingOwner(db, candidate, '42')).toBe(false)
})
