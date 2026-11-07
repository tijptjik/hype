// TESTS
import { afterEach, expect, test } from 'bun:test'
// NODE
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// DOMAIN
import { setQueueMaintenance } from './queues'
import { handleRevisionDeployment } from '../../../src/lib/server/revisionDeployment'

const fetchBefore = globalThis.fetch
const tokenBefore = process.env.CLOUDFLARE_API_TOKEN
const paths: string[] = []
afterEach(() => {
  globalThis.fetch = fetchBefore
  if (tokenBefore === undefined) delete process.env.CLOUDFLARE_API_TOKEN
  else process.env.CLOUDFLARE_API_TOKEN = tokenBefore
  for (const p of paths.splice(0)) rmSync(p, { recursive: true, force: true })
})

test('restores prior queue delivery state across retries without unpausing an independently paused queue', async () => {
  process.env.CLOUDFLARE_API_TOKEN = 'test-only'
  const root = mkdtempSync(join(tmpdir(), 'revision-queues-'))
  paths.push(root)
  const paused: Record<string, boolean> = { first: false, second: true }
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const name = new URL(String(input)).searchParams.get('name')!
    return Response.json({
      success: true,
      result: [
        {
          queue_id: name,
          queue_name: name,
          settings: { delivery_paused: paused[name] },
        },
      ],
    })
  }) as typeof fetch
  const commands: string[][] = []
  const run = async (args: string[]): Promise<void> => {
    commands.push(args)
    paused[args.at(-1)!] = args[3] === 'pause-delivery'
  }
  const receipt = join(root, 'queues.json')
  await setQueueMaintenance('account', ['first', 'second'], receipt, true, run)
  await setQueueMaintenance('account', ['first', 'second'], receipt, true, run)
  await setQueueMaintenance('account', ['first', 'second'], receipt, false, run)
  expect(commands.map(c => c.slice(3))).toEqual([
    ['pause-delivery', 'first'],
    ['resume-delivery', 'first'],
  ])
  expect(paused).toEqual({ first: false, second: true })
})

test('serves only matching release health under maintenance and never lets an old release reopen writes', async () => {
  let state = { planHash: 'release', phase: 'verified', writable: 0 }
  const event = {
    url: new URL('https://hype.hk/api/health/revisions'),
    request: new Request('https://hype.hk/api/health/revisions'),
    locals: {
      platform: {
        env: {
          REVISION_RELEASE: 'release',
          DB: { prepare: () => ({ first: async () => state }) },
        },
      },
    },
  }
  const resolve = async () => new Response('application')
  const invoke = () => handleRevisionDeployment({ event, resolve } as never)
  expect((await invoke()).status).toBe(200)
  event.url = new URL('https://hype.hk/admin')
  expect((await invoke()).status).toBe(503)
  state = { ...state, phase: 'active' }
  expect(await (await invoke()).text()).toBe('application')
  state = { ...state, planHash: 'different' }
  expect((await invoke()).status).toBe(503)
})
