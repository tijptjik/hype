// NODE
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
// TYPES
import type { D1Database, R2Bucket, R2PutOptions } from '@cloudflare/workers-types'
import type { Database } from '../../../src/lib/types'
import type { Target } from './fetch'

/** Execute an argv-only subprocess and fail on nonzero status. @param argv Executable and arguments. @returns Completion. */
export async function run(argv: string[]): Promise<void> {
  const process = Bun.spawn(argv, { stdout: 'inherit', stderr: 'inherit' })
  if (await process.exited) throw new Error(`Command failed: ${argv[0]}`)
}

/** Open explicitly selected bindings; development uploads precede local publication pointers.
 * @param target Environment selection. @param publish Whether remote dev writes are enabled. @returns Database, bucket and disposer.
 * @remarks Production uses Wrangler authenticated remote D1/R2 bindings. No migrations or deployment are performed.
 */
export async function openStorage(
  target: Target,
  publish: boolean,
): Promise<{ db: Database; bucket: R2Bucket; dispose: () => Promise<void> }> {
  const root = resolve(import.meta.dir, '../../..')
  type Binding = {
    binding: string
    database_name: string
    database_id: string
    migrations_dir?: string
  }
  type Environment = { d1_databases: Binding[] }
  const config = Bun.TOML.parse(
    await Bun.file(join(root, 'wrangler.toml')).text(),
  ) as Environment & { account_id: string; env: { production: Environment } }
  const environment = target === 'prod' ? config.env.production : config
  const database = environment.d1_databases.find(
    (binding: Binding) => binding.binding === 'DB',
  )
  if (!database?.database_id) throw new Error('Missing target D1 configuration')
  const bucketName = target === 'prod' ? 'hype-assets-raw-prod' : 'hype-assets-raw-dev'
  const temporary = await mkdtemp(join(tmpdir(), 'hype-indoor-bindings-'))
  const configPath = join(temporary, 'wrangler.json')
  await Bun.write(
    configPath,
    JSON.stringify({
      name: 'hype-indoor-dataops',
      account_id: config.account_id,
      compatibility_date: '2026-11-01',
      d1_databases: [
        { ...database, migrations_dir: undefined, remote: target === 'prod' },
      ],
      r2_buckets: [
        { binding: 'MAPS', bucket_name: bucketName, remote: target === 'prod' },
      ],
    }),
  )
  const proxy = await getPlatformProxy<{ DB: D1Database; MAPS: R2Bucket }>({
    configPath,
    persist: { path: join(root, '.wrangler/state/v3') },
    remoteBindings: target === 'prod',
    envFiles: [],
  })
  const original = proxy.env.MAPS
  const bucket =
    target === 'local' && publish
      ? new Proxy(original, {
          get(object, key) {
            if (key === 'put')
              return async (name: string, value: string, options: unknown) => {
                if (
                  typeof value !== 'string' ||
                  !/^premises-maps\/[a-z0-9-]+\/releases\/[a-f0-9]{64}\.json$/.test(
                    name,
                  )
                )
                  throw new Error('Unexpected publication object')
                const file = join(temporary, `${name.split('/').at(-1)}`)
                await Bun.write(file, value)
                try {
                  // Immutable remote objects must exist before the local app starts advertising their release.
                  await run([
                    'rclone',
                    'copyto',
                    file,
                    `r2-tijpdata:${bucketName}/${name}`,
                    '--immutable',
                    '--checksum',
                    '--quiet',
                  ])
                  return await object.put(name, value, options as R2PutOptions)
                } finally {
                  await rm(file, { force: true })
                }
              }
            const value = Reflect.get(object, key)
            return typeof value === 'function' ? value.bind(object) : value
          },
        })
      : original
  return {
    // Wrangler and the legacy Miniflare dependency expose different D1 SDK types for the same binding interface.
    db: drizzle(proxy.env.DB as unknown as Parameters<typeof drizzle>[0]) as Database,
    bucket,
    dispose: async () => {
      await proxy.dispose()
      await rm(temporary, { recursive: true, force: true })
    },
  }
}
