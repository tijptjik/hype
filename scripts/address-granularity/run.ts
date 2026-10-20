// NODE
import { readFileSync } from 'node:fs'
// DATABASE
import { localDatabase, remoteDatabase } from './database'
import { repairGranularities } from './repair'

const [mode, target, flag] = Bun.argv.slice(2)
if (
  !['--local', '--remote'].includes(mode ?? '') ||
  !target ||
  (flag && flag !== '--apply')
)
  throw new Error(
    'Usage: bun scripts/address-granularity/run.ts --local PATH|--remote preview|production [--apply]',
  )
const apply = flag === '--apply'
process.umask(0o077)
if (mode === '--local') {
  const db = localDatabase(target, apply)
  try {
    console.log(JSON.stringify(await repairGranularities(db.query, apply)))
  } finally {
    db.close()
  }
} else {
  if (!['preview', 'production'].includes(target))
    throw new Error('Invalid deployment environment')
  const config = Bun.TOML.parse(readFileSync('wrangler.toml', 'utf8')) as {
    account_id: string
    env: Record<string, { d1_databases: { binding: string; database_id: string }[] }>
  }
  const binding = config.env[target]?.d1_databases.find(d => d.binding === 'DB')
  if (!binding) throw new Error('Missing DB binding')
  const query = remoteDatabase(
    process.env.CLOUDFLARE_ACCOUNT_ID ?? config.account_id,
    binding.database_id,
    process.env.CLOUDFLARE_API_TOKEN ?? '',
  )
  console.log(JSON.stringify(await repairGranularities(query, apply)))
  if (apply && Object.keys(await repairGranularities(query, false)).length)
    throw new Error('Granularity repair incomplete')
}
