// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
// TESTS
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
// DB
import * as schema from '#lib/db/schema/messaging.js'
import { organisation } from '#lib/db/schema/organisation.js'
import {
  dispatchMessagingSend,
  projectMessagingArchive,
  projectMessagingSnapshot,
  readMessagingMessages,
  withMessagingOperators,
  resolveMessagingPhone,
} from '#lib/db/services/messaging.js'
// TYPES
import {
  searchMessagingMedia,
  previewMessagingMedia,
  stageMessagingMedia,
} from '#lib/api/messaging.remote.js'
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'
import type { MessagingAccount } from '#lib/db/services/messaging.js'
import type { BridgeMessage } from '#lib/messaging/types.js'

const state = vi.hoisted(() => ({ ctx: null as unknown as GuardedBaseContext }))
vi.mock('#lib/api/server/guarded.js', () => {
  const wrap =
    (kind: 'query' | 'command') =>
    (
      schema: { parse(value: unknown): unknown },
      handler: (input: unknown, ctx: unknown) => unknown,
    ) =>
      withRemoteMeta(
        async (input: unknown) => handler(schema.parse(input), state.ctx),
        kind,
      )
  return { guardedQuery: wrap('query'), guardedCommand: wrap('command') }
})
import {
  setMessagingConversationArchived,
  setMessagingConversationPinned,
  loadMessagingQuotedMessage,
  markMessagingMessagesRead,
  deleteMessagingMessage,
  searchMessagingMessages,
  checkMessagingUser,
  getMessagingOrganisations,
  getMessagingConversations,
  getMessagingProfile,
  searchMessagingUsers,
  uploadMessagingMedia,
  downloadMessagingMedia,
  getMessagingVoiceTicket,
  declineMessagingCall,
  loadMessagingConversations,
  loadMessagingHistory,
  getMessagingAccounts,
  registerMessagingAccount,
  watchMessagingAccount,
  sendMessagingMessage,
  getMessagingInbox,
  getUserMessagingSettings,
  setUserMessagingPreference,
  setUserMessagingIdentity,
  checkUserMessagingIdentity,
  verifyUserMessagingIdentity,
  openUserMessagingConversation,
} from '#lib/api/messaging.remote.js'

let sqlite: DatabaseSync
let account: MessagingAccount
const meta = { isAdminRequest: true as const }
const status = { connected: true, loggedOut: false, qr: null, qrExpiresAt: null }
const bridge = {
  archive: vi.fn(),
  stickerPacks: vi.fn(),
  catalogItem: vi.fn(),
  searchMedia: vi.fn(),
  catalogMedia: vi.fn(),
  stageMedia: vi.fn(),
  messageAction: vi.fn(),
  start: vi.fn(),
  lookupPhone: vi.fn(),
  upload: vi.fn(),
  media: vi.fn(),
  voiceTicket: vi.fn(),
  callTicket: vi.fn(),
  rejectCall: vi.fn(),
  dialogs: vi.fn(),
  history: vi.fn(),
  watch: vi.fn(),
  send: vi.fn(),
  snapshot: vi.fn(),
  stop: vi.fn(),
  profile: vi.fn(),
}

