import { Database } from 'bun:sqlite'

/** Enrich a prepared HYPE database before validation/installation.
 * @param database Prepared database, never the live destination or Breadline source.
 * @param organisation Explicit organisation code.
 * @param run Private subprocess runner owned by the rebuild receipt workflow.
 * @returns Aggregate backfill outcome; provider failures are reported as partial.
 */
export async function backfillPreparedMessaging(
  database: string,
  organisation: string,
  run: (command: string[], label: string) => Promise<string>,
): Promise<Record<string, unknown>> {
  const db = new Database(database, { readonly: true })
  let accounts: number
  try {
    accounts = db
      .query<{ count: number }, [string]>(
        `SELECT count(*) AS count FROM messagingAccount a JOIN organisation o ON o.id=a.organisationId WHERE o.code=? AND o.isArchived=0 AND a.enabled=1 AND a.externalAccountId IS NOT NULL`,
      )
      .get(organisation)!.count
  } finally {
    db.close()
  }
  if (!accounts)
    throw new Error(
      `Messaging backfill requires a linked, enabled account for ${organisation} in the prepared HYPE database; no local-only account is copied automatically`,
    )
  const output = await run(
    [
      'bun',
      'scripts/messaging/backfill-phone-lookups.ts',
      '--organisation',
      organisation,
      '--database',
      database,
      '--limit',
      '500',
      '--apply',
    ],
    'messaging-availability',
  )
  const lines = output
    .trim()
    .split('\n')
    .filter(line => line.startsWith('{'))
  const result = JSON.parse(lines.at(-1) ?? '{}')
  if (!Number.isInteger(result.checked) || !Number.isInteger(result.unavailable))
    throw new Error('Messaging backfill did not return a valid receipt')
  return {
    organisation,
    ...result,
    limit: 500,
    status: result.unavailable ? 'partial' : 'batch-complete',
  }
}
