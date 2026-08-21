import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'migrations/0076_better_auth_1_7_account_issuer.sql',
  'utf8',
)
const execFileAsync = promisify(execFile)

const schema = `
  CREATE TABLE "user" ("id" text PRIMARY KEY NOT NULL);
  CREATE TABLE "account" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "accessTokenExpiresAt" integer,
    "refreshTokenExpiresAt" integer,
    "scope" text,
    "idToken" text,
    "password" text,
    "createdAt" integer NOT NULL,
    "updatedAt" integer NOT NULL
  );
`

/**
 * Runs the Better Auth account-issuer migration in an ephemeral SQLite database.
 *
 * @param sourceStatements - Source data to execute before the migration.
 * @param query - Optional query to execute after the migration.
 * @returns Standard output from SQLite.
 */
async function runMigration(sourceStatements: string, query = ''): Promise<string> {
  const { stdout } = await execFileAsync('sqlite3', [
    ':memory:',
    '-batch',
    `${schema}\n${sourceStatements}\n${migration}\n${query}`,
  ])

  return stdout.trim()
}

const accountRows = `
  INSERT INTO "user" VALUES ('user-1'), ('user-2'), ('user-3');
  INSERT INTO "account" (
    "id", "userId", "accountId", "providerId", "createdAt", "updatedAt"
  ) VALUES
    ('credential-1', 'user-1', 'user-1', 'credential', 0, 0),
    ('google-1', 'user-2', 'google-subject', 'google', 0, 0),
    ('facebook-1', 'user-3', 'facebook-subject', 'facebook', 0, 0);
`

describe('Better Auth 1.7 account issuer migration', () => {
  it('backfills each configured login provider with its stable issuer', async () => {
    const output = await runMigration(
      accountRows,
      `
      SELECT "issuer" || '|' || "accountId"
      FROM "account"
      ORDER BY "issuer";
      `,
    )

    expect(output.split('\n')).toEqual([
      'https://accounts.google.com|google-subject',
      'https://www.facebook.com|facebook-subject',
      'local:credential|user-1',
    ])
  })

  it('refuses an account provider without an explicit issuer mapping', async () => {
    await expect(
      runMigration(`
        INSERT INTO "user" VALUES ('user-1');
        INSERT INTO "account" (
          "id", "userId", "accountId", "providerId", "createdAt", "updatedAt"
        ) VALUES ('unknown-1', 'user-1', 'unknown-subject', 'unknown', 0, 0);
      `),
    ).rejects.toThrow('NOT NULL constraint failed: account_new.issuer')
  })
})
