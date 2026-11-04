// NODE
import { readFileSync, writeFileSync } from 'node:fs'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// PIPELINE
import {
  applyRemoteAdoption,
  remoteAdoptionHash,
  type RemoteAdoptionPlan,
} from './lib/target-adoption-remote'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

/** Apply or verify a pinned, privately rehearsed account adoption plan.
 * @returns Completion after a private aggregate receipt is persisted.
 * @remarks Bundle for Node; Wrangler remote bindings do not support Bun's fetch.
 * The caller must use the approved production binding and retain the recovery bookmark.
 */
async function main(): Promise<void> {
  process.umask(0o077)
  const args = new Map<string, string>()
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i],
      value = process.argv[i + 1]
    if (
      ![
        '--plan',
        '--expect-hash',
        '--target',
        '--config',
        '--receipt',
        '--mode',
      ].includes(key) ||
      !value ||
      args.has(key)
    )
      throw new Error('Invalid adoption arguments')
    args.set(key, value)
  }
  const required = (key: string): string => {
    const value = args.get(key)
    if (!value) throw new Error('Missing adoption argument')
    return value
  }
  const plan = JSON.parse(
    readFileSync(required('--plan'), 'utf8'),
  ) as RemoteAdoptionPlan
  const config = JSON.parse(readFileSync(required('--config'), 'utf8'))
  const binding = config.d1_databases?.find(
    (b: { binding: string }) => b.binding === 'DB',
  )
  if (
    binding?.database_name !== 'hype-db-prod' ||
    required('--target') !== `production:${binding.database_id}` ||
    plan.targetIdentity !== required('--target') ||
    remoteAdoptionHash(plan) !== required('--expect-hash')
  )
    throw new Error('Adoption target or plan hash differs')
  if (!['verify', 'apply'].includes(required('--mode')))
    throw new Error('Invalid adoption mode')
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: required('--config'),
    envFiles: [],
    persist: false,
    remoteBindings: true,
  })
  try {
    const outcome =
      required('--mode') === 'apply'
        ? await applyRemoteAdoption(
            proxy.env.DB,
            plan,
            required('--expect-hash'),
            required('--target'),
          )
        : await proxy.env.DB.batch(
            plan.before.map(s => proxy.env.DB.prepare(s.sql).bind(...s.params)),
          ).then(() => ({ verified: true, writes: 0 }))
    const receipt = {
      ...outcome,
      targetIdentity: plan.targetIdentity,
      checkedAt: new Date().toISOString(),
    }
    writeFileSync(required('--receipt'), JSON.stringify(receipt, null, 2), {
      mode: 0o600,
      flag: 'wx',
    })
    console.log(JSON.stringify(receipt))
  } finally {
    await proxy.dispose()
  }
}
main().catch(error => {
  const receiptIndex = process.argv.indexOf('--receipt')
  if (receiptIndex >= 0 && process.argv[receiptIndex + 1])
    writeFileSync(
      `${process.argv[receiptIndex + 1]}.error.json`,
      JSON.stringify({
        name: error?.name,
        message: error?.message,
        cause: error?.cause?.message,
      }),
      { mode: 0o600 },
    )
  console.error(
    'Adoption stopped; no identity values logged. Preserve the private plan and check current before/after state before retrying.',
  )
  process.exitCode = 1
})