beforeEach(() => {
  vi.resetAllMocks()
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE user (id TEXT PRIMARY KEY, username TEXT, name TEXT, image TEXT, telephone TEXT, updatedAt INTEGER NOT NULL DEFAULT 1, isAnonymous INTEGER DEFAULT 0, isArchived INTEGER DEFAULT 0); INSERT INTO user(id,username) VALUES ('operator-a','operator_a'), ('operator-b','operator_b')",
  )
  sqlite.exec(
    'CREATE TABLE organisationI18n (organisationId TEXT, locale TEXT, name TEXT)',
  )
  const config = getTableConfig(organisation)
  sqlite.exec(
    `CREATE TABLE organisation (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`).join(',')})`,
  )
  sqlite.exec(
    "INSERT INTO organisation(id, hubId, isArchived) VALUES ('org-a','hub-a',0), ('org-b','hub-b',0)",
  )
  sqlite.exec(readFileSync('migrations/0160_organisation_messaging.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0161_messaging_phone_discovery.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0162_messaging_phone_lookup.sql', 'utf8'))
  sqlite.exec(
    readFileSync('migrations/0163_messaging_conversation_archive.sql', 'utf8'),
  )
  sqlite.exec(readFileSync('migrations/0164_messaging_native_archive.sql', 'utf8'))
  sqlite.exec(
    "INSERT INTO userMessagingIdentity(userId,platform,address,verifiedAt,updatedAt) VALUES ('operator-b','telegram','42',1,1), ('operator-b','whatsapp','15555550100@s.whatsapp.net',1,1)",
  )
  sqlite.exec(readFileSync('migrations/0165_user_messaging_identifiers.sql', 'utf8'))
  sqlite.exec(
    readFileSync('migrations/0166_messaging_discovered_phone_format.sql', 'utf8'),
  )
  sqlite.exec(readFileSync('migrations/0167_messaging_conversation_pins.sql', 'utf8'))
  // Exercise actual Drizzle D1 SQL, including atomic batches and JSON projections.
  function prepared(query: string, params: never[] = []) {
    return {
      bind(...values: never[]) {
        return prepared(query, values)
      },
      async raw() {
        const statement = sqlite.prepare(query)
        statement.setReturnArrays(true)
        return statement.all(...params)
      },
      async all() {
        return {
          results: sqlite.prepare(query).all(...params),
          success: true,
          meta: {},
        }
      },
      async run() {
        return { meta: sqlite.prepare(query).run(...params), success: true }
      },
    }
  }
  const client = {
    prepare: prepared,
    async batch(statements: ReturnType<typeof prepared>[]) {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.all())
        sqlite.exec('COMMIT')
        return results
      } catch (cause) {
        sqlite.exec('ROLLBACK')
        throw cause
      }
    },
  }
  const db = drizzle(client as never, { schema: { ...schema, organisation } })
  state.ctx = {
    db,
    user: { id: 'operator-a', isAnonymous: false, superAdmin: false },
    session: { id: 'session-a' },
    userRoles: [{ type: 'organisation', organisationId: 'org-a', role: 'member' }],
    isAdminRequest: true,
    event: {
      url: new URL('https://hype.invalid/admin/messaging'),
      platform: { env: { WHATSOVER: bridge, TELEGRAM: bridge } },
      locals: { platform: { env: { TELEGRAM: bridge, ENVIRONMENT: 'local' } } },
    },
  } as unknown as GuardedBaseContext
  account = {
    id: 'account-a',
    organisationId: 'org-a',
    platform: 'telegram',
    bridgeAccountId: 'bridge-org-a',
    externalAccountId: null,
    displayName: null,
    enabled: true,
    inboxCursor: 0,
    archiveCursor: 0,
    registeredBy: 'operator-a',
    createdAt: 1,
    updatedAt: 1,
  }
  sqlite
    .prepare(
      'INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,enabled,registeredBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run(
      account.id,
      account.organisationId,
      account.platform,
      account.bridgeAccountId,
      1,
      'operator-a',
      1,
      1,
    )
  bridge.watch.mockResolvedValue(status)
  bridge.snapshot.mockResolvedValue({ status, messages: [], outbox: [] })
  let archiveSequence = 0
  bridge.archive.mockImplementation(async (_account, chat, isArchived) => ({
    chat,
    isArchived,
    sequence: ++archiveSequence,
  }))
})
afterEach(() => sqlite.close())

/** Build a complete claim from the identifiers relevant to a scenario. */
function identityFields(
  fields: Partial<import('#lib/messaging/identity.js').MessagingIdentityFields>,
) {
  return { phoneNumber: null, username: null, nativeId: null, ...fields }
}

/** Read the exact saved claim revision being independently verified. */
function identityRevision(userId: string, platform: string): number {
  return (
    sqlite
      .prepare(
        'SELECT updatedAt FROM userMessagingIdentity WHERE userId=? AND platform=?',
      )
      .get(userId, platform) as { updatedAt: number }
  ).updatedAt
}

it('authorizes media search, previews and selection before reaching the account bridge', async () => {
  const input = {
    meta,
    accountId: account.id,
    kind: 'gif' as const,
    query: 'happy',
    offset: 'next',
  }
  const id = crypto.randomUUID()
  bridge.searchMedia.mockResolvedValue({ items: [], nextOffset: null })
  bridge.catalogMedia.mockResolvedValue(new Uint8Array([1, 2]).buffer)
  bridge.stageMedia.mockResolvedValue({
    id,
    content: { kind: 'video', animated: true },
  })
  await searchMessagingMedia(input)
  expect(bridge.searchMedia).toHaveBeenCalledWith('bridge-org-a', {
    kind: 'gif',
    query: 'happy',
    offset: 'next',
  })
  expect(await previewMessagingMedia({ meta, accountId: account.id, id })).toEqual(
    new Uint8Array([1, 2]),
  )
  await stageMessagingMedia({ meta, accountId: account.id, id })
  expect(bridge.stageMedia).toHaveBeenCalledWith('bridge-org-a', id)
  expect(bridge.send).not.toHaveBeenCalled()
  state.ctx.userRoles = []
  for (const action of [
    () => searchMessagingMedia(input),
    () => previewMessagingMedia({ meta, accountId: account.id, id }),
    () => stageMessagingMedia({ meta, accountId: account.id, id }),
  ]) {
    await expect(action()).rejects.toMatchObject({ status: 403 })
  }
  expect(bridge.searchMedia).toHaveBeenCalledOnce()
  expect(bridge.catalogMedia).toHaveBeenCalledOnce()
  expect(bridge.stageMedia).toHaveBeenCalledOnce()
})

it('rejects WhatsApp lookup without an organisation library and unbounded or forged inputs', async () => {
  await expect(
    searchMessagingMedia({
      meta,
      accountId: account.id,
      kind: 'sticker',
      query: 'x'.repeat(201),
    }),
  ).rejects.toThrow()
  await expect(
    stageMessagingMedia({
      meta,
      accountId: account.id,
      id: 'https://example.invalid/file',
    }),
  ).rejects.toThrow()
  sqlite.exec("UPDATE messagingAccount SET platform='whatsapp'")
  await expect(
    searchMessagingMedia({ meta, accountId: account.id, kind: 'gif', query: '' }),
  ).rejects.toMatchObject({ status: 503 })
  expect(bridge.searchMedia).not.toHaveBeenCalled()
  expect(bridge.stageMedia).not.toHaveBeenCalled()
})

it('allows members and scoped admins only within their organisation', async () => {
  expect(await getMessagingAccounts({ meta, organisationId: 'org-a' })).toHaveLength(1)
  await expect(
    getMessagingAccounts({ meta, organisationId: 'org-b' }),
  ).rejects.toMatchObject({ status: 403 })
  state.ctx.userRoles = [
    { type: 'hub', hubId: 'hub-b', role: 'admin', hub: { code: 'other' } },
  ] as never
  await expect(
    watchMessagingAccount({ meta, accountId: account.id, tabId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ status: 403 })
  expect(bridge.watch).not.toHaveBeenCalled()
  state.ctx.userRoles = [
    { type: 'hub', hubId: 'hub-a', role: 'admin', hub: { code: 'a' } },
  ] as never
  await watchMessagingAccount({
    meta,
    accountId: account.id,
    tabId: crypto.randomUUID(),
  })
  expect(bridge.watch).toHaveBeenCalledOnce()
  state.ctx.user.isAnonymous = true
  await expect(
    getMessagingAccounts({ meta, organisationId: 'org-a' }),
  ).rejects.toMatchObject({ status: 403 })
})

it('shares the organisation account across operators but isolates their viewer leases', async () => {
  const tabId = crypto.randomUUID()
  await watchMessagingAccount({ meta, accountId: account.id, tabId })
  state.ctx.user.id = 'operator-b'
  state.ctx.session.id = 'session-b'
  await watchMessagingAccount({ meta, accountId: account.id, tabId })
  expect(bridge.watch.mock.calls.map(call => call[0])).toEqual([
    'bridge-org-a',
    'bridge-org-a',
  ])
  expect(bridge.watch.mock.calls[0][1]).not.toBe(bridge.watch.mock.calls[1][1])
  expect(bridge.watch.mock.calls[0][1]).not.toContain('session-a')
})

it('registers a stable shared account and blocks registration for unrelated organisations', async () => {
  const first = await registerMessagingAccount({
    meta,
    organisationId: 'org-a',
    platform: 'whatsapp',
  })
  const second = await registerMessagingAccount({
    meta,
    organisationId: 'org-a',
    platform: 'whatsapp',
  })
  expect(second).toEqual(first)
  await expect(
    registerMessagingAccount({ meta, organisationId: 'org-b', platform: 'telegram' }),
  ).rejects.toMatchObject({ status: 403 })
})

it('keeps newer edits and cursors when another operator replays an older snapshot', async () => {
  const message: BridgeMessage = {
    sequence: 1,
    id: '1',
    chat: '42',
    sender: '42',
    timestamp: 100,
    fromMe: false,
    text: 'original',
  }
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [message],
    outbox: [],
  })
  await projectMessagingSnapshot(
    state.ctx.db,
    { ...account, inboxCursor: 1 },
    { status, messages: [{ ...message, sequence: 2, text: 'edited' }], outbox: [] },
  )
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [message],
    outbox: [],
  })
  expect(await readMessagingMessages(state.ctx.db, account.id, 0)).toEqual([
    { ...message, sequence: 2, text: 'edited' },
  ])
  expect(sqlite.prepare('SELECT inboxCursor FROM messagingAccount').get()).toEqual({
    inboxCursor: 2,
  })
  expect(
    sqlite.prepare('SELECT count(*) AS count FROM messagingConversation').get(),
  ).toEqual({ count: 1 })
})

it('does not acknowledge an event after a projection write fails', async () => {
  sqlite.exec(
    "CREATE TRIGGER fail_projection BEFORE INSERT ON messagingMessage BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
  )
  await expect(
    projectMessagingSnapshot(state.ctx.db, account, {
      status,
      messages: [
        {
          sequence: 1,
          id: '1',
          chat: '42',
          sender: '42',
          timestamp: 100,
          fromMe: false,
          text: 'hello',
        },
      ],
      outbox: [],
    }),
  ).rejects.toThrow()
  expect(sqlite.prepare('SELECT inboxCursor FROM messagingAccount').get()).toEqual({
    inboxCursor: 0,
  })
  expect(
    sqlite.prepare('SELECT count(*) AS count FROM messagingConversation').get(),
  ).toEqual({ count: 0 })
})

it('freezes sends before external delivery and does not resend an uncertain result', async () => {
  bridge.send.mockImplementation(async () => {
    expect(sqlite.prepare('SELECT state,actorUserId FROM messagingSend').get()).toEqual(
      { state: 'pending', actorUserId: 'operator-a' },
    )
    throw new Error('synthetic lost response')
  })
  const input = {
    meta,
    accountId: account.id,
    requestId: 'stable-send',
    to: '42',
    text: 'hello',
  }
  expect((await sendMessagingMessage(input)).state).toBe('uncertain')
  expect((await sendMessagingMessage(input)).state).toBe('uncertain')
  expect(bridge.send).toHaveBeenCalledOnce()
  await expect(sendMessagingMessage({ ...input, to: '99' })).rejects.toMatchObject({
    status: 409,
  })
  bridge.snapshot.mockResolvedValue({
    status,
    messages: [],
    outbox: [
      {
        request: { requestId: 'stable-send', to: '42', text: 'hello' },
        state: 'submitted',
        messageId: '100',
      },
    ],
  })
  expect(
    (await getMessagingInbox({ meta, accountId: account.id, after: 0 })).outbox[0]
      .state,
  ).toBe('submitted')
})

it('returns saved organisation history when the bridge is unavailable', async () => {
  const message: BridgeMessage = {
    sequence: 1,
    id: '1',
    chat: '42',
    sender: '42',
    timestamp: 100,
    fromMe: false,
    text: 'saved',
  }
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [message],
    outbox: [],
  })
  bridge.snapshot.mockRejectedValue(new Error('synthetic bridge unavailable'))
  const result = await getMessagingInbox({ meta, accountId: account.id, after: 0 })
  expect(result.messages).toEqual([message])
  expect(result.status.connected).toBe(false)
  expect(result.status.lastEvent).toContain('Showing saved history')
})

it('keeps self-entered identities unverified and prevents ordinary users editing another profile', async () => {
  await setUserMessagingPreference({ platform: 'telegram' })
  await setUserMessagingIdentity({
    platform: 'telegram',
    identity: identityFields({ username: '@synthetic' }),
  })
  expect(await getUserMessagingSettings({})).toMatchObject({
    platform: 'telegram',
    identities: [{ username: 'synthetic', nativeId: null, verifiedAt: null }],
  })
  await expect(
    setUserMessagingPreference({ userId: 'operator-b', platform: 'whatsapp' }),
  ).rejects.toMatchObject({ status: 403 })
  await expect(
    openUserMessagingConversation({
      meta,
      organisationId: 'org-a',
      username: 'operator_a',
    }),
  ).rejects.toMatchObject({ status: 409 })
  await expect(
    verifyUserMessagingIdentity({
      meta,
      userId: 'operator-a',
      accountId: account.id,
      expectedUpdatedAt: identityRevision('operator-a', 'telegram'),
      confirmOwnership: true,
    }),
  ).rejects.toMatchObject({ status: 403 })
  expect(bridge.profile).not.toHaveBeenCalled()
})

it('routes to Telegram alone, then defaults to WhatsApp when both are available without repointing conversations', async () => {
  state.ctx.user.superAdmin = true
  await setUserMessagingIdentity({
    userId: 'operator-b',
    platform: 'telegram',
    identity: identityFields({ username: '@synthetic' }),
  })
  bridge.profile.mockResolvedValue({
    jid: '42',
    name: 'Synthetic contact',
    aliases: ['42'],
  })
  await verifyUserMessagingIdentity({
    meta,
    userId: 'operator-b',
    accountId: account.id,
    expectedUpdatedAt: identityRevision('operator-b', 'telegram'),
    confirmOwnership: true,
  })
  sqlite.exec(
    "UPDATE messagingAccount SET externalAccountId='owned-telegram'; INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,externalAccountId,enabled,createdAt,updatedAt) VALUES ('account-wa','org-a','whatsapp','bridge-wa','owned-wa',1,1,1)",
  )
  await setUserMessagingPreference({ userId: 'operator-b', platform: 'telegram' })
  sqlite.exec("DELETE FROM userMessagingIdentity WHERE platform='whatsapp'")
  const telegram = await openUserMessagingConversation({
    meta,
    organisationId: 'org-a',
    username: '@operator_b',
  })
  expect(telegram).toMatchObject({
    accountId: account.id,
    platform: 'telegram',
    chatId: '42',
  })
  await setUserMessagingIdentity({
    userId: 'operator-b',
    platform: 'whatsapp',
    identity: identityFields({ phoneNumber: '+15555550100' }),
  })
  sqlite.exec(
    "UPDATE userMessagingIdentity SET nativeId='15555550100@s.whatsapp.net',verifiedAt=1 WHERE platform='whatsapp'",
  )
  await setUserMessagingPreference({ userId: 'operator-b', platform: 'whatsapp' })
  const whatsapp = await openUserMessagingConversation({
    meta,
    organisationId: 'org-a',
    username: 'operator_b',
  })
  expect(whatsapp).toMatchObject({
    accountId: 'account-wa',
    platform: 'whatsapp',
    chatId: '15555550100@s.whatsapp.net',
  })
  expect(
    sqlite
      .prepare('SELECT accountId,chatId FROM messagingConversation WHERE id=?')
      .get(telegram.id),
  ).toEqual({ accountId: account.id, chatId: '42' })
  await setUserMessagingIdentity({
    userId: 'operator-b',
    platform: 'telegram',
    identity: identityFields({ username: '@changed' }),
  })
  expect(
    (await getUserMessagingSettings({ userId: 'operator-b' })).identities.find(
      row => row.platform === 'telegram',
    )?.verifiedAt,
  ).toBeNull()
})

it('imports independent history without skipping intervening live events or reverting newer edits', async () => {
  const older: BridgeMessage = {
    sequence: 200,
    chat: '42',
    sender: '42',
    id: '1',
    timestamp: 10,
    fromMe: false,
    text: 'older history',
  }
  bridge.history.mockResolvedValue({ messages: [older], nextBefore: '1' })
  const page = await loadMessagingHistory({ meta, accountId: account.id, chat: '42' })
  expect(page.nextBefore).toBe('1')
  expect(bridge.history).toHaveBeenCalledWith('bridge-org-a', '42', undefined)
  expect(sqlite.prepare('SELECT inboxCursor FROM messagingAccount').get()).toEqual({
    inboxCursor: 0,
  })
  bridge.snapshot.mockResolvedValue({
    status,
    messages: [{ ...older, sequence: 1, id: '2', text: 'intervening live event' }],
    outbox: [],
  })
  const inbox = await getMessagingInbox({ meta, accountId: account.id, after: 0 })
  expect(bridge.snapshot).toHaveBeenCalledWith('bridge-org-a', 0, 0)
  expect(inbox.messages.map(row => row.text)).toEqual(['intervening live event'])
  expect(sqlite.prepare('SELECT inboxCursor FROM messagingAccount').get()).toEqual({
    inboxCursor: 1,
  })
  bridge.history.mockResolvedValue({
    messages: [{ ...older, sequence: 201, text: 'newer edit' }],
    nextBefore: null,
  })
  await loadMessagingHistory({ meta, accountId: account.id, chat: '42', before: '1' })
  bridge.history.mockResolvedValue({ messages: [older], nextBefore: null })
  await loadMessagingHistory({ meta, accountId: account.id, chat: '42', before: '1' })
  expect(
    JSON.parse(
      String(
        sqlite
          .prepare("SELECT payload FROM messagingMessage WHERE messageId='1'")
          .get()!.payload,
      ),
    ).text,
  ).toBe('newer edit')
})

it('authorizes history before using the bridge and bounds the native cursor', async () => {
  state.ctx.userRoles = []
  await expect(
    loadMessagingHistory({ meta, accountId: account.id, chat: '42' }),
  ).rejects.toMatchObject({ status: 403 })
  expect(bridge.history).not.toHaveBeenCalled()
  state.ctx.userRoles = [
    { type: 'organisation', organisationId: 'org-a', role: 'member' },
  ] as never
  await expect(
    loadMessagingHistory({
      meta,
      accountId: account.id,
      chat: '42',
      before: '2147483648',
    }),
  ).rejects.toThrow()
  expect(bridge.history).not.toHaveBeenCalled()
})

it('discovers conversations within the organisation without advancing incoming replay', async () => {
  sqlite.exec(
    "INSERT INTO userMessagingIdentity(userId,platform,nativeId,verifiedAt,updatedAt) VALUES ('operator-a','telegram','900',1,1)",
  )
  const message: BridgeMessage = {
    sequence: 80,
    id: '8',
    chat: '900',
    sender: '900',
    timestamp: 100,
    fromMe: false,
    text: 'Archived conversation',
  }
  const cursor = { peer: '42', id: 10, date: 20000 }
  bridge.dialogs.mockResolvedValue({ messages: [message], next: null })
  state.ctx.userRoles = []
  await expect(
    loadMessagingConversations({ meta, accountId: account.id, cursor }),
  ).rejects.toMatchObject({ status: 403 })
  expect(bridge.dialogs).not.toHaveBeenCalled()
  state.ctx.userRoles = [
    { type: 'organisation', organisationId: 'org-a', role: 'member' },
  ] as never
  expect(
    await loadMessagingConversations({ meta, accountId: account.id, cursor }),
  ).toEqual({ messages: [message], next: null })
  expect(bridge.dialogs).toHaveBeenCalledWith('bridge-org-a', cursor)
  expect(sqlite.prepare('SELECT inboxCursor FROM messagingAccount').get()).toEqual({
    inboxCursor: 0,
  })
  expect(sqlite.prepare('SELECT chatId FROM messagingConversation').get()).toEqual({
    chatId: '900',
  })
  expect(await readMessagingMessages(state.ctx.db, account.id, 0)).toEqual([])
})

it('issues Telegram call tickets for the organisation account and the same operator viewer lease', async () => {
  const env = state.ctx.event.platform!.env
  env.TELEGRAM_CALLS_URL = 'wss://synthetic.invalid/calls'
  bridge.callTicket.mockResolvedValue({
    account: 'a'.repeat(64),
    token: 'b'.repeat(64),
    expiresAt: 12345,
  })
  const tabId = crypto.randomUUID()
  await watchMessagingAccount({ meta, accountId: account.id, tabId })
  expect(await getMessagingVoiceTicket({ meta, accountId: account.id, tabId })).toEqual(
    {
      url: `wss://synthetic.invalid/calls/${'a'.repeat(64)}`,
      token: 'b'.repeat(64),
      expiresAt: 12345,
    },
  )
  expect(bridge.callTicket).toHaveBeenCalledWith(
    'bridge-org-a',
    'https://hype.invalid',
    bridge.watch.mock.calls[0][1],
  )
  await declineMessagingCall({ meta, accountId: account.id, id: '123' })
  expect(bridge.rejectCall).toHaveBeenCalledWith('bridge-org-a', '123')
  state.ctx.userRoles = []
  await expect(
    getMessagingVoiceTicket({ meta, accountId: account.id, tabId }),
  ).rejects.toMatchObject({ status: 403 })
  await expect(
    declineMessagingCall({ meta, accountId: account.id, id: '123' }),
  ).rejects.toMatchObject({ status: 403 })
  expect(bridge.callTicket).toHaveBeenCalledOnce()
  expect(bridge.rejectCall).toHaveBeenCalledOnce()
})

