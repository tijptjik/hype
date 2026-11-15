/** Verify index pagination against local catalogue state without changing records. */
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
// SERVICES
import { searchIdentityCatalogue } from '../../src/lib/db/services/identityCatalogue'
// TYPES
import type { Database } from '../../src/lib/types'
import type { D1Database } from '@cloudflare/workers-types'

const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: './wrangler.local.toml',
  remoteBindings: false,
})
try {
  const db = drizzle(proxy.env.DB) as Database
  for (const kind of ['brand', 'group'] as const) {
    let after: { name: string; id: string } | undefined
    const ids: string[] = []
    let pages = 0
    for (;;) {
      const rows = await searchIdentityCatalogue(db, kind, '', undefined, false, null, {
        after,
      })
      const page = rows.slice(0, 50)
      ids.push(...page.map(row => row.id))
      pages++
      if (rows.length <= 50) break
      const last = page.at(-1)!
      after = { name: last.i18n.en?.name ?? '', id: last.id }
    }
    const expected = await db.get<{ total: number }>(
      sql`SELECT count(*) total FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version WHERE c.kind=${kind} AND coalesce(json_extract(r.content,'$.isArchived'),0)=0`,
    )
    if (ids.length !== expected?.total || new Set(ids).size !== ids.length)
      throw new Error(`Pagination mismatch: ${kind}`)
    console.log(JSON.stringify({ kind, count: ids.length, pages, duplicates: 0 }))
  }
} finally {
  await proxy.dispose()
}
