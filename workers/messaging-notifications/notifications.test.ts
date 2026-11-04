// Synthetic SQLite and push transport; these tests never contact a messaging account or push vendor.
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MessagingNotifications, { NotificationDelivery, validEndpoint } from './index'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      public ctx: any,
      public env: any,
    ) {}
  },
  WorkerEntrypoint: class {
    constructor(
      public ctx: any,
      public env: any,
    ) {}
  },
}))

const databases: DatabaseSync[] = []
let now = 1_800_000_000_000
let subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
let db: DatabaseSync
let environment: any
let worker: MessagingNotifications
let instances: Map<string, NotificationDelivery>
let messages: any[]
const sendPush = vi.fn()

function sqlite() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  return db
}
function delivery(org = 'org') {
  return environment.DELIVERY.getByName(`organisation:${org}`) as NotificationDelivery
}
function message(id: string, sequence: number, extra = {}) {
  return {
    id,
    sequence,
    chat: '42',
    sender: '42',
    timestamp: now + 1,
    fromMe: false,
    ...extra,
  }
}

beforeEach(async () => {
  vi.useRealTimers()
  now = 1_800_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  vi.stubGlobal(
    'fetch',
    sendPush
      .mockReset()
      .mockImplementation(async () => new Response(null, { status: 201 })),
  )
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  subscription = {
    endpoint: 'https://fcm.googleapis.com/synthetic-a',
    keys: {
      p256dh: Buffer.from(
        await crypto.subtle.exportKey('raw', keyPair.publicKey),
      ).toString('base64url'),
      auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
        'base64url',
      ),
    },
  }
  db = sqlite()
  db.exec(`
    CREATE TABLE user(id TEXT PRIMARY KEY,isAnonymous INT DEFAULT 0,isArchived INT DEFAULT 0,telephone TEXT);
    CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT,isArchived INT DEFAULT 0);
    CREATE TABLE organisationRole(organisationId TEXT,userId TEXT,role TEXT);
    CREATE TABLE hubRole(hubId TEXT,userId TEXT,role TEXT);
    CREATE TABLE hub(id TEXT,code TEXT);
    CREATE TABLE messagingAccount(id TEXT,organisationId TEXT,platform TEXT,bridgeAccountId TEXT,enabled INT,externalAccountId TEXT);
    CREATE TABLE userMessagingIdentity(userId TEXT,platform TEXT,address TEXT,verifiedAt INT,sourceTelephone TEXT);
    CREATE TABLE messagingConversation(accountId TEXT,chatId TEXT,recipientUserId TEXT);
    INSERT INTO user(id) VALUES ('operator'),('recipient');
    INSERT INTO organisation(id,hubId) VALUES ('org','hub'),('other','hub');
    INSERT INTO organisationRole VALUES ('org','operator','member'),('other','operator','member');
    INSERT INTO messagingAccount VALUES ('account','org','telegram','bridge',1,'native');
    INSERT INTO userMessagingIdentity VALUES ('recipient','telegram','42',1,NULL);
  `)
  instances = new Map()
  messages = []
  environment = {
    DB: {
      prepare(query: string) {
        return {
          bind(...bindings: any[]) {
            return {
              first: async () => db.prepare(query).get(...bindings),
              all: async () => ({ results: db.prepare(query).all(...bindings) }),
            }
          },
        }
      },
    },
    TELEGRAM: {
      watch: vi.fn(),
      snapshot: vi.fn(async (_: string, after: number) => ({
        messages: messages.filter(message => message.sequence > after),
      })),
    },
    WHATSOVER: { watch: vi.fn(), snapshot: vi.fn(async () => ({ messages: [] })) },
    DELIVERY: {
      getByName(name: string) {
        if (!instances.has(name)) {
          const sql = sqlite(),
            values = new Map()
          const state = {
            blockConcurrencyWhile: (fn: () => Promise<any>) => fn(),
            storage: {
              get: async (key: string) => values.get(key),
              put: async (key: string, value: unknown) => {
                values.set(key, structuredClone(value))
              },
              setAlarm: vi.fn(),
              sql: {
                exec(query: string, ...bindings: any[]) {
                  if (query.includes('CREATE TABLE')) {
                    sql.exec(query)
                    return { toArray: () => [] }
                  }
                  return { toArray: () => sql.prepare(query).all(...bindings) }
                },
              },
            },
          }
          // Execute mutations immediately like Durable Object SQLite, rather than lazily on toArray().
          state.storage.sql.exec = (query: string, ...bindings: any[]) => {
            if (query.includes('CREATE TABLE')) {
              sql.exec(query)
              return { toArray: () => [] }
            }
            const rows = sql.prepare(query).all(...bindings)
            return { toArray: () => rows }
          }
          instances.set(name, new NotificationDelivery(state as any, environment))
        }
        return instances.get(name)!
      },
    },
  }
  worker = new MessagingNotifications({} as any, environment)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const db of databases.splice(0)) db.close()
})

