// NODE
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// SERVICES
import { prepareDivisions } from '../dev/prepare-divisions'
import { apiRead, geocodeSchema } from '../../workers/division-refresh/src/api'
import { divisionRoles } from '../../workers/division-refresh/src/roles'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Inspects or drains division jobs in an explicitly selected remote environment.
 * @param args Target followed optionally by --apply.
 * @returns Nothing after inspection or verified completion.
 * @remarks Defaults to read-only inspection. Uses remote D1 bindings and the same
 * fenced writer as cron; never resets checkpoints, leases or existing memberships.
 */
export async function prepareRemoteDivisions(args: string[]): Promise<void> {
  const [target, mode] = args
  if (
    !['production', 'preview'].includes(target) ||
    args.length > 2 ||
    (mode !== undefined && mode !== '--apply')
  ) {
    throw new Error(
      'Usage: node --import tsx scripts/cloud/prepare-divisions.ts <production|preview> [--apply]',
    )
  }
  const config = JSON.parse(
    await readFile('workers/division-refresh/wrangler.jsonc', 'utf8'),
  )
  const environment = config.env[target]
  const api = {
    baseUrl: environment.vars.SAANSEOI_BASE_URL as string,
    token: process.env.SAANSEOI_API_KEY,
  }
  if (mode === '--apply') {
    if (!api.token)
      throw new Error('Set server-side SAANSEOI_API_KEY before applying.')
    // Reject invalid credentials or an unpublished API before any production mutation.
    const probe = await apiRead(
      api,
      '/divisions/v0.2/geocode',
      {
        lat: '22.28',
        lng: '114.16',
        locales: 'en,zh-hant',
        profile: 'full',
        geometry: 'saanseoi',
      },
      geocodeSchema,
    )
    console.info(
      JSON.stringify({ target, release: probe.meta.release.apiReleaseSet }),
    )
  }

  // Isolate the explicit remote binding from local mirrors and app service bindings.
  const directory = await mkdtemp(join(tmpdir(), 'hype-division-'))
  try {
    const configPath = join(directory, 'wrangler.json')
    await writeFile(
      configPath,
      JSON.stringify({
        name: 'hype-division-operator',
        compatibility_date: config.compatibility_date,
        compatibility_flags: config.compatibility_flags,
        env: {
          [target]: {
            d1_databases: environment.d1_databases.map(
              (binding: {
                binding: string
                database_name: string
                database_id: string
              }) => ({
                binding: binding.binding,
                database_name: binding.database_name,
                database_id: binding.database_id,
                remote: true,
              }),
            ),
          },
        },
      }),
    )
    const proxy = await getPlatformProxy<{ DB: D1Database }>({
      configPath,
      environment: target,
      remoteBindings: true,
      persist: false,
    })
    try {
      const db = proxy.env.DB.withSession('first-primary')
      const columns = await db
        .prepare('PRAGMA table_info(feature)')
        .all<{ name: string }>()
      const names = new Set(columns.results.map((column) => column.name))
      if (
        [...Object.keys(divisionRoles), 'divisionResolution'].some(
          (name) => !names.has(name),
        )
      )
        throw new Error('Apply migration 0088 before running this writer.')
      console.info(
        JSON.stringify({
          target,
          checkpoint: await db
            .prepare(
              'SELECT phase,appliedRelease,targetRelease,checkedMonth FROM divisionRefresh WHERE id=1',
            )
            .first(),
          jobs: await db
            .prepare(
              'SELECT count(*) AS pending,coalesce(sum(attempts>0),0) AS failed FROM featureDivisionJob',
            )
            .first(),
        }),
      )
      if (mode === '--apply') await prepareDivisions(db, api, target)
    } finally {
      await proxy.dispose()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await prepareRemoteDivisions(process.argv.slice(2))