it('uses the organisation WhatsApp session for member sends, media and calls across operators', async () => {
  sqlite
    .prepare("UPDATE messagingAccount SET platform='whatsapp' WHERE id=?")
    .run(account.id)
  const env = state.ctx.event.platform!.env
  env.WHATSOVER = bridge as never
  env.WHATSOVER_VOICE_URL = 'ws://127.0.0.1:8793/voice'
  const tabId = crypto.randomUUID(),
    input = { meta, accountId: account.id }
  await watchMessagingAccount({ ...input, tabId })
  state.ctx.user.id = 'operator-b'
  state.ctx.session.id = 'session-b'
  await watchMessagingAccount({ ...input, tabId })
  expect(bridge.watch.mock.calls.map(call => call[0])).toEqual([
    'bridge-org-a',
    'bridge-org-a',
  ])
  expect(bridge.watch.mock.calls[0][1]).not.toBe(bridge.watch.mock.calls[1][1])
  bridge.send.mockImplementation(async (_account, request) => ({
    request,
    state: 'submitted',
    messageId: 'native-1',
  }))
  const request = {
    requestId: 'org-whatsapp',
    to: '15555550100@s.whatsapp.net',
    text: 'Synthetic organisation message',
  }
  await sendMessagingMessage({ ...input, ...request })
  expect(bridge.send).toHaveBeenCalledWith('bridge-org-a', request)
  await sendMessagingMessage({ ...input, ...request })
  expect(bridge.send).toHaveBeenCalledOnce()
  const bytes = new Uint8Array([1, 2, 3])
  bridge.upload.mockResolvedValue({
    id: 'synthetic-attachment',
    content: { kind: 'image' },
  })
  await uploadMessagingMedia({ ...input, kind: 'image', mimeType: 'image/png', bytes })
  expect(bridge.upload).toHaveBeenCalledWith(
    'bridge-org-a',
    { kind: 'image', mimeType: 'image/png' },
    bytes.buffer,
  )
  await expect(
    uploadMessagingMedia({
      ...input,
      kind: 'image',
      mimeType: 'image/png',
      bytes: new Uint8Array(8 * 1024 * 1024 + 1),
    }),
  ).rejects.toThrow()
  bridge.media.mockResolvedValue(bytes.buffer)
  const target = { id: 'native-1', sender: '15555550100@s.whatsapp.net' }
  expect(
    await downloadMessagingMedia({ ...input, chat: target.sender, target }),
  ).toEqual(bytes)
  expect(bridge.media).toHaveBeenCalledWith('bridge-org-a', target.sender, target)
  bridge.voiceTicket.mockResolvedValue({
    account: 'opaque-org-account',
    token: 'synthetic',
    expiresAt: 1234,
  })
  expect(await getMessagingVoiceTicket({ ...input, tabId })).toEqual({
    url: 'ws://127.0.0.1:8793/voice/opaque-org-account',
    token: 'synthetic',
    expiresAt: 1234,
  })
  expect(bridge.voiceTicket).toHaveBeenCalledWith(
    'bridge-org-a',
    'https://hype.invalid',
  )
  await declineMessagingCall({ ...input, id: 'incoming' })
  expect(bridge.rejectCall).toHaveBeenCalledWith('bridge-org-a', 'incoming')
  state.ctx.userRoles = []
  await expect(
    uploadMessagingMedia({ ...input, kind: 'image', mimeType: 'image/png', bytes }),
  ).rejects.toMatchObject({ status: 403 })
  expect(bridge.upload).toHaveBeenCalledOnce()
})

it('does not replace an organisation account identity when concurrent initial snapshots disagree', async () => {
  let arrived = 0,
    release!: () => void
  const ready = new Promise<void>(resolve => {
    release = resolve
  })
  bridge.snapshot.mockImplementation(async () => {
    const index = ++arrived
    if (arrived === 2) release()
    await ready
    return {
      status: {
        ...status,
        identity: {
          id: `synthetic-${index}`,
          name: `Synthetic ${index}`,
          username: null,
          phone: null,
        },
      },
      messages: [],
      outbox: [],
    }
  })
  const results = await Promise.allSettled([
    getMessagingInbox({ meta, accountId: account.id, after: 0 }),
    getMessagingInbox({ meta, accountId: account.id, after: 0 }),
  ])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const rejected = results.find(
    result => result.status === 'rejected',
  ) as PromiseRejectedResult
  expect(rejected.reason).toMatchObject({ status: 409 })
  expect(bridge.stop).toHaveBeenCalledWith('bridge-org-a')
  expect(bridge.stop).toHaveBeenCalledOnce()
  const successful = results.find(
    result => result.status === 'fulfilled',
  ) as PromiseFulfilledResult<Awaited<ReturnType<typeof getMessagingInbox>>>
  expect(
    sqlite
      .prepare('SELECT externalAccountId FROM messagingAccount WHERE id=?')
      .get(account.id),
  ).toEqual({ externalAccountId: successful.value.status.identity!.id })
})

it('links a pre-existing inbox conversation after verification without rewriting or replaying an uncertain send', async () => {
  sqlite.exec("DELETE FROM userMessagingIdentity WHERE platform='telegram'")
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [
      {
        sequence: 1,
        id: '1',
        chat: '42',
        sender: '42',
        timestamp: 100,
        fromMe: false,
        text: 'Synthetic incoming',
      },
    ],
    outbox: [],
  })
  const original = sqlite
    .prepare('SELECT id,recipientUserId FROM messagingConversation')
    .get()!
  expect(original.recipientUserId).toBeNull()
  bridge.send.mockRejectedValue(new Error('Synthetic lost response'))
  const input = {
    meta,
    accountId: account.id,
    requestId: 'before-verified',
    to: '42',
    text: 'Synthetic reply',
  }
  // An existing native chat can have a send receipt before its optional HYPE association is verified.
  const { meta: _meta, accountId: _accountId, ...request } = input
  expect((await dispatchMessagingSend(state.ctx, account, request)).state).toBe(
    'uncertain',
  )
  state.ctx.user.superAdmin = true
  await setUserMessagingIdentity({
    userId: 'operator-b',
    platform: 'telegram',
    identity: identityFields({ username: '@synthetic' }),
  })
  bridge.profile.mockResolvedValue({
    jid: '42',
    name: 'Synthetic contact',
    aliases: ['42'],
  })
  await verifyUserMessagingIdentity({
    meta,
    userId: 'operator-b',
    accountId: account.id,
    expectedUpdatedAt: identityRevision('operator-b', 'telegram'),
    confirmOwnership: true,
  })
  await setUserMessagingPreference({ userId: 'operator-b', platform: 'telegram' })
  sqlite.exec("UPDATE messagingAccount SET externalAccountId='owned-telegram'")
  const opened = await openUserMessagingConversation({
    meta,
    organisationId: 'org-a',
    username: 'operator_b',
  })
  expect(opened.id).toBe(original.id)
  expect(
    sqlite.prepare('SELECT recipientUserId FROM messagingConversation').get(),
  ).toEqual({ recipientUserId: 'operator-b' })
  expect((await sendMessagingMessage(input)).state).toBe('uncertain')
  expect(bridge.send).toHaveBeenCalledOnce()
  expect(sqlite.prepare('SELECT recipientUserId FROM messagingSend').get()).toEqual({
    recipientUserId: null,
  })
  sqlite.exec("UPDATE messagingConversation SET recipientUserId='operator-a'")
  await expect(
    openUserMessagingConversation({
      meta,
      organisationId: 'org-a',
      username: 'operator_b',
    }),
  ).rejects.toMatchObject({ status: 409 })
  expect(
    sqlite.prepare('SELECT recipientUserId FROM messagingConversation').get(),
  ).toEqual({ recipientUserId: 'operator-a' })
})

it('searches HYPE names and usernames within an authorised organisation without resolving provider accounts', async () => {
  sqlite.exec(
    "UPDATE user SET name='Synthetic Person', image='https://example.invalid/avatar.png' WHERE id='operator-b'; UPDATE messagingAccount SET externalAccountId='owned-telegram'; UPDATE user SET preferredMessagingPlatform='telegram' WHERE id='operator-b'",
  )
  expect(
    await searchMessagingUsers({ meta, organisationId: 'org-a', search: 'synthetic' }),
  ).toMatchObject([
    {
      userId: 'operator-b',
      name: 'Synthetic Person',
      username: 'operator_b',
      image: 'https://example.invalid/avatar.png',
      platform: 'telegram',
      accountId: account.id,
      chatId: '42',
      available: true,
      unavailableReason: null,
      checking: false,
    },
  ])
  expect(
    (
      await searchMessagingUsers({
        meta,
        organisationId: 'org-a',
        search: '@operator_a',
      })
    )[0],
  ).toMatchObject({
    available: false,
    platform: 'whatsapp',
    unavailableReason: 'Connect this organisation’s WhatsApp account first',
    chatId: null,
  })
  sqlite.exec("UPDATE user SET name='100% Person' WHERE id='operator-b'")
  expect(
    (await searchMessagingUsers({ meta, organisationId: 'org-a', search: '%' })).map(
      row => row.userId,
    ),
  ).toEqual(['operator-b'])
  sqlite.exec(
    "UPDATE userMessagingIdentity SET verifiedAt=NULL WHERE platform='telegram'",
  )
  expect(
    (
      await searchMessagingUsers({
        meta,
        organisationId: 'org-a',
        search: 'operator_b',
      })
    )[0].channels.find(channel => channel.platform === 'telegram'),
  ).toMatchObject({
    available: false,
    chatId: null,
    unavailableReason:
      'Awaiting ownership verification of the saved messaging identity',
  })
  await expect(
    searchMessagingUsers({ meta, organisationId: 'org-b', search: 'operator_b' }),
  ).rejects.toMatchObject({ status: 403 })
  expect(bridge.profile).not.toHaveBeenCalled()
  expect(bridge.send).not.toHaveBeenCalled()
})

it('includes unassociated native chats and enriches only current verified HYPE matches', async () => {
  const messages: BridgeMessage[] = [
    {
      sequence: 1,
      chat: '42',
      sender: '42',
      id: '1',
      timestamp: 10,
      fromMe: false,
      text: 'Known person',
    },
    {
      sequence: 2,
      chat: '99',
      sender: '99',
      id: '2',
      timestamp: 20,
      fromMe: false,
      text: 'Unknown account',
    },
  ]
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages,
    outbox: [],
  })
  // Older imported rows may lack recipientUserId; a verified identity still provides an explicit association.
  sqlite.exec('UPDATE messagingConversation SET recipientUserId=NULL')
  const conversations = await getMessagingConversations({ meta, accountId: account.id })
  expect(conversations).toHaveLength(2)
  expect(conversations[0]).toMatchObject({
    chatId: '99',
    recipient: null,
    preview: 'Unknown account',
  })
  expect(conversations[1]).toMatchObject({
    accountId: account.id,
    platform: 'telegram',
    chatId: '42',
    recipient: { id: 'operator-b', username: 'operator_b' },
  })
  sqlite.exec(
    "UPDATE messagingConversation SET recipientUserId='operator-a' WHERE chatId='42'",
  )
  const unlinked = await getMessagingConversations({ meta, accountId: account.id })
  expect(unlinked).toHaveLength(2)
  expect(unlinked.every(row => row.recipient === null)).toBe(true)
})

it('replays all native chats and calls without skipping a later HYPE message', async () => {
  const messages: BridgeMessage[] = Array.from({ length: 102 }, (_, index) => ({
    sequence: index + 1,
    chat: index === 101 ? '42' : '99',
    sender: index === 101 ? '42' : '99',
    id: String(index + 1),
    timestamp: index + 1,
    fromMe: false,
    text: index === 101 ? 'Known person' : 'Private external message',
  }))
  bridge.snapshot.mockResolvedValueOnce({
    status,
    messages,
    outbox: [],
    calls: {
      incoming: [
        { id: 'external-call', peer: '99' },
        { id: 'known-call', peer: '42' },
      ],
      current: { peer: '99' },
    },
  })
  const first = await getMessagingInbox({ meta, accountId: account.id, after: 0 })
  expect(first.messages).toHaveLength(100)
  expect(first.messages.every(message => message.chat === '99')).toBe(true)
  expect(first.replayCursor).toBe(100)
  expect(first.calls?.incoming.map(call => call.id)).toEqual([
    'external-call',
    'known-call',
  ])
  expect(first.calls?.current).toMatchObject({ peer: '99' })
  const second = await getMessagingInbox({
    meta,
    accountId: account.id,
    after: first.replayCursor,
  })
  expect(second.messages.map(message => message.id)).toEqual(['101', '102'])
  expect(second.replayCursor).toBe(102)
})

it('rejects arbitrary or no-longer-verified recipients before sending, reading history, media or profiles', async () => {
  const input = { meta, accountId: account.id }
  await expect(
    sendMessagingMessage({
      ...input,
      requestId: 'external-send',
      to: '99',
      text: 'Cannot send',
    }),
  ).rejects.toMatchObject({ status: 403 })
  await expect(loadMessagingHistory({ ...input, chat: '99' })).rejects.toMatchObject({
    status: 403,
  })
  await expect(
    downloadMessagingMedia({ ...input, chat: '99', target: { id: '1', sender: '99' } }),
  ).rejects.toMatchObject({ status: 403 })
  await expect(
    getMessagingProfile({ ...input, address: '@arbitrary' }),
  ).rejects.toMatchObject({ status: 403 })
  sqlite.exec(
    "UPDATE userMessagingIdentity SET verifiedAt=NULL WHERE platform='telegram'",
  )
  await expect(
    sendMessagingMessage({
      ...input,
      requestId: 'revoked-send',
      to: '42',
      text: 'Cannot send',
    }),
  ).rejects.toMatchObject({ status: 403 })
  for (const method of [bridge.send, bridge.history, bridge.media, bridge.profile])
    expect(method).not.toHaveBeenCalled()
  expect(sqlite.prepare('SELECT count(*) AS count FROM messagingSend').get()).toEqual({
    count: 0,
  })
})

it('marks only linked organisation accounts as configured and reports actual membership separately from admin access', async () => {
  sqlite.exec(
    "UPDATE organisation SET code=id; UPDATE messagingAccount SET externalAccountId='owned',enabled=0",
  )
  expect(await getMessagingOrganisations({ meta })).toEqual([
    { id: 'org-a', code: 'org-a', name: 'org-a', hasMessaging: true, isMember: true },
  ])
  state.ctx.user.superAdmin = true
  expect(await getMessagingOrganisations({ meta })).toEqual([
    { id: 'org-a', code: 'org-a', name: 'org-a', hasMessaging: true, isMember: true },
    { id: 'org-b', code: 'org-b', name: 'org-b', hasMessaging: false, isMember: false },
  ])
})