it('delivers only new unread HYPE-user messages and deduplicates later receipt replays', async () => {
  await worker.subscribe('operator', 'org', subscription, 'https://hype.example')
  messages = [
    message('new', 1),
    message('read', 2, { readByMe: true }),
    message('old', 3, { timestamp: now - 1 }),
    message('own', 4, { fromMe: true }),
    message('reaction', 5, { content: { kind: 'reaction' } }),
    message('stranger', 6, { chat: '77' }),
  ]
  await delivery().alarm()
  expect(sendPush).toHaveBeenCalledTimes(1)
  expect(sendPush.mock.calls[0][0]).toBe(subscription.endpoint)
  expect(sendPush.mock.calls[0][1].redirect).toBe('error')
  messages = [message('new', 7)]
  await delivery().alarm()
  expect(sendPush).toHaveBeenCalledTimes(1)
})

it('retries a failed subscriber without delaying or duplicating successful subscribers', async () => {
  await worker.subscribe('operator', 'org', subscription, 'https://hype.example')
  await worker.subscribe(
    'operator',
    'org',
    { ...subscription, endpoint: 'https://fcm.googleapis.com/synthetic-b' },
    'https://hype.example',
  )
  messages = [message('new', 1)]
  sendPush.mockResolvedValueOnce(new Response(null, { status: 503 }))
  await delivery().alarm()
  expect(sendPush).toHaveBeenCalledTimes(2)
  await delivery().alarm()
  expect(sendPush).toHaveBeenCalledTimes(3)
  await delivery().alarm()
  expect(sendPush).toHaveBeenCalledTimes(3)
})

it('suppresses focused alerts, retains deduplication on renewal, and isolates organisation subscriptions', async () => {
  await worker.subscribe('operator', 'org', subscription, 'https://hype.example')
  await worker.subscribe('operator', 'other', subscription, 'https://hype.example')
  await worker.focus('operator', 'org', subscription.endpoint)
  messages = [message('focused', 1)]
  await delivery().alarm()
  expect(sendPush).not.toHaveBeenCalled()
  now += 29 * 86400000
  await worker.subscribe('operator', 'org', subscription, 'https://hype.example')
  now += 2 * 86400000
  messages = [message('focused', 2)]
  await delivery().alarm()
  expect(sendPush).not.toHaveBeenCalled()
  await worker.unsubscribe('operator', 'org', subscription.endpoint)
  expect(await worker.status('operator', 'org', subscription.endpoint)).toBe(false)
  expect(instances.has('organisation:other')).toBe(true)
})

it('removes invalid endpoints and revoked memberships before subsequent polls', async () => {
  await worker.subscribe('operator', 'org', subscription, 'https://hype.example')
  messages = [message('new', 1)]
  sendPush.mockResolvedValueOnce(new Response(null, { status: 410 }))
  await delivery().alarm()
  expect(await worker.status('operator', 'org', subscription.endpoint)).toBe(false)
  await worker.subscribe('operator', 'org', subscription, 'https://hype.example')
  db.exec("DELETE FROM organisationRole WHERE organisationId='org'")
  messages = [message('later', 2)]
  await delivery().alarm()
  expect(await worker.status('operator', 'org', subscription.endpoint)).toBe(false)
  expect(sendPush).toHaveBeenCalledTimes(1)
  await expect(
    worker.subscribe('operator', 'org', subscription, 'https://hype.example'),
  ).rejects.toThrow('Organisation access required')
})

it('rejects arbitrary endpoints and exposes no public HTTP service', async () => {
  expect(validEndpoint('https://fcm.googleapis.com.attacker.example/a')).toBe(false)
  expect(validEndpoint('http://127.0.0.1/a')).toBe(false)
  expect(validEndpoint('https://fcm.googleapis.com:444/a')).toBe(false)
  expect((await worker.fetch()).status).toBe(404)
  await expect(
    worker.subscribe(
      'operator',
      'org',
      { ...subscription, endpoint: 'https://arbitrary.example' },
      'https://hype.example',
    ),
  ).rejects.toThrow('Invalid browser subscription')
})

it('permits relevant hub and core admins while rejecting unrelated hubs and invalid keys', async () => {
  db.exec(
    "DELETE FROM organisationRole; INSERT INTO hub VALUES ('hub','local'),('core','core'),('unrelated','unrelated'); INSERT INTO hubRole VALUES ('unrelated','operator','admin')",
  )
  await expect(
    worker.subscribe('operator', 'org', subscription, 'https://hype.example'),
  ).rejects.toThrow('Organisation access required')
  db.exec("INSERT INTO hubRole VALUES ('hub','operator','admin')")
  await worker.subscribe('operator', 'org', subscription, 'https://hype.example')
  expect(await worker.status('operator', 'org', subscription.endpoint)).toBe(true)
  db.exec("DELETE FROM hubRole; INSERT INTO hubRole VALUES ('core','operator','admin')")
  await worker.subscribe('operator', 'other', subscription, 'https://hype.example')
  expect(await worker.status('operator', 'other', subscription.endpoint)).toBe(true)
  await expect(
    worker.subscribe(
      'operator',
      'org',
      { ...subscription, keys: { auth: 'a', p256dh: 'b' } },
      'https://hype.example',
    ),
  ).rejects.toThrow('Invalid browser subscription keys')
})
