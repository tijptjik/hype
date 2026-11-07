// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { isContactValidationFresh } from '#lib/messaging/contactValidation.js'

it('invalidates stored evidence for any changed identity without conflating ownership', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(
      'CREATE TABLE userMessagingIdentity(userId TEXT, platform TEXT, phoneNumber TEXT, username TEXT, nativeId TEXT, updatedAt INTEGER, verifiedAt INTEGER)',
    )
    db.exec(readFileSync('migrations/0179_user_contact_validation.sql', 'utf8'))
    db.exec(
      `INSERT INTO userMessagingIdentity VALUES ('user','telegram','+85291234567',NULL,NULL,1,NULL,'{"status":"confirmed"}')`,
    )
    db.exec(`UPDATE userMessagingIdentity SET username='another', updatedAt=2`)
    expect(
      db.prepare('SELECT validation, verifiedAt FROM userMessagingIdentity').get(),
    ).toEqual({ validation: null, verifiedAt: null })
    const late = db
      .prepare("UPDATE userMessagingIdentity SET validation='stale' WHERE updatedAt=1")
      .run()
    expect(late.changes).toBe(0)
  } finally {
    db.close()
  }
})

it('treats old observations as historical rather than making automatic page-load checks', () => {
  const value = {
    status: 'confirmed' as const,
    checkedAt: 1000,
    accountId: 'account',
    message: 'Found',
  }
  expect(isContactValidationFresh(value, 2000)).toBe(true)
  expect(isContactValidationFresh(value, 700_000)).toBe(false)
})