it.each(['missing', 'cleared'] as const)(
  'defaults %s preferences to WhatsApp in settings, search and outreach',
  async mode => {
    state.ctx.user.superAdmin = true
    sqlite.exec(
      "INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,externalAccountId,enabled,createdAt,updatedAt) VALUES ('account-wa','org-a','whatsapp','bridge-wa','owned-wa',1,1,1)",
    )
    if (mode === 'cleared') {
      await setUserMessagingPreference({ userId: 'operator-b', platform: 'telegram' })
      expect(
        await setUserMessagingPreference({ userId: 'operator-b', platform: null }),
      ).toEqual({ platform: 'whatsapp' })
    }
    expect(await getUserMessagingSettings({ userId: 'operator-b' })).toMatchObject({
      platform: 'whatsapp',
    })
    expect(
      (
        await searchMessagingUsers({
          meta,
          organisationId: 'org-a',
          search: 'operator_b',
        })
      )[0],
    ).toMatchObject({ platform: 'whatsapp', accountId: 'account-wa', available: true })
    expect(
      await openUserMessagingConversation({
        meta,
        organisationId: 'org-a',
        username: 'operator_b',
      }),
    ).toMatchObject({
      platform: 'whatsapp',
      accountId: 'account-wa',
      chatId: '15555550100@s.whatsapp.net',
    })
  },
)

it.each(['whatsapp', 'telegram'] as const)(
  'discovers a saved phone on %s without messaging and invalidates changed phones',
  async platform => {
    state.ctx.user.superAdmin = true
    sqlite.exec(
      "DELETE FROM userMessagingIdentity; UPDATE user SET telephone='+15555550100' WHERE id='operator-b'; UPDATE messagingAccount SET externalAccountId='owned-telegram'; INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,externalAccountId,enabled,createdAt,updatedAt) VALUES ('account-wa','org-a','whatsapp','bridge-wa','owned-wa',1,1,1)",
    )
    await setUserMessagingPreference({ userId: 'operator-b', platform })
    const address = platform === 'whatsapp' ? '15555550100@s.whatsapp.net' : '42'
    bridge.lookupPhone.mockResolvedValue({ status: 'registered', address })
    const [result] = await searchMessagingUsers({
      meta,
      organisationId: 'org-a',
      search: 'operator_b',
    })
    expect(
      result.channels.find(channel => channel.platform === platform),
    ).toMatchObject({ checking: true, available: false })
    expect(bridge.lookupPhone).not.toHaveBeenCalled()
    expect(
      await checkMessagingUser({
        meta,
        organisationId: 'org-a',
        userId: 'operator-b',
        platform,
      }),
    ).toMatchObject({ available: true, chatId: address })
    expect(
      (
        await searchMessagingUsers({
          meta,
          organisationId: 'org-a',
          search: 'operator_b',
        })
      )[0].channels.find(channel => channel.platform === platform),
    ).toMatchObject({ available: true, chatId: address, checking: false })
    expect(bridge.lookupPhone).toHaveBeenCalledWith(
      platform === 'whatsapp' ? 'bridge-wa' : account.bridgeAccountId,
      '+15555550100',
    )
    expect(sqlite.prepare('SELECT * FROM userMessagingIdentity').all()).toHaveLength(0)
    const conversation = await openUserMessagingConversation({
      meta,
      organisationId: 'org-a',
      username: 'operator_b',
    })
    expect(conversation).toMatchObject({ platform, chatId: address })
    expect(
      sqlite
        .prepare('SELECT sourceTelephone, nativeId FROM userMessagingIdentity')
        .get(),
    ).toEqual({ sourceTelephone: '+15555550100', nativeId: address })
    expect(bridge.send).not.toHaveBeenCalled()
    expect(bridge.profile).not.toHaveBeenCalled()
    sqlite.exec("UPDATE user SET telephone='+15555550101' WHERE id='operator-b'")
    bridge.lookupPhone.mockResolvedValue({ status: 'unresolved' })
    expect(
      (
        await searchMessagingUsers({
          meta,
          organisationId: 'org-a',
          search: 'operator_b',
        })
      )[0].available,
    ).toBe(false)
    await expect(
      openUserMessagingConversation({
        meta,
        organisationId: 'org-a',
        username: 'operator_b',
      }),
    ).rejects.toMatchObject({ status: 409 })
    // A changed phone removes HYPE enrichment, but the account still owns this existing native chat.
    bridge.send.mockImplementation(async (_account, request) => ({
      request,
      state: 'submitted',
      messageId: 'native-reply',
    }))
    expect(
      await sendMessagingMessage({
        meta,
        accountId: conversation.accountId,
        requestId: 'stale-phone',
        to: address,
        text: 'Native account reply',
      }),
    ).toMatchObject({ state: 'submitted' })
    expect(
      sqlite
        .prepare(
          "SELECT recipientUserId FROM messagingSend WHERE requestId='stale-phone'",
        )
        .get(),
    ).toEqual({ recipientUserId: null })
  },
)

it.each(['not_found', 'unresolved', 'unavailable'] as const)(
  'does not create routes for %s phone lookups',
  async status => {
    state.ctx.user.superAdmin = true
    sqlite.exec(
      "DELETE FROM userMessagingIdentity; UPDATE user SET telephone='+15555550100' WHERE id='operator-b'; UPDATE messagingAccount SET externalAccountId='owned-telegram'",
    )
    await setUserMessagingPreference({ userId: 'operator-b', platform: 'telegram' })
    bridge.lookupPhone.mockResolvedValue({ status })
    const [result] = await searchMessagingUsers({
      meta,
      organisationId: 'org-a',
      search: 'operator_b',
    })
    expect(result).toMatchObject({ available: false, chatId: null })
    const checked = await checkMessagingUser({
      meta,
      organisationId: 'org-a',
      userId: 'operator-b',
      platform: 'telegram',
    })
    if (status === 'unresolved') expect(checked.unavailableReason).toContain('privacy')
    if (status === 'unavailable')
      expect(checked.unavailableReason).toContain('temporarily unavailable')
    await expect(
      openUserMessagingConversation({
        meta,
        organisationId: 'org-a',
        username: 'operator_b',
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(sqlite.prepare('SELECT * FROM userMessagingIdentity').all()).toHaveLength(0)
    expect(bridge.send).not.toHaveBeenCalled()
  },
)

it('rejects discovered addresses owned by another user and does not look up unauthorized organisations', async () => {
  state.ctx.user.superAdmin = true
  sqlite.exec(
    "UPDATE user SET telephone='+15555550100' WHERE id='operator-a'; UPDATE messagingAccount SET externalAccountId='owned-telegram'",
  )
  await setUserMessagingPreference({ platform: 'telegram' })
  bridge.lookupPhone.mockResolvedValue({ status: 'registered', address: '42' })
  expect(
    (
      await searchMessagingUsers({
        meta,
        organisationId: 'org-a',
        search: 'operator_a',
      })
    )[0],
  ).toMatchObject({ available: false, chatId: null })
  state.ctx.user.superAdmin = false
  bridge.lookupPhone.mockClear()
  await expect(
    searchMessagingUsers({ meta, organisationId: 'org-b', search: 'operator_a' }),
  ).rejects.toMatchObject({ status: 403 })
  expect(bridge.lookupPhone).not.toHaveBeenCalled()
})

it('does not let a same-user provider alias hide another native ID claim during discovery', async () => {
  account.externalAccountId = 'owned-telegram'
  sqlite.exec(`
    UPDATE messagingAccount SET externalAccountId='owned-telegram';
    UPDATE user SET telephone='+15555550100' WHERE id='operator-b';
    INSERT INTO userMessagingIdentity(userId,platform,nativeId,updatedAt)
    VALUES ('operator-a','telegram','43',1);
    INSERT INTO userMessagingIdentityAlias VALUES ('operator-b','telegram','43');
  `)
  bridge.lookupPhone.mockResolvedValue({ status: 'registered', address: '43' })
  expect(
    await resolveMessagingPhone(state.ctx, account, {
      id: 'operator-b',
      telephone: '+15555550100',
    }),
  ).toMatchObject({
    address: null,
    reason: 'This account belongs to a different HYPE user; review the phone number',
  })
  expect(bridge.send).not.toHaveBeenCalled()
})

it('requests fresh pairing for enabled signed-out WhatsApp accounts only', async () => {
  sqlite.exec("UPDATE messagingAccount SET platform='whatsapp'")
  bridge.watch.mockResolvedValue({ ...status, connected: false, loggedOut: true })
  bridge.start.mockResolvedValue({ ...status, connected: false, qr: 'synthetic-qr' })
  expect(
    await watchMessagingAccount({
      meta,
      accountId: account.id,
      tabId: crypto.randomUUID(),
    }),
  ).toMatchObject({ qr: 'synthetic-qr' })
  expect(bridge.start).toHaveBeenCalledOnce()
  bridge.start.mockClear()
  bridge.watch.mockResolvedValue({ ...status, connected: false, loggedOut: false })
  await watchMessagingAccount({
    meta,
    accountId: account.id,
    tabId: crypto.randomUUID(),
  })
  expect(bridge.start).not.toHaveBeenCalled()
  sqlite.exec('UPDATE messagingAccount SET enabled=0')
  bridge.watch.mockResolvedValue({ ...status, connected: false, loggedOut: true })
  await watchMessagingAccount({
    meta,
    accountId: account.id,
    tabId: crypto.randomUUID(),
  })
  expect(bridge.start).not.toHaveBeenCalled()
})

it.each(['whatsapp', 'telegram'] as const)(
  'edits only an owned message in the selected %s conversation',
  async platform => {
    account.platform = platform
    sqlite.prepare('UPDATE messagingAccount SET platform=?').run(platform)
    const chat = platform === 'whatsapp' ? '15555550100@s.whatsapp.net' : '42'
    const original = {
      sequence: 1,
      id: 'editable',
      chat,
      sender: 'self',
      timestamp: Date.now(),
      fromMe: true,
      text: 'before',
    }
    await projectMessagingSnapshot(state.ctx.db, account, {
      status,
      messages: [original],
      outbox: [],
    })
    const request = {
      requestId: 'edit-1',
      to: chat,
      text: 'after',
      editTo: { id: original.id, sender: original.sender },
    }
    bridge.send.mockResolvedValue({
      request,
      state: 'submitted',
      messageId: original.id,
    })
    expect(
      await sendMessagingMessage({ meta, accountId: account.id, ...request }),
    ).toMatchObject({ state: 'submitted', messageId: original.id })
    expect(bridge.send).toHaveBeenCalledWith(account.bridgeAccountId, request)
    await expect(
      sendMessagingMessage({
        meta,
        accountId: account.id,
        ...request,
        text: 'different',
      }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      sendMessagingMessage({
        meta,
        accountId: account.id,
        ...request,
        requestId: 'edit-2',
        editTo: { id: original.id, sender: 'other' },
      }),
    ).rejects.toMatchObject({ status: 400 })
    await projectMessagingSnapshot(state.ctx.db, account, {
      status,
      messages: [{ ...original, sequence: 2, fromMe: false }],
      outbox: [],
    })
    await expect(
      sendMessagingMessage({
        meta,
        accountId: account.id,
        ...request,
        requestId: 'edit-incoming',
      }),
    ).rejects.toMatchObject({ status: 400 })
  },
)

it('caches negative checks, expires failures and isolates account changes', async () => {
  state.ctx.user.superAdmin = true
  sqlite.exec(
    "DELETE FROM userMessagingIdentity; UPDATE user SET telephone='+15555550100' WHERE id='operator-b'; UPDATE messagingAccount SET externalAccountId='owned-telegram'",
  )
  await setUserMessagingPreference({ userId: 'operator-b', platform: 'telegram' })
  bridge.lookupPhone.mockResolvedValue({ status: 'not_found' })
  const input = {
    meta,
    organisationId: 'org-a',
    userId: 'operator-b',
    platform: 'telegram' as const,
  }
  await checkMessagingUser(input)
  await checkMessagingUser(input)
  expect(bridge.lookupPhone).toHaveBeenCalledTimes(1)
  expect(
    (
      await searchMessagingUsers({
        meta,
        organisationId: 'org-a',
        search: 'operator_b',
      })
    )[0],
  ).toMatchObject({ checking: false, available: false })
  sqlite.exec('UPDATE messagingPhoneLookup SET expiresAt=0')
  expect(
    (
      await searchMessagingUsers({
        meta,
        organisationId: 'org-a',
        search: 'operator_b',
      })
    )[0].checking,
  ).toBe(true)
  await checkMessagingUser(input)
  expect(bridge.lookupPhone).toHaveBeenCalledTimes(2)
  sqlite.exec("UPDATE messagingAccount SET externalAccountId='replacement-account'")
  await checkMessagingUser(input)
  expect(bridge.lookupPhone).toHaveBeenCalledTimes(3)
  state.ctx.user.superAdmin = false
  await expect(
    checkMessagingUser({ ...input, organisationId: 'org-b' }),
  ).rejects.toMatchObject({ status: 403 })
})

it('checks and caches both platforms, then honors the saved Telegram preference', async () => {
  state.ctx.user.superAdmin = true
  sqlite.exec(
    "DELETE FROM userMessagingIdentity; UPDATE user SET telephone='+15555550100' WHERE id='operator-b'; UPDATE messagingAccount SET externalAccountId='owned-telegram'; INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,externalAccountId,enabled,createdAt,updatedAt) VALUES ('account-wa','org-a','whatsapp','bridge-wa','owned-wa',1,1,1)",
  )
  await setUserMessagingPreference({ userId: 'operator-b', platform: 'telegram' })
  bridge.lookupPhone.mockImplementation(async (accountId: string) => ({
    status: 'registered',
    address: accountId === 'bridge-wa' ? '15555550100@s.whatsapp.net' : '42',
  }))
  const [pending] = await searchMessagingUsers({
    meta,
    organisationId: 'org-a',
    search: 'operator_b',
  })
  expect(pending.channels.map(channel => channel.checking)).toEqual([true, true])
  await Promise.all(
    (['whatsapp', 'telegram'] as const).map(platform =>
      checkMessagingUser({
        meta,
        organisationId: 'org-a',
        userId: 'operator-b',
        platform,
      }),
    ),
  )
  const [checked] = await searchMessagingUsers({
    meta,
    organisationId: 'org-a',
    search: 'operator_b',
  })
  expect(checked.channels.map(channel => channel.available)).toEqual([true, true])
  expect(checked.platform).toBe('telegram')
  expect(
    sqlite.prepare('SELECT count(*) AS count FROM messagingPhoneLookup').get(),
  ).toEqual({ count: 2 })
  expect(
    await openUserMessagingConversation({
      meta,
      organisationId: 'org-a',
      username: 'operator_b',
    }),
  ).toMatchObject({ platform: 'telegram' })
  expect(bridge.lookupPhone).toHaveBeenCalledTimes(2)
})

it('reads only authorized incoming messages and deletes only owned outgoing messages', async () => {
  const incoming = {
    sequence: 1,
    id: '51',
    chat: '42',
    sender: '42',
    timestamp: Date.now(),
    fromMe: false,
    text: 'Find this incoming',
  }
  const outgoing = {
    ...incoming,
    sequence: 2,
    id: '52',
    sender: 'self',
    fromMe: true,
    text: 'Own outgoing',
  }
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [incoming, outgoing],
    outbox: [],
  })
  await markMessagingMessagesRead({
    meta,
    accountId: account.id,
    chat: '42',
    targets: [{ id: '51', sender: '42' }],
  })
  expect(bridge.messageAction).toHaveBeenCalledWith(
    account.bridgeAccountId,
    '42',
    { id: '51', sender: '42' },
    'read',
    expect.any(String),
  )
  await expect(
    markMessagingMessagesRead({
      meta,
      accountId: account.id,
      chat: '42',
      targets: [{ id: '52', sender: 'self' }],
    }),
  ).rejects.toMatchObject({ status: 400 })
  await expect(
    deleteMessagingMessage({
      meta,
      accountId: account.id,
      chat: '42',
      target: { id: '51', sender: '42' },
      requestId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 400 })
  await deleteMessagingMessage({
    meta,
    accountId: account.id,
    chat: '42',
    target: { id: '52', sender: 'self' },
    requestId: crypto.randomUUID(),
  })
  expect(
    (await readMessagingMessages(state.ctx.db, account.id, 0)).find(
      message => message.id === '52',
    )?.deleted,
  ).toBe(true)
  expect(
    await searchMessagingMessages({
      meta,
      accountId: account.id,
      chat: '42',
      search: 'incoming',
    }),
  ).toHaveLength(1)
  expect(
    await searchMessagingMessages({
      meta,
      accountId: account.id,
      chat: '42',
      search: 'outgoing',
    }),
  ).toHaveLength(0)
  await expect(
    searchMessagingMessages({
      meta,
      accountId: account.id,
      chat: 'unknown',
      search: 'incoming',
    }),
  ).rejects.toMatchObject({ status: 403 })
})

it('explicit Telegram selection overrides the automatic WhatsApp-first route', async () => {
  state.ctx.user.superAdmin = true
  sqlite.exec(
    "UPDATE messagingAccount SET externalAccountId='owned-telegram'; INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,externalAccountId,enabled,createdAt,updatedAt) VALUES ('account-wa','org-a','whatsapp','bridge-wa','owned-wa',1,1,1)",
  )
  expect(
    await openUserMessagingConversation({
      meta,
      organisationId: 'org-a',
      username: 'operator_b',
      platform: 'telegram',
    }),
  ).toMatchObject({ platform: 'telegram', chatId: '42' })
  expect(bridge.lookupPhone).not.toHaveBeenCalled()
})

it('preserves a confirmed send when an in-flight bridge request later fails', async () => {
  let reject!: (cause: unknown) => void
  bridge.send.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  const request = { requestId: 'concurrent-confirmation', to: '42', text: 'hello' }
  const pending = dispatchMessagingSend(state.ctx, account, request)
  await vi.waitFor(() => expect(bridge.send).toHaveBeenCalledOnce())
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [],
    outbox: [{ request, state: 'submitted', messageId: 'confirmed' }],
  })
  reject(new Error('synthetic late transport failure'))
  expect(await pending).toMatchObject({ state: 'submitted', messageId: 'confirmed' })
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [],
    outbox: [{ request, state: 'uncertain', messageId: '' }],
  })
  expect(sqlite.prepare('SELECT state,messageId FROM messagingSend').get()).toEqual({
    state: 'submitted',
    messageId: 'confirmed',
  })
  expect(await dispatchMessagingSend(state.ctx, account, request)).toMatchObject({
    state: 'submitted',
    messageId: 'confirmed',
  })
  expect(bridge.send).toHaveBeenCalledOnce()
})

