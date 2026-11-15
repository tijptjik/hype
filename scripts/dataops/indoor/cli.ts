// NODE
import { mkdir, rename, statfs } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { parseArgs } from 'node:util'
// DOMAIN
import { fetchSnapshot, type Target } from './fetch'
import { compareSnapshot, publishSnapshot, readSnapshot } from './refresh'
import { openStorage } from './storage'
import { reconcileLegacyBaseline } from './legacy'

// TOC: Explicit CLI selection | Monthly catch-up | Command dispatch
/** Parse a strictly selected environment. @param value CLI option. @returns Valid target. */
export function parseTarget(value: string | undefined): Target {
  if (value !== 'local' && value !== 'prod')
    throw new Error('--target local|prod is required')
  return value
}

/** Run the CLI without implicit publication or implicit production selection.
 * @param args Command arguments. @returns Completion.
 */
export async function main(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      target: { type: 'string' },
      snapshot: { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean' },
      map: { type: 'string' },
      source: { type: 'string' },
      'actor-user-id': { type: 'string' },
      apply: { type: 'boolean' },
    },
  })
  if (parsed.values.help || !parsed.positionals.length) {
    console.log(
      'bun run dataops -- indoor:fetch-mtr|indoor:fetch-buildings --target local|prod [--out NEW_DIRECTORY]\nbun run dataops -- indoor:compare|indoor:publish --target local|prod --snapshot DIRECTORY\nbun run dataops -- indoor:monthly --target local|prod\nbun run dataops -- indoor:reconcile-baseline --target local|prod --map MAP_ID --source ORIGINAL_DIRECTORY --actor-user-id USER_ID [--apply]',
    )
    return
  }
  const command = parsed.positionals[0],
    target = parseTarget(parsed.values.target)
  if (
    parsed.positionals.length !== 1 ||
    ![
      'indoor:fetch-mtr',
      'indoor:fetch-buildings',
      'indoor:compare',
      'indoor:publish',
      'indoor:monthly',
      'indoor:reconcile-baseline',
    ].includes(command)
  )
    throw new Error('Unknown indoor Data Ops command')
  const state = join(homedir(), '.local/state/hype/indoor-dataops', target)
  await mkdir(state, { recursive: true })
  const free = await statfs(state)
  if (Number(free.bavail) * Number(free.bsize) < 1024 ** 3)
    throw new Error('Less than 1 GiB free; refusing a new map operation')
  const newDirectory = (family: string): string =>
    join(state, `${new Date().toISOString().replace(/[:.]/g, '-')}-${family}`)
  if (command === 'indoor:reconcile-baseline') {
    const { map, source, 'actor-user-id': actorId, apply } = parsed.values
    if (!map || !source || !actorId)
      throw new Error('--map, --source and --actor-user-id are required')
    const storage = await openStorage(target, Boolean(apply))
    try {
      console.log(
        JSON.stringify(
          await reconcileLegacyBaseline(storage.db, storage.bucket, {
            id: map,
            sourceDirectory: resolve(source),
            actorId,
            apply: Boolean(apply),
          }),
          null,
          2,
        ),
      )
    } finally {
      await storage.dispose()
    }
    return
  }
  if (command.startsWith('indoor:fetch-')) {
    const dataset = command === 'indoor:fetch-mtr' ? 'mtr' : 'buildings'
    const directory = parsed.values.out
      ? resolve(parsed.values.out)
      : newDirectory(dataset)
    await fetchSnapshot(dataset, target, directory)
    console.log(`Snapshot: ${directory}`)
    return
  }
  if (command === 'indoor:monthly') {
    const month = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date())
    const marker = join(state, `completed-${month}.json`)
    if (await Bun.file(marker).exists()) {
      console.log(`Monthly refresh already completed: ${month}`)
      return
    }
    const planPath = join(state, `run-${month}.json`)
    const plan: {
      target: Target
      month: string
      snapshots: Partial<Record<'mtr' | 'buildings', string>>
    } = (await Bun.file(planPath).exists())
      ? await Bun.file(planPath).json()
      : { target, month, snapshots: {} }
    if (plan.target !== target || plan.month !== month)
      throw new Error('Monthly checkpoint target mismatch')
    const snapshots: string[] = []
    // A completed monthly run includes both families; failures leave no completion marker.
    for (const dataset of ['mtr', 'buildings'] as const) {
      let directory = plan.snapshots[dataset]
      if (directory) await readSnapshot(directory, target)
      else {
        directory = newDirectory(dataset)
        await fetchSnapshot(dataset, target, directory)
        plan.snapshots[dataset] = directory
        await Bun.write(`${planPath}.tmp`, JSON.stringify(plan, null, 2))
        await rename(`${planPath}.tmp`, planPath)
      }
      const storage = await openStorage(target, true)
      try {
        const report = await publishSnapshot(
          storage.db,
          storage.bucket,
          directory,
          target,
        )
        await Bun.write(
          join(directory, 'publication-report.json'),
          JSON.stringify(report, null, 2),
        )
        snapshots.push(directory)
      } finally {
        await storage.dispose()
      }
    }
    await Bun.write(
      `${marker}.tmp`,
      JSON.stringify(
        { target, month, completedAt: new Date().toISOString(), snapshots },
        null,
        2,
      ),
    )
    await rename(`${marker}.tmp`, marker)
    console.log(`Monthly refresh completed: ${month}`)
    return
  }
  if (!parsed.values.snapshot) throw new Error('--snapshot DIRECTORY is required')
  const directory = resolve(parsed.values.snapshot)
  const storage = await openStorage(target, command === 'indoor:publish')
  try {
    const report = await (command === 'indoor:publish'
      ? publishSnapshot
      : compareSnapshot)(storage.db, storage.bucket, directory, target)
    const file = join(
      directory,
      command === 'indoor:publish' ? 'publication-report.json' : 'comparison.json',
    )
    await Bun.write(file, JSON.stringify(report, null, 2))
    console.log(
      JSON.stringify(
        {
          target,
          report: file,
          counts: report.reduce<Record<string, number>>((counts, row) => {
            counts[row.status] = (counts[row.status] ?? 0) + 1
            return counts
          }, {}),
        },
        null,
        2,
      ),
    )
  } finally {
    await storage.dispose()
  }
}

if (import.meta.main) await main(process.argv.slice(2).filter(arg => arg !== '--'))
