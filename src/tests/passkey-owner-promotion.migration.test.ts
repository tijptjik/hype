import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('migrations/0075_promote_passkey_owners.sql', 'utf8')
const execFileAsync = promisify(execFile)

/**
 * Runs SQL in an ephemeral SQLite database.
 *
 * @param statements - Statements to execute in order.
 * @returns The scalar result written by the final query.
 */
async function queryIsAnonymous(statements: string): Promise<number> {
  const { stdout } = await execFileAsync('sqlite3', [
    ':memory:',
    '-batch',
    `${statements}\nSELECT "isAnonymous" FROM "user" WHERE "id" = 'guest-1';`,
  ])

  return Number.parseInt(stdout.trim(), 10)
}

const schema = `
  CREATE TABLE "user" (
    "id" text PRIMARY KEY NOT NULL,
    "isAnonymous" integer NOT NULL,
    "updatedAt" integer NOT NULL
  );
  CREATE TABLE "passkey" ("id" text PRIMARY KEY NOT NULL, "userId" text NOT NULL);
`

describe('passkey owner promotion migration', () => {
  it('promotes an anonymous user in the passkey insert transaction', async () => {
    const isAnonymous = await queryIsAnonymous(`
      ${schema}
      ${migration}
      INSERT INTO "user" VALUES ('guest-1', 1, 0);
      INSERT INTO "passkey" VALUES ('passkey-1', 'guest-1');
    `)

    expect(isAnonymous).toBe(0)
  })

  it('repairs anonymous users who already owned a passkey', async () => {
    const isAnonymous = await queryIsAnonymous(`
      ${schema}
      INSERT INTO "user" VALUES ('guest-1', 1, 0);
      INSERT INTO "passkey" VALUES ('passkey-1', 'guest-1');
      ${migration}
    `)

    expect(isAnonymous).toBe(0)
  })

  it('rolls back the promotion when passkey registration rolls back', async () => {
    const isAnonymous = await queryIsAnonymous(`
      ${schema}
      ${migration}
      INSERT INTO "user" VALUES ('guest-1', 1, 0);
      BEGIN;
      INSERT INTO "passkey" VALUES ('passkey-1', 'guest-1');
      ROLLBACK;
    `)

    expect(isAnonymous).toBe(1)
  })
})