it('replays a partially projected batch without losing or duplicating messages', async () => {
  const first: BridgeMessage = {
    sequence: 1,
    id: 'first',
    chat: '42',
    sender: '42',
    timestamp: 100,
    fromMe: false,
    text: 'first',
  }
  const second: BridgeMessage = {
    ...first,
    sequence: 2,
    id: 'second',
    timestamp: 200,
    text: 'second',
  }
  const snapshot = { status, messages: [first, second], outbox: [] }
  sqlite.exec(
    "CREATE TRIGGER fail_second_projection BEFORE INSERT ON messagingMessage WHEN NEW.messageId='second' BEGIN SELECT RAISE(ABORT, 'synthetic second message failure'); END",
  )
  await expect(
    projectMessagingSnapshot(state.ctx.db, account, snapshot),
  ).rejects.toThrow()
  expect(sqlite.prepare('SELECT inboxCursor FROM messagingAccount').get()).toEqual({
    inboxCursor: 0,
  })
  expect(sqlite.prepare('SELECT messageId FROM messagingMessage').all()).toEqual([
    { messageId: 'first' },
  ])
  expect(await readMessagingMessages(state.ctx.db, account.id, 0)).toEqual([])
  sqlite.exec('DROP TRIGGER fail_second_projection')
  expect(await projectMessagingSnapshot(state.ctx.db, account, snapshot)).toBe(2)
  expect(await readMessagingMessages(state.ctx.db, account.id, 0)).toEqual([
    first,
    second,
  ])
  expect(
    sqlite.prepare('SELECT count(*) AS count FROM messagingMessage').get(),
  ).toEqual({ count: 2 })
  expect(
    sqlite.prepare('SELECT lastMessageAt FROM messagingConversation').get(),
  ).toEqual({ lastMessageAt: 200 })
})

