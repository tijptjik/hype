import { test, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backfillPreparedMessaging } from './rebuild-stage'

test('backfill targets only the prepared database and reports partial provider failures', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hype-messaging-stage-'))
  const path = join(directory, 'prepared.sqlite')
  const db = new Database(path)
  db.exec(
    "CREATE TABLE organisation(id TEXT,code TEXT,isArchived INTEGER); CREATE TABLE messagingAccount(organisationId TEXT,enabled INTEGER,externalAccountId TEXT); INSERT INTO organisation VALUES ('org','test-org',0)",
  )
  let calls = 0
  const run = async (command: string[]): Promise<string> => {
    calls++
    expect(command).toEqual([
      'bun',
      'scripts/messaging/backfill-phone-lookups.ts',
      '--organisation',
      'test-org',
      '--database',
      path,
      '--limit',
      '500',
      '--apply',
    ])
    return '{"checked":2,"registered":1,"unavailable":1,"remaining":3}\n'
  }
  try {
    await expect(backfillPreparedMessaging(path, 'test-org', run)).rejects.toThrow(
      'linked, enabled account',
    )
    expect(calls).toBe(0)
    db.exec("INSERT INTO messagingAccount VALUES ('org',1,'linked')")
    expect(await backfillPreparedMessaging(path, 'test-org', run)).toMatchObject({
      status: 'partial',
      checked: 2,
      organisation: 'test-org',
    })
    expect(calls).toBe(1)
  } finally {
    db.close()
    rmSync(directory, { recursive: true })
  }
})
