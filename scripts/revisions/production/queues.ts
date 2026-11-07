// NODE
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export type QueueState = { name: string; id: string; paused: boolean }
/** Inspect actual delivery settings without changing unrelated queues. @param account Target Cloudflare account. @param names Configured release queues. @returns Original queue identities/settings. */
export async function readQueues(
  account: string,
  names: string[],
): Promise<QueueState[]> {
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token)
    throw new Error('CLOUDFLARE_API_TOKEN is required to verify queue delivery state')
  const result: QueueState[] = []
  for (const name of names) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/queues?name=${encodeURIComponent(name)}`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      },
    )
    const body = (await response.json()) as {
      success: boolean
      result: {
        queue_id: string
        queue_name: string
        settings?: { delivery_paused?: boolean }
      }[]
    }
    const matches = body.result?.filter(q => q.queue_name === name)
    if (!response.ok || !body.success || matches?.length !== 1)
      throw new Error(`Unable to verify queue ${name}`)
    result.push({
      name,
      id: matches[0].queue_id,
      paused: matches[0].settings?.delivery_paused === true,
    })
  }
  return result
}
/** Pause delivery or restore exactly its retained prior state. @param account Target account. @param names Reviewed queues. @param receipt Private original-state file. @param pause Whether to pause or restore. @param run Wrangler executor. @returns Nothing after remote readback. */
export async function setQueueMaintenance(
  account: string,
  names: string[],
  receipt: string,
  pause: boolean,
  run: (command: string[], label: string) => Promise<unknown>,
): Promise<void> {
  const live = await readQueues(account, names)
  if (!existsSync(receipt)) {
    if (!pause) throw new Error('Original queue state receipt missing')
    writeFileSync(receipt, JSON.stringify(live, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    })
  }
  const before = JSON.parse(readFileSync(receipt, 'utf8')) as QueueState[]
  if (
    before.length !== live.length ||
    before.some(q => !live.some(l => l.id === q.id && l.name === q.name))
  )
    throw new Error('Queue set changed')
  for (const q of before) {
    const wanted = pause || q.paused
    if (live.find(l => l.id === q.id)!.paused !== wanted)
      await run(
        [
          'bun',
          'wrangler',
          'queues',
          wanted ? 'pause-delivery' : 'resume-delivery',
          q.name,
        ],
        `queue-${q.name}-${wanted ? 'pause' : 'resume'}`,
      )
  }
  const after = await readQueues(account, names)
  if (after.some(q => q.paused !== (pause || before.find(b => b.id === q.id)!.paused)))
    throw new Error('Queue delivery verification failed')
}