it.each(['member', 'superadmin'] as const)(
  'rejects archived organisation access for %s before bridge calls',
  async actor => {
    if (actor === 'superadmin') state.ctx.user.superAdmin = true
    sqlite.exec("UPDATE organisation SET isArchived=1 WHERE id='org-a'")
    await expect(
      watchMessagingAccount({
        meta,
        accountId: account.id,
        tabId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      sendMessagingMessage({
        meta,
        accountId: account.id,
        requestId: 'archived-org',
        to: '42',
        text: 'blocked',
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(bridge.watch).not.toHaveBeenCalled()
    expect(bridge.send).not.toHaveBeenCalled()
    expect(sqlite.prepare('SELECT count(*) AS count FROM messagingSend').get()).toEqual(
      { count: 0 },
    )
  },
)

it.each(['archived', 'anonymous', 'changed-phone'] as const)(
  'rejects a %s recipient before bridge calls',
  async invalidation => {
    if (invalidation === 'archived')
      sqlite.exec("UPDATE user SET isArchived=1 WHERE id='operator-b'")
    else if (invalidation === 'anonymous')
      sqlite.exec("UPDATE user SET isAnonymous=1 WHERE id='operator-b'")
    else {
      sqlite.exec(
        "UPDATE userMessagingIdentity SET sourceTelephone='+15555550100' WHERE userId='operator-b'; UPDATE user SET telephone='+15555550101' WHERE id='operator-b'",
      )
    }
    const input = { meta, accountId: account.id }
    await expect(
      sendMessagingMessage({
        ...input,
        requestId: 'inactive-recipient',
        to: '42',
        text: 'blocked',
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(loadMessagingHistory({ ...input, chat: '42' })).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      downloadMessagingMedia({
        ...input,
        chat: '42',
        target: { id: '1', sender: '42' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      getMessagingProfile({ ...input, address: '42' }),
    ).rejects.toMatchObject({ status: 403 })
    for (const method of [bridge.send, bridge.history, bridge.media, bridge.profile])
      expect(method).not.toHaveBeenCalled()
    expect(sqlite.prepare('SELECT count(*) AS count FROM messagingSend').get()).toEqual(
      { count: 0 },
    )
  },
)

/** Build a real native reply reference without involving any external account. */
function quoteFixture(chat = '42'): { original: BridgeMessage; reply: BridgeMessage } {
  const original: BridgeMessage = {
    sequence: 1,
    id: '7',
    chat,
    sender: chat,
    fromMe: false,
    timestamp: 1000,
    text: 'Original quote target',
  }
  const reply: BridgeMessage = {
    ...original,
    sequence: 2,
    id: '20',
    timestamp: 2000,
    text: 'A reply',
    content: {
      kind: 'text',
      text: 'A reply',
      mimeType: null,
      fileName: null,
      byteLength: null,
      duration: null,
      voiceNote: false,
      viewOnce: false,
      reaction: null,
      quoted: { id: original.id, sender: '', text: original.text, kind: 'text' },
    },
  }
  return { original, reply }
}

it.each(['telegram', 'whatsapp'] as const)(
  'opens a saved %s quote without provider calls and requires organisation access',
  async platform => {
    account = { ...account, platform }
    sqlite.prepare('UPDATE messagingAccount SET platform=?').run(platform)
    const { original, reply } = quoteFixture(
      platform === 'telegram' ? '42' : '15555550100@s.whatsapp.net',
    )
    await projectMessagingSnapshot(state.ctx.db, account, {
      status,
      messages: [original, reply],
      outbox: [],
    })
    const input = {
      meta,
      accountId: account.id,
      chat: reply.chat,
      source: { id: reply.id, sender: reply.sender },
    }
    expect(await loadMessagingQuotedMessage(input)).toEqual(original)
    expect(bridge.history).not.toHaveBeenCalled()
    expect(bridge.messageAction).not.toHaveBeenCalled()
    await expect(
      loadMessagingQuotedMessage({
        ...input,
        source: { ...input.source, sender: 'forged-sender' },
      }),
    ).rejects.toMatchObject({ status: 404 })
    state.ctx.userRoles = []
    await expect(loadMessagingQuotedMessage(input)).rejects.toMatchObject({
      status: 403,
    })
  },
)

it('retrieves and caches one old Telegram quote without advancing live replay or acknowledging reads', async () => {
  const { original, reply } = quoteFixture()
  const fetched = { ...original, sequence: 50 }
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [reply],
    outbox: [],
  })
  bridge.history.mockResolvedValue({ messages: [fetched], nextBefore: original.id })
  const input = {
    meta,
    accountId: account.id,
    chat: reply.chat,
    source: { id: reply.id, sender: reply.sender },
  }
  expect(await loadMessagingQuotedMessage(input)).toEqual(fetched)
  expect(bridge.history).toHaveBeenCalledExactlyOnceWith('bridge-org-a', '42', '8')
  expect(
    (
      sqlite
        .prepare('SELECT inboxCursor FROM messagingAccount WHERE id=?')
        .get(account.id) as { inboxCursor: number }
    ).inboxCursor,
  ).toBe(2)
  expect(await readMessagingMessages(state.ctx.db, account.id, 2)).toEqual([])
  expect(await loadMessagingQuotedMessage(input)).toEqual(fetched)
  expect(bridge.history).toHaveBeenCalledTimes(1)
  expect(bridge.messageAction).not.toHaveBeenCalled()
})

it('does not mistake a matching ID in another WhatsApp conversation for the quoted original', async () => {
  account = { ...account, platform: 'whatsapp' }
  sqlite.exec("UPDATE messagingAccount SET platform='whatsapp'")
  const { original, reply } = quoteFixture('15555550100@s.whatsapp.net')
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [{ ...original, chat: '15555559999@s.whatsapp.net' }, reply],
    outbox: [],
  })
  expect(
    await loadMessagingQuotedMessage({
      meta,
      accountId: account.id,
      chat: reply.chat,
      source: { id: reply.id, sender: reply.sender },
    }),
  ).toBeNull()
  expect(bridge.history).not.toHaveBeenCalled()
})

it('copies only compatible catalogue media into the same organisation WhatsApp account', async () => {
  sqlite.exec(
    "INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,enabled,registeredBy,createdAt,updatedAt) VALUES ('wa-a','org-a','whatsapp','wa-bridge-a',1,'operator-a',1,1)",
  )
  const input = { meta, accountId: 'wa-a' },
    id = crypto.randomUUID()
  bridge.searchMedia.mockResolvedValue({ items: [], nextOffset: null })
  await searchMessagingMedia({ ...input, kind: 'gif', query: 'happy' })
  expect(bridge.searchMedia).toHaveBeenCalledWith(
    'bridge-org-a',
    expect.objectContaining({ compatibleWith: 'whatsapp' }),
  )
  bridge.catalogItem.mockResolvedValue({ kind: 'gif', mimeType: 'video/mp4' })
  bridge.catalogMedia.mockResolvedValue(new Uint8Array([1, 2]).buffer)
  bridge.upload.mockResolvedValue({
    id: 'wa-staged',
    content: { kind: 'video', animated: true },
  })
  expect(await stageMessagingMedia({ ...input, id })).toMatchObject({ id: 'wa-staged' })
  expect(bridge.upload).toHaveBeenCalledWith(
    'wa-bridge-a',
    { kind: 'video', mimeType: 'video/mp4', animated: true },
    expect.any(ArrayBuffer),
  )
  bridge.catalogItem.mockResolvedValue({
    kind: 'sticker',
    mimeType: 'application/x-tgsticker',
  })
  await expect(stageMessagingMedia({ ...input, id })).rejects.toMatchObject({
    status: 400,
  })
  expect(bridge.upload).toHaveBeenCalledOnce()
  expect(bridge.send).not.toHaveBeenCalled()
})

it('validates native selected-text quotes against this account and keeps their retry identity', async () => {
  const { original } = quoteFixture()
  original.text = 'Hello 🥖\nBread tomorrow?'
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [original],
    outbox: [],
  })
  bridge.send.mockImplementation(async (_account, request) => ({
    request,
    messageId: '',
    state: 'uncertain',
  }))
  const input = {
    meta,
    accountId: account.id,
    requestId: 'selected-quote',
    to: original.chat,
    text: 'Yes',
    replyTo: {
      id: original.id,
      sender: original.sender,
      quote: { text: 'Bread', offset: 9 },
    },
  }
  expect((await sendMessagingMessage(input)).request.replyTo).toEqual(input.replyTo)
  await sendMessagingMessage(input)
  expect(bridge.send).toHaveBeenCalledOnce()
  await expect(
    sendMessagingMessage({
      ...input,
      replyTo: { ...input.replyTo, quote: { text: 'tomorrow', offset: 15 } },
    }),
  ).rejects.toMatchObject({ status: 409 })
  await expect(
    sendMessagingMessage({
      ...input,
      requestId: 'invalid-quote',
      replyTo: { ...input.replyTo, quote: { text: 'Not in original', offset: 0 } },
    }),
  ).rejects.toMatchObject({ status: 400 })
  await expect(
    sendMessagingMessage({
      ...input,
      requestId: 'wrong-sender',
      replyTo: { ...input.replyTo, sender: 'another-account' },
    }),
  ).rejects.toMatchObject({ status: 400 })
  sqlite.exec("UPDATE messagingAccount SET platform='whatsapp'")
  await expect(
    sendMessagingMessage({
      ...input,
      to: '15555550100@s.whatsapp.net',
      requestId: 'wa-selected-quote',
    }),
  ).rejects.toMatchObject({ status: 400 })
  expect(bridge.send).toHaveBeenCalledOnce()
})

it('does not look up a cross-chat quote using a coincidentally matching local message ID', async () => {
  const { original, reply } = quoteFixture()
  reply.content!.quoted!.chat = '99'
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [original, reply],
    outbox: [],
  })
  expect(
    await loadMessagingQuotedMessage({
      meta,
      accountId: account.id,
      chat: reply.chat,
      source: { id: reply.id, sender: reply.sender },
    }),
  ).toBeNull()
  expect(bridge.history).not.toHaveBeenCalled()
})

it.each(['telegram', 'whatsapp'] as const)(
  'archives and restores %s threads without losing history or being undone by replay',
  async platform => {
    account = { ...account, platform }
    sqlite
      .prepare('UPDATE messagingAccount SET platform=? WHERE id=?')
      .run(platform, account.id)
    const chat = platform === 'telegram' ? '42' : '15555550100@s.whatsapp.net'
    const message: BridgeMessage = {
      sequence: 1,
      id: 'archive-original',
      chat,
      sender: chat,
      timestamp: 100,
      fromMe: false,
      text: 'Preserved history',
    }
    await projectMessagingSnapshot(state.ctx.db, account, {
      status,
      messages: [message],
      outbox: [],
    })
    const [thread] = await getMessagingConversations({ meta, accountId: account.id })
    expect(thread.isArchived).toBe(false)
    await setMessagingConversationArchived({
      meta,
      accountId: account.id,
      chat,
      archived: true,
    })
    expect(bridge.archive).toHaveBeenLastCalledWith(account.bridgeAccountId, chat, true)
    expect(await getMessagingConversations({ meta, accountId: account.id })).toEqual([])
    await projectMessagingSnapshot(state.ctx.db, account, {
      status,
      messages: [{ ...message, id: 'new-incoming', sequence: 2, timestamp: 200 }],
      outbox: [],
    })
    expect(
      (
        await getMessagingConversations({ meta, accountId: account.id, archived: true })
      ).map(row => row.id),
    ).toEqual([thread.id])
    expect(await getMessagingConversations({ meta, accountId: account.id })).toEqual([])
    await setMessagingConversationArchived({
      meta,
      accountId: account.id,
      chat,
      archived: false,
    })
    expect(bridge.archive).toHaveBeenLastCalledWith(
      account.bridgeAccountId,
      chat,
      false,
    )
    expect(
      (await getMessagingConversations({ meta, accountId: account.id })).map(
        row => row.id,
      ),
    ).toEqual([thread.id])
    expect(
      await getMessagingConversations({ meta, accountId: account.id, archived: true }),
    ).toEqual([])
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM messagingMessage').get(),
    ).toEqual({ count: 2 })
    expect(bridge.messageAction).not.toHaveBeenCalled()
  },
)

it('rejects archive writes outside the operator organisation or known account chats', async () => {
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [
      {
        sequence: 1,
        id: 'private',
        chat: '42',
        sender: '42',
        timestamp: 1,
        fromMe: false,
        text: 'Private thread',
      },
    ],
    outbox: [],
  })
  await expect(
    setMessagingConversationArchived({
      meta,
      accountId: account.id,
      chat: 'unlinked-peer',
      archived: true,
    }),
  ).rejects.toMatchObject({ status: 403 })
  state.ctx.userRoles = [
    {
      type: 'organisation',
      organisationId: 'org-b',
      userId: state.ctx.user.id,
      role: 'member',
    },
  ]
  await expect(
    setMessagingConversationArchived({
      meta,
      accountId: account.id,
      chat: '42',
      archived: true,
    }),
  ).rejects.toMatchObject({ status: 403 })
  expect(sqlite.prepare('SELECT isArchived FROM messagingConversation').get()).toEqual({
    isArchived: 0,
  })
  expect(bridge.archive).not.toHaveBeenCalled()
})

it.each(['telegram', 'whatsapp'] as const)(
  'keeps the saved %s folder on native failure and rejects mismatched acknowledgments',
  async platform => {
    account = { ...account, platform }
    sqlite.prepare('UPDATE messagingAccount SET platform=?').run(platform)
    const chat = platform === 'telegram' ? '42' : '15555550100@s.whatsapp.net'
    await projectMessagingArchive(state.ctx.db, account.id, {
      chat,
      isArchived: false,
      sequence: 1,
    })
    const input = { meta, accountId: account.id, chat, archived: true }
    bridge.archive.mockRejectedValueOnce(new Error('Provider offline'))
    await expect(setMessagingConversationArchived(input)).rejects.toThrow(
      'Provider offline',
    )
    expect(
      await getMessagingConversations({ meta, accountId: account.id }),
    ).toHaveLength(1)
    bridge.archive.mockResolvedValueOnce({
      chat: 'another-chat',
      isArchived: true,
      sequence: 2,
    })
    await expect(setMessagingConversationArchived(input)).rejects.toMatchObject({
      status: 502,
    })
    expect(
      sqlite
        .prepare('SELECT isArchived,archiveSequence FROM messagingConversation')
        .get(),
    ).toEqual({ isArchived: 0, archiveSequence: 1 })
  },
)

it.each(['telegram', 'whatsapp'] as const)(
  'replays %s native-app archives independently and rejects delayed older folder state',
  async platform => {
    account = { ...account, platform }
    sqlite.prepare('UPDATE messagingAccount SET platform=?').run(platform)
    const chat = platform === 'telegram' ? '42' : '15555550100@s.whatsapp.net'
    bridge.snapshot.mockResolvedValueOnce({
      status,
      messages: [],
      outbox: [],
      conversations: [{ chat, isArchived: true, sequence: 5 }],
    })
    const snapshot = await getMessagingInbox({ meta, accountId: account.id, after: 0 })
    expect(snapshot.conversations).toBeUndefined()
    expect(
      await getMessagingConversations({ meta, accountId: account.id, archived: true }),
    ).toHaveLength(1)
    expect(
      sqlite.prepare('SELECT inboxCursor,archiveCursor FROM messagingAccount').get(),
    ).toEqual({ inboxCursor: 0, archiveCursor: 5 })
    // A native command can overtake a poll already on the wire; that older poll must not undo it.
    bridge.archive.mockResolvedValueOnce({ chat, isArchived: false, sequence: 10 })
    await setMessagingConversationArchived({
      meta,
      accountId: account.id,
      chat,
      archived: false,
    })
    bridge.snapshot.mockResolvedValueOnce({
      status,
      messages: [],
      outbox: [],
      conversations: [{ chat, isArchived: true, sequence: 8 }],
    })
    await getMessagingInbox({ meta, accountId: account.id, after: 0 })
    expect(bridge.snapshot).toHaveBeenLastCalledWith(account.bridgeAccountId, 0, 5)
    expect(
      await getMessagingConversations({ meta, accountId: account.id }),
    ).toHaveLength(1)
    expect(
      sqlite.prepare('SELECT archiveSequence FROM messagingConversation').get(),
    ).toEqual({ archiveSequence: 10 })
    bridge.snapshot.mockResolvedValueOnce({
      status,
      messages: [],
      outbox: [],
      conversations: [{ chat, isArchived: true, sequence: 11 }],
    })
    await getMessagingInbox({ meta, accountId: account.id, after: 0 })
    expect(
      await getMessagingConversations({ meta, accountId: account.id, archived: true }),
    ).toHaveLength(1)
  },
)

it('retains phone, username and native ID independently through verification and privacy-limited profiles', async () => {
  state.ctx.user.superAdmin = true
  sqlite.exec("UPDATE user SET telephone='+85291234567' WHERE id='operator-b'")
  const identity = identityFields({
    phoneNumber: '+1 (555) 555-0100',
    username: '@Synthetic',
    nativeId: '42',
  })
  await setUserMessagingIdentity({
    userId: 'operator-b',
    platform: 'telegram',
    identity,
  })
  const pending = (
    await getUserMessagingSettings({ userId: 'operator-b' })
  ).identities.find(row => row.platform === 'telegram')!
  expect(pending).toMatchObject({
    phoneNumber: '+15555550100',
    username: 'synthetic',
    nativeId: '42',
    verifiedAt: null,
  })
  bridge.profile.mockResolvedValue({
    jid: '42',
    username: 'synthetic',
    phone: null,
    aliases: ['42'],
  })
  await verifyUserMessagingIdentity({
    meta,
    userId: 'operator-b',
    accountId: account.id,
    expectedUpdatedAt: pending.updatedAt,
    confirmOwnership: true,
  })
  expect(bridge.profile.mock.calls.map(call => call[1]).sort()).toEqual(
    ['+15555550100', '42', '@synthetic'].sort(),
  )
  expect(
    sqlite
      .prepare(
        "SELECT phoneNumber,username,nativeId,verifiedBy,sourceTelephone FROM userMessagingIdentity WHERE userId='operator-b' AND platform='telegram'",
      )
      .get(),
  ).toEqual({
    phoneNumber: '+15555550100',
    username: 'synthetic',
    nativeId: '42',
    verifiedBy: 'operator-a',
    sourceTelephone: null,
  })
  expect(
    sqlite.prepare("SELECT telephone FROM user WHERE id='operator-b'").get(),
  ).toEqual({ telephone: '+85291234567' })
  const verified = identityRevision('operator-b', 'telegram')
  await setUserMessagingIdentity({
    userId: 'operator-b',
    platform: 'telegram',
    identity,
  })
  expect(identityRevision('operator-b', 'telegram')).toBe(verified)
  expect(
    (await getUserMessagingSettings({ userId: 'operator-b' })).identities.find(
      row => row.platform === 'telegram',
    )?.verifiedAt,
  ).toBeTruthy()
})

it('rejects identifiers for different provider accounts and does not promote a partial match', async () => {
  state.ctx.user.superAdmin = true
  await setUserMessagingIdentity({
    userId: 'operator-b',
    platform: 'telegram',
    identity: identityFields({ phoneNumber: '+15555550100', username: 'synthetic' }),
  })
  bridge.profile.mockImplementation(async (_account, address) => ({
    jid: address === '@synthetic' ? '42' : '43',
    aliases: [],
  }))
  await expect(
    verifyUserMessagingIdentity({
      meta,
      userId: 'operator-b',
      accountId: account.id,
      expectedUpdatedAt: identityRevision('operator-b', 'telegram'),
      confirmOwnership: true,
    }),
  ).rejects.toMatchObject({ status: 409 })
  expect(
    sqlite
      .prepare(
        "SELECT nativeId,verifiedAt FROM userMessagingIdentity WHERE userId='operator-b' AND platform='telegram'",
      )
      .get(),
  ).toEqual({ nativeId: null, verifiedAt: null })
  expect(
    sqlite
      .prepare("SELECT * FROM userMessagingIdentityAlias WHERE platform='telegram'")
      .all(),
  ).toEqual([])
})

