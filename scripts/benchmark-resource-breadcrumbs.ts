// BUN
import { Database } from 'bun:sqlite'

/**
 * Compare direct breadcrumb joins with deduplicated ancestor lookups on a read-only DB.
 * @param path - Local SQLite database path supplied on the command line.
 * @returns Prints repeatable local database timings and payload sizes.
 * @remarks Measures warm SQLite execution only; excludes HTTP, D1 and authorization.
 */
function benchmark(path: string): void {
  const db = new Database(path, { readonly: true })
  const page = db.query(`SELECT id, organisationId, projectId FROM layer ORDER BY id LIMIT 25`)
  const joined = db.query(`SELECT l.id, l.organisationId, l.projectId,
    o.code AS organisationCode, oi.name AS organisationName,
    p.code AS projectCode, pi.name AS projectName
    FROM (SELECT id, organisationId, projectId FROM layer ORDER BY id LIMIT 25) l
    LEFT JOIN organisation o ON o.id = l.organisationId
    LEFT JOIN organisationI18n oi ON oi.organisationId = l.organisationId AND oi.locale = 'en'
    LEFT JOIN project p ON p.id = l.projectId
    LEFT JOIN projectI18n pi ON pi.projectId = l.projectId AND pi.locale = 'en'`)
  const rows = page.all() as Array<{ id: string; organisationId: string; projectId: string }>
  const organisationIds = [...new Set(rows.map(row => row.organisationId))]
  const projectIds = [...new Set(rows.map(row => row.projectId))]
  const organisations = db.query(`SELECT o.id, o.code, i.name FROM organisation o
    LEFT JOIN organisationI18n i ON i.organisationId=o.id AND i.locale='en'
    WHERE o.id IN (${organisationIds.map(() => '?').join(',')})`)
  const projects = db.query(`SELECT p.id, p.code, i.name FROM project p
    LEFT JOIN projectI18n i ON i.projectId=p.id AND i.locale='en'
    WHERE p.id IN (${projectIds.map(() => '?').join(',')})`)
  const strategies = {
    joined: () => joined.all(),
    batched: () => ({ rows: page.all(), organisations: organisations.all(...organisationIds), projects: projects.all(...projectIds) }),
  }
  const results: Record<string, unknown> = {}
  for (const [name, run] of Object.entries(strategies)) {
    for (let i = 0; i < 100; i++) run()
    const times: number[] = []
    for (let i = 0; i < 1000; i++) {
      const start = performance.now()
      run()
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    results[name] = { queries: name === 'joined' ? 1 : 3, medianMs: times[500], p95Ms: times[950], bytes: new TextEncoder().encode(JSON.stringify(run())).length }
  }
  console.log(JSON.stringify({ rows: rows.length, repetitions: 1000, warmups: 100, results }, null, 2))
  db.close()
}

const path = Bun.argv[2]
if (!path) throw new Error('Usage: bun scripts/benchmark-resource-breadcrumbs.ts <sqlite-path>')
benchmark(path)