it('does not overwrite a claim edited while provider verification is in flight', async () => {
  state.ctx.user.superAdmin = true
  await setUserMessagingIdentity({
    userId: 'operator-b',
    platform: 'telegram',
    identity: identityFields({ username: 'synthetic' }),
  })
  const expectedUpdatedAt = identityRevision('operator-b', 'telegram')
  bridge.profile.mockImplementationOnce(async () => {
    await setUserMessagingIdentity({
      userId: 'operator-b',
      platform: 'telegram',
      identity: identityFields({ username: 'changed' }),
    })
    return { jid: '42', aliases: ['42'] }
  })
  await expect(
    verifyUserMessagingIdentity({
      meta,
      userId: 'operator-b',
      accountId: account.id,
      expectedUpdatedAt,
      confirmOwnership: true,
    }),
  ).rejects.toMatchObject({ status: 409 })
  expect(
    sqlite
      .prepare(
        "SELECT username,nativeId,verifiedAt FROM userMessagingIdentity WHERE userId='operator-b' AND platform='telegram'",
      )
      .get(),
  ).toEqual({ username: 'changed', nativeId: null, verifiedAt: null })
  expect(
    sqlite
      .prepare("SELECT * FROM userMessagingIdentityAlias WHERE platform='telegram'")
      .all(),
  ).toEqual([])
})

it('retains provider aliases so verification does not lose a pinned WhatsApp thread', async () => {
  state.ctx.user.superAdmin = true
  account.platform = 'whatsapp'
  sqlite.exec(
    "UPDATE messagingAccount SET platform='whatsapp',externalAccountId='owned-wa'",
  )
  const chat = '15555550100@s.whatsapp.net'
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages: [
      {
        sequence: 1,
        id: 'old',
        chat,
        sender: chat,
        timestamp: 1,
        fromMe: false,
        text: 'Keep this conversation',
      },
    ],
    outbox: [],
  })
  const before = sqlite.prepare('SELECT * FROM messagingConversation').get()
  bridge.profile.mockResolvedValue({
    jid: '987654321@lid',
    phone: '15555550100',
    username: null,
    aliases: [chat, '987654321@lid'],
  })
  await verifyUserMessagingIdentity({
    meta,
    userId: 'operator-b',
    accountId: account.id,
    expectedUpdatedAt: identityRevision('operator-b', 'whatsapp'),
    confirmOwnership: true,
  })
  expect(sqlite.prepare('SELECT * FROM messagingConversation').get()).toEqual(before)
  expect(
    (await getMessagingConversations({ meta, accountId: account.id }))[0],
  ).toMatchObject({ chatId: chat, recipient: { id: 'operator-b' } })
  expect(
    sqlite
      .prepare(
        "SELECT nativeId FROM userMessagingIdentityAlias WHERE platform='whatsapp' ORDER BY nativeId",
      )
      .all(),
  ).toEqual([{ nativeId: chat }, { nativeId: '987654321@lid' }])
  expect(
    await getMessagingProfile({ meta, accountId: account.id, address: chat }),
  ).toMatchObject({ jid: '987654321@lid' })
})

it('rolls verification back when a provider alias already belongs to another HYPE user', async () => {
  state.ctx.user.superAdmin = true
  sqlite.exec("UPDATE messagingAccount SET platform='whatsapp'")
  await setUserMessagingIdentity({
    platform: 'whatsapp',
    identity: identityFields({ nativeId: '987654321@lid' }),
  })
  bridge.profile.mockResolvedValue({
    jid: '987654321@lid',
    aliases: ['987654321@lid', '15555550100@s.whatsapp.net'],
  })
  await expect(
    verifyUserMessagingIdentity({
      meta,
      userId: 'operator-a',
      accountId: account.id,
      expectedUpdatedAt: identityRevision('operator-a', 'whatsapp'),
      confirmOwnership: true,
    }),
  ).rejects.toMatchObject({ status: 409 })
  expect(
    sqlite
      .prepare("SELECT verifiedAt FROM userMessagingIdentity WHERE userId='operator-a'")
      .get(),
  ).toEqual({ verifiedAt: null })
  expect(
    sqlite
      .prepare(
        "SELECT userId,nativeId FROM userMessagingIdentityAlias WHERE platform='whatsapp'",
      )
      .all(),
  ).toEqual([{ userId: 'operator-b', nativeId: '15555550100@s.whatsapp.net' }])
})

it('keeps a manual messaging claim separate from automatic discovery of a different profile phone', async () => {
  state.ctx.user.superAdmin = true
  sqlite.exec(
    "UPDATE user SET telephone='+15555550100' WHERE id='operator-b'; UPDATE messagingAccount SET externalAccountId='owned-telegram'",
  )
  await setUserMessagingIdentity({
    userId: 'operator-b',
    platform: 'telegram',
    identity: identityFields({ phoneNumber: '+85291234567', username: 'synthetic' }),
  })
  const result = await checkMessagingUser({
    meta,
    organisationId: 'org-a',
    userId: 'operator-b',
    platform: 'telegram',
  })
  expect(result).toMatchObject({
    available: false,
    unavailableReason:
      'Awaiting ownership verification of the saved messaging identity',
  })
  await expect(
    openUserMessagingConversation({
      meta,
      organisationId: 'org-a',
      username: 'operator_b',
      platform: 'telegram',
    }),
  ).rejects.toMatchObject({ status: 409 })
  expect(bridge.lookupPhone).not.toHaveBeenCalled()
  expect(
    sqlite
      .prepare(
        "SELECT phoneNumber,username,nativeId FROM userMessagingIdentity WHERE platform='telegram'",
      )
      .get(),
  ).toEqual({ phoneNumber: '+85291234567', username: 'synthetic', nativeId: null })
})

it('uses the user preference for new outreach, supports explicit selection and falls back when unavailable', async () => {
  state.ctx.user.superAdmin = true
  sqlite.exec(
    "UPDATE messagingAccount SET externalAccountId='owned-telegram'; INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,externalAccountId,enabled,createdAt,updatedAt) VALUES ('account-wa','org-a','whatsapp','bridge-wa','owned-wa',1,1,1)",
  )
  await setUserMessagingPreference({ userId: 'operator-b', platform: 'telegram' })
  expect(
    sqlite
      .prepare("SELECT preferredMessagingPlatform FROM user WHERE id='operator-b'")
      .get(),
  ).toEqual({ preferredMessagingPlatform: 'telegram' })
  expect(
    await openUserMessagingConversation({
      meta,
      organisationId: 'org-a',
      username: 'operator_b',
    }),
  ).toMatchObject({ platform: 'telegram' })
  expect(
    await openUserMessagingConversation({
      meta,
      organisationId: 'org-a',
      username: 'operator_b',
      platform: 'whatsapp',
    }),
  ).toMatchObject({ platform: 'whatsapp' })
  sqlite.exec("UPDATE messagingAccount SET enabled=0 WHERE platform='telegram'")
  expect(
    await openUserMessagingConversation({
      meta,
      organisationId: 'org-a',
      username: 'operator_b',
    }),
  ).toMatchObject({ platform: 'whatsapp' })
  await setUserMessagingPreference({ userId: 'operator-b', platform: null })
  expect(await getUserMessagingSettings({ userId: 'operator-b' })).toMatchObject({
    platform: 'whatsapp',
    preferredPlatform: null,
  })
})

it('confirms a saved username without granting ownership, storing aliases or sending messages', async () => {
  sqlite.exec("UPDATE messagingAccount SET externalAccountId='connected'")
  await setUserMessagingIdentity({
    platform: 'telegram',
    identity: identityFields({ username: 'synthetic' }),
  })
  bridge.profile.mockResolvedValue({
    jid: '77',
    username: 'synthetic',
    name: 'Private provider name',
  })
  const result = await checkUserMessagingIdentity({
    platform: 'telegram',
    expectedUpdatedAt: identityRevision('operator-a', 'telegram'),
  })
  expect(result).toEqual({
    status: 'confirmed',
    message: 'Saved. Telegram account confirmed.',
  })
  expect(bridge.profile).toHaveBeenCalledWith('bridge-org-a', '@synthetic')
  expect(
    sqlite
      .prepare(
        "SELECT nativeId, verifiedAt FROM userMessagingIdentity WHERE userId='operator-a'",
      )
      .get(),
  ).toEqual({ nativeId: null, verifiedAt: null })
  expect(
    sqlite
      .prepare(
        "SELECT count(*) AS count FROM userMessagingIdentityAlias WHERE userId='operator-a'",
      )
      .get(),
  ).toEqual({ count: 0 })
  expect(bridge.send).not.toHaveBeenCalled()
})

it.each(['registered', 'not_found', 'unresolved', 'unavailable'] as const)(
  'reports %s phone lookup truthfully',
  async status => {
    sqlite.exec("UPDATE messagingAccount SET externalAccountId='connected'")
    await setUserMessagingIdentity({
      platform: 'telegram',
      identity: identityFields({ phoneNumber: '+85291234567' }),
    })
    bridge.lookupPhone.mockResolvedValue(
      status === 'registered' ? { status, address: '77' } : { status },
    )
    const result = await checkUserMessagingIdentity({
      platform: 'telegram',
      expectedUpdatedAt: identityRevision('operator-a', 'telegram'),
    })
    expect(result.status).toBe(
      status === 'registered'
        ? 'confirmed'
        : status === 'not_found'
          ? 'not-found'
          : 'unavailable',
    )
    expect(bridge.lookupPhone).toHaveBeenCalledWith('bridge-org-a', '+85291234567')
    expect(bridge.profile).not.toHaveBeenCalled()
    expect(bridge.send).not.toHaveBeenCalled()
  },
)

it('does not borrow another organisation account or disclose another user contact', async () => {
  sqlite.exec("UPDATE messagingAccount SET externalAccountId='connected'")
  await setUserMessagingIdentity({
    platform: 'telegram',
    identity: identityFields({ username: 'synthetic' }),
  })
  state.ctx.userRoles = [
    {
      type: 'organisation',
      organisationId: 'org-b',
      userId: 'operator-a',
      role: 'member',
    },
  ]
  expect(
    await checkUserMessagingIdentity({
      platform: 'telegram',
      expectedUpdatedAt: identityRevision('operator-a', 'telegram'),
    }),
  ).toMatchObject({ status: 'unavailable' })
  await expect(
    checkUserMessagingIdentity({
      userId: 'operator-b',
      platform: 'telegram',
      expectedUpdatedAt: 1,
    }),
  ).rejects.toMatchObject({ status: 403 })
  expect(bridge.profile).not.toHaveBeenCalled()
})

it('rejects a confirmation that finishes after the saved claim changes', async () => {
  sqlite.exec("UPDATE messagingAccount SET externalAccountId='connected'")
  await setUserMessagingIdentity({
    platform: 'telegram',
    identity: identityFields({ username: 'synthetic' }),
  })
  bridge.profile.mockImplementation(async () => {
    await setUserMessagingIdentity({
      platform: 'telegram',
      identity: identityFields({ username: 'different' }),
    })
    return { jid: '77' }
  })
  await expect(
    checkUserMessagingIdentity({
      platform: 'telegram',
      expectedUpdatedAt: identityRevision('operator-a', 'telegram'),
    }),
  ).rejects.toMatchObject({ status: 409 })
})

it('retains WhatsApp usernames without pretending its bridge can confirm them', async () => {
  await setUserMessagingIdentity({
    platform: 'whatsapp',
    identity: identityFields({ username: 'synthetic' }),
  })
  expect(
    await checkUserMessagingIdentity({
      platform: 'whatsapp',
      expectedUpdatedAt: identityRevision('operator-a', 'whatsapp'),
    }),
  ).toMatchObject({ status: 'unavailable' })
  expect(bridge.profile).not.toHaveBeenCalled()
  expect(bridge.lookupPhone).not.toHaveBeenCalled()
})

it('confirms WhatsApp phones through the accessible WhatsApp account', async () => {
  sqlite.exec(
    "INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,externalAccountId,enabled,createdAt,updatedAt) VALUES ('account-wa','org-a','whatsapp','bridge-wa','connected-wa',1,1,1)",
  )
  await setUserMessagingIdentity({
    platform: 'whatsapp',
    identity: identityFields({ phoneNumber: '+85291234567' }),
  })
  bridge.lookupPhone.mockResolvedValue({
    status: 'registered',
    address: '85291234567@s.whatsapp.net',
  })
  expect(
    await checkUserMessagingIdentity({
      platform: 'whatsapp',
      expectedUpdatedAt: identityRevision('operator-a', 'whatsapp'),
    }),
  ).toEqual({ status: 'confirmed', message: 'Saved. WhatsApp account confirmed.' })
  expect(bridge.lookupPhone).toHaveBeenCalledWith('bridge-wa', '+85291234567')
  expect(bridge.send).not.toHaveBeenCalled()
})

it('rejects provider group IDs instead of displaying a confirmation checkmark', async () => {
  sqlite.exec("UPDATE messagingAccount SET externalAccountId='connected'")
  await setUserMessagingIdentity({
    platform: 'telegram',
    identity: identityFields({ username: 'synthetic' }),
  })
  bridge.profile.mockResolvedValue({ jid: '-1001234' })
  expect(
    await checkUserMessagingIdentity({
      platform: 'telegram',
      expectedUpdatedAt: identityRevision('operator-a', 'telegram'),
    }),
  ).toMatchObject({ status: 'not-found' })
  expect(bridge.send).not.toHaveBeenCalled()
})

it.each(['telegram', 'whatsapp'] as const)(
  'operates an imported %s chat without requiring a HYPE user',
  async platform => {
    account.platform = platform
    sqlite
      .prepare('UPDATE messagingAccount SET platform=? WHERE id=?')
      .run(platform, account.id)
    const chat = platform === 'telegram' ? '77' : '85291234567@s.whatsapp.net'
    const message: BridgeMessage = {
      id: 'native',
      sequence: 1,
      chat,
      sender: chat,
      senderName: 'Native contact',
      timestamp: 100,
      fromMe: false,
      text: 'Started outside HYPE',
    }
    await projectMessagingSnapshot(state.ctx.db, account, {
      status,
      messages: [message],
      outbox: [],
    })
    const input = { meta, accountId: account.id }
    expect((await getMessagingConversations(input))[0]).toMatchObject({
      chatId: chat,
      displayName: 'Native contact',
      recipient: null,
      preview: message.text,
    })
    expect((await getMessagingInbox({ ...input, after: 0 })).messages).toHaveLength(1)
    expect(
      await searchMessagingMessages({ ...input, chat, search: 'outside' }),
    ).toHaveLength(1)
    bridge.profile.mockResolvedValue({
      jid: chat,
      name: 'Provider contact',
      username: 'native_contact',
      phone: null,
      aliases: [chat],
      photo: null,
    })
    expect(await getMessagingProfile({ ...input, address: chat })).toMatchObject({
      name: 'Provider contact',
    })
    expect((await getMessagingConversations(input))[0]).toMatchObject({
      displayName: 'Provider contact',
      recipient: null,
    })
    bridge.media.mockResolvedValue(new Uint8Array([1, 2]))
    expect(
      await downloadMessagingMedia({
        ...input,
        chat,
        target: { id: message.id, sender: chat },
      }),
    ).toEqual(new Uint8Array([1, 2]))
    await markMessagingMessagesRead({
      ...input,
      chat,
      targets: [{ id: message.id, sender: chat }],
    })
    expect(bridge.messageAction).toHaveBeenCalledWith(
      account.bridgeAccountId,
      chat,
      { id: message.id, sender: chat },
      'read',
      expect.any(String),
    )
    bridge.send.mockImplementation(async (_account, request) => ({
      request,
      state: 'submitted',
      messageId: 'reply',
    }))
    expect(
      await sendMessagingMessage({
        ...input,
        to: chat,
        text: 'Reply to native chat',
        requestId: 'unlinked-reply',
      }),
    ).toMatchObject({ state: 'submitted' })
    expect(
      sqlite
        .prepare(
          "SELECT recipientUserId FROM messagingSend WHERE requestId='unlinked-reply'",
        )
        .get(),
    ).toEqual({ recipientUserId: null })
    await setMessagingConversationArchived({ ...input, chat, archived: true })
    expect(
      (await getMessagingConversations({ ...input, archived: true }))[0],
    ).toMatchObject({ chatId: chat, recipient: null })
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM userMessagingIdentity').get(),
    ).toEqual({ count: 2 })
  },
)

it('imports unlinked Telegram groups and permits observed sender profiles without allowing arbitrary lookups', async () => {
  const message: BridgeMessage = {
    id: 'group-message',
    sequence: 1,
    chat: '-100123',
    sender: '88',
    senderName: 'Group member',
    timestamp: 100,
    fromMe: false,
    text: 'Native group',
  }
  bridge.dialogs.mockResolvedValue({ messages: [message], next: null })
  const input = { meta, accountId: account.id }
  expect((await loadMessagingConversations(input)).messages).toEqual([message])
  expect((await getMessagingConversations(input))[0]).toMatchObject({
    chatId: '-100123',
    displayName: null,
    recipient: null,
  })
  bridge.profile.mockResolvedValue({ jid: '88', name: 'Group member', aliases: [] })
  await getMessagingProfile({ ...input, address: '88' })
  await expect(getMessagingProfile({ ...input, address: '89' })).rejects.toMatchObject({
    status: 403,
  })
  bridge.history.mockResolvedValue({ messages: [], nextBefore: null })
  await loadMessagingHistory({ ...input, chat: '-100123' })
  expect(bridge.history).toHaveBeenCalledWith(
    account.bridgeAccountId,
    '-100123',
    undefined,
  )
})

it('paginates all stored chats with tied timestamps without duplicates or HYPE-only filtering', async () => {
  const insert = sqlite.prepare(
    'INSERT INTO messagingConversation(id,accountId,chatId,lastMessageAt) VALUES (?,?,?,?)',
  )
  for (let index = 0; index < 105; index++)
    insert.run(
      `native-${String(index).padStart(3, '0')}`,
      account.id,
      String(1000 + index),
      100,
    )
  const input = { meta, accountId: account.id }
  const first = await getMessagingConversations(input)
  expect(first).toHaveLength(100)
  const last = first[first.length - 1]
  const second = await getMessagingConversations({
    ...input,
    before: { id: last.id, lastMessageAt: last.lastMessageAt },
  })
  expect(second).toHaveLength(5)
  expect(new Set([...first, ...second].map(row => row.id)).size).toBe(105)
  expect([...first, ...second].every(row => row.recipient === null)).toBe(true)
})

it('does not authorize an unlinked chat or sender recorded only on another account', async () => {
  sqlite.exec(`INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,enabled,createdAt,updatedAt) VALUES ('other-account','org-b','telegram','other-bridge',1,1,1);
    INSERT INTO messagingConversation(id,accountId,chatId) VALUES ('other-chat','other-account','77');
    INSERT INTO messagingMessage VALUES ('other-account','77','message','88',1,1,'{}');`)
  const input = { meta, accountId: account.id }
  await expect(
    sendMessagingMessage({
      ...input,
      to: '77',
      text: 'No cross-account access',
      requestId: 'other-chat',
    }),
  ).rejects.toMatchObject({ status: 403 })
  await expect(getMessagingProfile({ ...input, address: '88' })).rejects.toMatchObject({
    status: 403,
  })
  await expect(
    getMessagingConversations({ meta, accountId: 'other-account' }),
  ).rejects.toMatchObject({ status: 403 })
  expect(bridge.send).not.toHaveBeenCalled()
  expect(bridge.profile).not.toHaveBeenCalled()
})

it('attributes only original sends in the exact account and chat, never edits or provider claims', async () => {
  const insert = sqlite.prepare(
    'INSERT INTO messagingSend(accountId,requestId,actorUserId,request,state,messageId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)',
  )
  insert.run(
    account.id,
    'original-author',
    'operator-a',
    JSON.stringify({ requestId: 'original-author', to: '42', text: 'Original' }),
    'submitted',
    '7',
    1,
    1,
  )
  insert.run(
    account.id,
    'later-editor',
    'operator-b',
    JSON.stringify({
      requestId: 'later-editor',
      to: '42',
      text: 'Edited',
      editTo: { id: '7', sender: '99' },
    }),
    'submitted',
    '7',
    2,
    2,
  )
  const message: BridgeMessage = {
    id: '7',
    chat: '42',
    sender: '99',
    fromMe: true,
    text: 'Edited',
    sequence: 1,
    timestamp: 1,
  }
  const rows = await withMessagingOperators(state.ctx.db, account.id, [
    message,
    { ...message, chat: '43' },
    { ...message, fromMe: false },
    {
      ...message,
      id: 'external',
      operator: { id: 'forged', name: 'Forged', username: null, image: null },
    },
  ])
  expect(rows[0].operator).toMatchObject({ id: 'operator-a', username: 'operator_a' })
  expect(rows.slice(1).every(row => !row.operator)).toBe(true)
})

it('loads the selected native chat immediately without advancing past other chats awaiting replay', async () => {
  const messages: BridgeMessage[] = Array.from({ length: 105 }, (_, index) => ({
    sequence: index + 1,
    id: String(index + 1),
    chat: index === 104 ? '77' : '42',
    sender: index === 104 ? '77' : '42',
    timestamp: index + 1,
    fromMe: false,
    text: `Stored ${index + 1}`,
  }))
  await projectMessagingSnapshot(state.ctx.db, account, {
    status,
    messages,
    outbox: [],
  })
  const selected = await getMessagingInbox({
    meta,
    accountId: account.id,
    after: 0,
    chat: '77',
  })
  expect(selected.replayCursor).toBe(100)
  expect(selected.messages.find(message => message.chat === '77')).toMatchObject({
    id: '105',
    text: 'Stored 105',
  })
  const next = await getMessagingInbox({
    meta,
    accountId: account.id,
    after: selected.replayCursor,
  })
  expect(next.messages.map(message => message.id)).toEqual([
    '101',
    '102',
    '103',
    '104',
    '105',
  ])
  bridge.snapshot.mockClear()
  await expect(
    getMessagingInbox({ meta, accountId: account.id, after: 0, chat: 'unknown' }),
  ).rejects.toMatchObject({ status: 403 })
  expect(bridge.snapshot).not.toHaveBeenCalled()
})

it('isolates each chat preview, unread count and fallback name across chats and accounts', async () => {
  sqlite.exec(`INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,createdAt,updatedAt) VALUES ('other','org-b','telegram','other',1,1);
    INSERT INTO messagingConversation(id,accountId,chatId,lastMessageAt) VALUES ('first','account-a','77',100),('second','account-a','78',200),('empty','account-a','79',0),('other','other','77',300);`)
  const insert = sqlite.prepare('INSERT INTO messagingMessage VALUES (?,?,?,?,?,?,?)')
  for (const [accountId, chat, text, name, time, read] of [
    ['account-a', '77', 'Only first chat', 'First contact', 100, false],
    ['account-a', '78', 'Only second chat', 'Second contact', 200, true],
    ['other', '77', 'Must never appear here', 'Other account contact', 300, false],
  ] as const)
    insert.run(
      accountId,
      chat,
      'msg',
      chat,
      time,
      time,
      JSON.stringify({
        id: 'msg',
        chat,
        sender: chat,
        senderName: name,
        sequence: time,
        timestamp: time,
        fromMe: false,
        readByMe: read,
        text,
      }),
    )
  const rows = await getMessagingConversations({ meta, accountId: account.id })
  expect(rows.find(row => row.chatId === '77')).toMatchObject({
    preview: 'Only first chat',
    unreadCount: 1,
    displayName: 'First contact',
  })
  expect(rows.find(row => row.chatId === '78')).toMatchObject({
    preview: 'Only second chat',
    unreadCount: 0,
    displayName: 'Second contact',
  })
  expect(rows.find(row => row.chatId === '79')).toMatchObject({
    preview: null,
    unreadCount: 0,
    displayName: null,
  })
})

it('persists account chat pins above newer messages and restores recency order when unpinned', async () => {
  sqlite.exec(
    `INSERT INTO messagingConversation(id,accountId,chatId,lastMessageAt) VALUES ('older','account-a','77',1),('newer','account-a','78',999);`,
  )
  const input = { meta, accountId: account.id, chat: '77' }
  const pinned = await setMessagingConversationPinned({ ...input, pinned: true })
  expect(pinned.pinnedAt).toBeGreaterThan(0)
  expect(await setMessagingConversationPinned({ ...input, pinned: true })).toEqual(
    pinned,
  )
  sqlite.exec("UPDATE messagingConversation SET lastMessageAt=99999 WHERE id='newer'")
  const rows = await getMessagingConversations({ meta, accountId: account.id })
  expect(rows.map(row => row.id)).toEqual(['older', 'newer'])
  expect(rows[0].pinnedAt).toBe(pinned.pinnedAt)
  await setMessagingConversationPinned({ ...input, pinned: false })
  expect(
    (await getMessagingConversations({ meta, accountId: account.id })).map(
      row => row.id,
    ),
  ).toEqual(['newer', 'older'])
  await expect(
    setMessagingConversationPinned({ ...input, chat: 'absent', pinned: true }),
  ).rejects.toMatchObject({ status: 404 })
  state.ctx.userRoles = []
  await expect(
    setMessagingConversationPinned({ ...input, pinned: true }),
  ).rejects.toMatchObject({ status: 403 })
  expect(bridge.send).not.toHaveBeenCalled()
})

it('paginates across pinned and unpinned chats without dropping older pinned threads', async () => {
  const insert = sqlite.prepare(
    'INSERT INTO messagingConversation(id,accountId,chatId,lastMessageAt,pinnedAt) VALUES (?,?,?,?,?)',
  )
  for (let i = 0; i < 103; i++)
    insert.run(`pin-${String(i).padStart(3, '0')}`, account.id, String(1000 + i), 1, 20)
  insert.run('plain', account.id, '9999', 99999, null)
  const first = await getMessagingConversations({ meta, accountId: account.id })
  expect(first).toHaveLength(100)
  expect(first.every(row => row.pinnedAt === 20)).toBe(true)
  const last = first[first.length - 1]
  const rest = await getMessagingConversations({
    meta,
    accountId: account.id,
    before: { id: last.id, lastMessageAt: last.lastMessageAt, pinnedAt: last.pinnedAt },
  })
  expect(rest.map(row => row.id)).toEqual(['pin-100', 'pin-101', 'pin-102', 'plain'])
})
