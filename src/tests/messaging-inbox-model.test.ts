// @vitest-environment jsdom
// TESTS
import { cleanup, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// SVELTE
import { flushSync } from 'svelte'
// COMPONENTS
import Fixture from './fixtures/components/MessagingInboxModelFixture.svelte'
// TYPES
import type { MessagingAvailability } from '#lib/messaging/availability.js'
import type {
  useMessagingInboxModel,
  MessagingUser,
} from '#lib/adapters/messaging/useMessagingInboxModel.svelte.js'
import type { WhatsAppConsoleModel } from '#lib/bits/patterns/whatsapp/whatsapp.types.js'

const integrations = vi.hoisted(() => ({ whatsapp: true, telegram: true }))
vi.mock('#lib/messaging/integrations.js', () => ({
  messagingIntegrations: integrations,
}))

const channels = (checking = false): MessagingAvailability[] => [
  {
    platform: 'whatsapp',
    accountId: null,
    chatId: null,
    available: false,
    unavailableReason: 'Not configured',
    checking: false,
  },
  {
    platform: 'telegram',
    accountId: 'a',
    chatId: checking ? null : '42',
    available: !checking,
    unavailableReason: checking ? 'Checking Telegram…' : null,
    checking,
  },
]
const waitFor = vi.waitFor
type Model = ReturnType<typeof useMessagingInboxModel>
type Scope = {
  prisms: { organisation: string[] }
  selectOrganisation: (id: string | null) => Promise<void>
}
const mock = vi.hoisted(() => ({
  scope: null as unknown as Scope,
  organisations: vi.fn(),
  accounts: vi.fn(),
  conversations: vi.fn(),
  check: vi.fn(),
  search: vi.fn(),
  open: vi.fn(),
  archive: vi.fn(),
  pin: vi.fn(),
}))
vi.mock('#lib/context/admin.svelte.js', () => ({
  getAdminCtx: () => ({ view: { scope: mock.scope } }),
}))
vi.mock('#lib/api/messaging.remote.js', () => ({
  getMessagingOrganisations: mock.organisations,
  getMessagingAccounts: mock.accounts,
  checkMessagingUser: mock.check,
  getMessagingConversations: mock.conversations,
  searchMessagingUsers: mock.search,
  openUserMessagingConversation: mock.open,
  setMessagingConversationArchived: mock.archive,
  setMessagingConversationPinned: mock.pin,
}))

/** @returns A query-shaped promise that never contacts an account or provider. */
function query<T>(value: T | Promise<T>) {
  return Object.assign(Promise.resolve(value), {
    refresh: vi.fn().mockResolvedValue(undefined),
  })
}
/** @returns A controlled response for testing requests that finish out of order. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
/** @returns A synthetic stored thread with a verified HYPE recipient. */
function conversation(accountId: string) {
  return {
    id: accountId,
    accountId,
    chatId: '42',
    platform: 'telegram' as const,
    lastMessageAt: 1,
    isArchived: false,
    unreadCount: 0,
    pinnedAt: null as number | null,
    recipient: {
      id: 'person',
      name: 'Synthetic Person',
      username: 'synthetic',
      image: null,
    },
  }
}
/** @returns A runtime exposing only the capabilities needed by inbox selection. */
function runtime(recording = false) {
  return {
    conversations: [],
    canonicalChat: (id: string) => id,
    selectChat: vi.fn(),
    busy: false,
    recording,
  } as unknown as WhatsAppConsoleModel
}
/** @returns A mounted real model with reactive prism selection. */
function setup(pins: string[] = []) {
  let model!: Model
  render(Fixture, {
    pins,
    onScope: (scope: Scope) => {
      mock.scope = scope
    },
    onModel: (value: Model) => {
      model = value
    },
  })
  return model
}
beforeEach(() => {
  vi.resetAllMocks()
  integrations.telegram = true
  mock.organisations.mockImplementation(() =>
    query([
      { id: 'a', code: 'a', isMember: true, hasMessaging: true },
      { id: 'b', code: 'b', isMember: true, hasMessaging: true },
    ]),
  )
  mock.accounts.mockImplementation(({ organisationId }: { organisationId: string }) =>
    query([{ id: organisationId, organisationId, platform: 'telegram' }]),
  )
  mock.conversations.mockImplementation(({ accountId }: { accountId: string }) =>
    query([conversation(accountId)]),
  )
  mock.search.mockResolvedValue([])
})
afterEach(cleanup)

it('reduces existing pins to their first authorised organisation and loads that inbox', async () => {
  const model = setup(['b', 'a'])
  await waitFor(() => expect(model.accounts.map(account => account.id)).toEqual(['b']))
  expect(mock.scope.prisms.organisation).toEqual(['b'])
  expect(model.selectedOrganisation).toBe('b')
  expect(mock.accounts).not.toHaveBeenCalledWith(
    expect.objectContaining({ organisationId: 'a' }),
  )
})

it('chooses the first configured organisation when no organisation is pinned', async () => {
  mock.organisations.mockImplementation(() =>
    query([
      { id: 'a', code: 'a', isMember: true, hasMessaging: false },
      { id: 'b', code: 'b', isMember: true, hasMessaging: true },
    ]),
  )
  const model = setup()
  await waitFor(() => expect(model.selectedOrganisation).toBe('b'))
  expect(mock.scope.prisms.organisation).toEqual(['b'])
})

it('finishes loading without a default when multiple organisations have no messaging configured', async () => {
  mock.organisations.mockImplementation(() =>
    query([
      { id: 'a', code: 'a' },
      { id: 'b', code: 'b' },
    ]),
  )
  const model = setup()
  await waitFor(() => expect(model.loading).toBe(false))
  expect(model.selectedOrganisation).toBe('')
  expect(mock.accounts).not.toHaveBeenCalled()
  await mock.scope.selectOrganisation('b')
  await waitFor(() => expect(model.accounts[0]?.id).toBe('b'))
})

it('loads a new organisation immediately while an older directory request is still pending', async () => {
  const old = deferred<ReturnType<typeof conversation>[]>()
  mock.conversations.mockImplementation(({ accountId }: { accountId: string }) =>
    query(accountId === 'a' ? old.promise : [conversation(accountId)]),
  )
  const model = setup(['a'])
  await waitFor(() =>
    expect(mock.conversations).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'a' }),
    ),
  )
  await mock.scope.selectOrganisation('b')
  await waitFor(() =>
    expect(model.conversations.map(row => row.accountId)).toEqual(['b']),
  )
  old.resolve([conversation('a')])
  await old.promise
  await Promise.resolve()
  expect(model.conversations.map(row => row.accountId)).toEqual(['b'])
})

it('ignores obsolete HYPE-user search responses and clears results on organisation changes', async () => {
  const first = deferred<MessagingUser[]>(),
    second = deferred<MessagingUser[]>()
  mock.search.mockImplementation(({ search }: { search: string }) =>
    search === 'first' ? first.promise : second.promise,
  )
  const model = setup(['a'])
  await waitFor(() => expect(model.selectedOrganisation).toBe('a'))
  flushSync(() => {
    model.search = 'first'
  })
  await waitFor(() =>
    expect(mock.search).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'first' }),
    ),
  )
  flushSync(() => {
    model.search = 'second'
  })
  await waitFor(() =>
    expect(mock.search).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'second' }),
    ),
  )
  first.resolve([
    {
      userId: 'old',
      name: 'Old result',
      username: 'old',
      image: null,
      preferredPlatform: null,
      platform: 'telegram',
      accountId: 'a',
      chatId: '42',
      available: true,
      unavailableReason: null,
      checking: false,
      channels: channels(),
    },
  ])
  await first.promise
  expect(model.results).toEqual([])
  second.resolve([
    {
      userId: 'new',
      name: 'New result',
      username: 'new',
      image: null,
      preferredPlatform: null,
      platform: 'telegram',
      accountId: 'a',
      chatId: '43',
      available: true,
      unavailableReason: null,
      checking: false,
      channels: channels(),
    },
  ])
  await waitFor(() => expect(model.results.map(row => row.userId)).toEqual(['new']))
  await mock.scope.selectOrganisation('b')
  await waitFor(() => expect(model.selectedOrganisation).toBe('b'))
  expect(model.search).toBe('')
  expect(model.results).toEqual([])
})

it('does not let an old runtime cleanup unregister a replacement and clears selection on scope changes', async () => {
  const model = setup(['a'])
  await waitFor(() => expect(model.conversations).toHaveLength(1))
  const old = runtime(),
    replacement = runtime()
  const unregister = model.registerRuntime('a', old)
  model.registerRuntime('a', replacement)
  unregister()
  expect(model.runtimes.a).toBe(replacement)
  model.selectConversation('a:42')
  expect(replacement.selectChat).toHaveBeenCalledWith('42')
  expect(model.selected?.accountId).toBe('a')
  await mock.scope.selectOrganisation('b')
  await waitFor(() => expect(model.selectedOrganisation).toBe('b'))
  expect(model.selected).toBeNull()
  expect(model.runtimes).toEqual({})
})

it('keeps the current recording selected when another platform conversation is clicked', async () => {
  mock.accounts.mockImplementation(() =>
    query([
      { id: 'a', platform: 'telegram' },
      { id: 'w', platform: 'whatsapp' },
    ]),
  )
  const model = setup(['a'])
  await waitFor(() => expect(model.conversations).toHaveLength(2))
  const current = runtime(),
    next = runtime()
  model.registerRuntime('a', current)
  model.registerRuntime('w', next)
  model.selectConversation('a:42')
  Object.defineProperty(current, 'recording', { value: true })
  model.selectConversation('w:42')
  expect(model.selected?.accountId).toBe('a')
  expect(next.selectChat).not.toHaveBeenCalled()
  expect(model.error).toContain('recording')
})

it('shows directory results while a provider is slow and ignores obsolete account checks', async () => {
  const slow = deferred<{
    chatId: string
    available: boolean
    unavailableReason: null
    checking: boolean
  }>()
  mock.search.mockResolvedValue([
    {
      userId: 'person',
      name: 'Person',
      username: 'person',
      image: null,
      preferredPlatform: null,
      platform: 'telegram',
      accountId: 'a',
      chatId: null,
      available: false,
      unavailableReason: 'Checking Telegram…',
      checking: true,
      channels: channels(true),
    },
  ])
  mock.check.mockReturnValue(slow.promise)
  const model = setup(['a'])
  await waitFor(() => expect(model.selectedOrganisation).toBe('a'))
  flushSync(() => {
    model.search = 'person'
  })
  await waitFor(() => expect(model.results).toHaveLength(1))
  expect(model.searching).toBe(false)
  expect(model.results[0].checking).toBe(true)
  flushSync(() => {
    model.search = ''
  })
  slow.resolve({
    chatId: '42',
    available: true,
    unavailableReason: null,
    checking: false,
  })
  await slow.promise
  await waitFor(() => expect(model.results).toEqual([]))
})

it('cancels a pending forward when the organisation changes', async () => {
  const model = setup(['a'])
  await waitFor(() => expect(model.conversations).toHaveLength(1))
  model.registerRuntime('a', runtime())
  await model.selectConversation('a:42')
  model.beginForward({
    sequence: 1,
    id: 'message',
    chat: '42',
    sender: '42',
    timestamp: 1,
    fromMe: false,
    text: 'Synthetic forward',
  })
  expect(model.forwarding).toBe(true)
  await mock.scope.selectOrganisation('b')
  await waitFor(() => expect(model.selectedOrganisation).toBe('b'))
  expect(model.forwarding).toBe(false)
})

it('archives only the requested platform thread, persists it across folder reloads, and restores it', async () => {
  const rows = [
    conversation('a'),
    { ...conversation('w'), platform: 'whatsapp' as const },
  ]
  mock.accounts.mockImplementation(() =>
    query([
      { id: 'a', platform: 'telegram' },
      { id: 'w', platform: 'whatsapp' },
    ]),
  )
  mock.conversations.mockImplementation(({ accountId, archived = false }) =>
    query(
      rows.filter(row => row.accountId === accountId && row.isArchived === archived),
    ),
  )
  mock.archive.mockImplementation(async ({ accountId, archived }) => {
    const row = rows.find(row => row.accountId === accountId)!
    row.isArchived = archived
    return { id: row.id, isArchived: archived }
  })
  const model = setup(['a'])
  await waitFor(() => expect(model.conversations).toHaveLength(2))
  const telegram = runtime(),
    whatsapp = runtime()
  model.registerRuntime('a', telegram)
  model.registerRuntime('w', whatsapp)
  await model.selectConversation('a:42')
  await model.archiveConversation('w:42', true)
  expect(model.selected?.key).toBe('a:42')
  expect(whatsapp.selectChat).not.toHaveBeenCalled()
  expect(model.conversations.map(row => row.key)).toEqual(['a:42'])
  await model.showArchived(true)
  expect(model.conversations.map(row => row.key)).toEqual(['w:42'])
  await model.archiveConversation('w:42', false)
  await model.showArchived(false)
  expect(model.conversations).toHaveLength(2)
})

it('rolls back a failed archive and discards a stale inbox refresh', async () => {
  const model = setup(['a'])
  await waitFor(() => expect(model.conversations).toHaveLength(1))
  model.registerRuntime('a', runtime())
  await model.selectConversation('a:42')
  const old = deferred<ReturnType<typeof conversation>[]>()
  mock.conversations.mockReturnValueOnce(query(old.promise))
  const refresh = model.refreshDirectory()
  mock.archive.mockRejectedValueOnce(new Error('Archive unavailable'))
  await model.archiveConversation('a:42', true)
  expect(model.selected?.key).toBe('a:42')
  expect(model.error).toBe('Archive unavailable')
  mock.archive.mockResolvedValueOnce({ id: 'a', isArchived: true })
  await model.archiveConversation('a:42', true)
  old.resolve([conversation('a')])
  await refresh
  expect(model.conversations).toHaveLength(0)
})

it('uses the native acknowledgment when another client changes the folder during the request', async () => {
  const model = setup(['a'])
  await waitFor(() => expect(model.conversations).toHaveLength(1))
  model.registerRuntime('a', runtime())
  await model.selectConversation('a:42')
  mock.archive.mockResolvedValueOnce({ id: 'a', isArchived: false })
  await model.archiveConversation('a:42', true)
  expect(model.conversations).toHaveLength(1)
  expect(model.selected?.key).toBe('a:42')
  expect(model.error).toBe('')
})

it('retains the saved platform preference when asynchronous availability checks finish', async () => {
  const pending = (['whatsapp', 'telegram'] as const).map(platform => ({
    platform,
    accountId: platform,
    chatId: null,
    available: false,
    unavailableReason: 'Checking…',
    checking: true,
  }))
  mock.search.mockResolvedValue([
    {
      userId: 'person',
      name: 'Person',
      username: 'person',
      image: null,
      preferredPlatform: 'telegram',
      ...pending[1],
      channels: pending,
    },
  ])
  mock.check.mockImplementation(async ({ platform }) => ({
    platform,
    accountId: platform,
    chatId: '42',
    available: true,
    unavailableReason: null,
    checking: false,
  }))
  const model = setup(['a'])
  await waitFor(() => expect(model.selectedOrganisation).toBe('a'))
  flushSync(() => {
    model.search = 'person'
  })
  await waitFor(() =>
    expect(model.results[0]?.channels.every(channel => channel.available)).toBe(true),
  )
  expect(model.results[0].platform).toBe('telegram')
})

it('presents unlinked native contacts distinctly and searches their saved display names', async () => {
  mock.conversations.mockImplementation(({ accountId }: { accountId: string }) =>
    query([
      conversation(accountId),
      {
        ...conversation(accountId),
        id: 'native',
        chatId: '77',
        recipient: null,
        displayName: 'Native Contact',
        preview: 'An existing native chat',
        lastMessageAt: 2,
      },
      {
        ...conversation(accountId),
        id: 'group',
        chatId: '-100123',
        recipient: null,
        displayName: 'Native Group',
        lastMessageAt: 3,
      },
    ]),
  )
  const model = setup(['a'])
  await waitFor(() => expect(model.conversations).toHaveLength(3))
  expect(model.conversations.find(row => row.chatId === '77')).toMatchObject({
    hypeLinked: false,
    isGroup: false,
    recipient: { id: null, name: 'Native Contact', username: null },
    preview: 'An existing native chat',
  })
  expect(model.conversations.find(row => row.chatId === '-100123')).toMatchObject({
    hypeLinked: false,
    isGroup: true,
  })
  expect(model.conversations.find(row => row.chatId === '42')).toMatchObject({
    hypeLinked: true,
  })
  flushSync(() => {
    model.search = 'Native Contact'
  })
  expect(model.visibleConversations.map(row => row.chatId)).toEqual(['77'])
  const nativeRuntime = runtime()
  model.registerRuntime('a', nativeRuntime)
  await model.selectConversation('a:77')
  expect(nativeRuntime.selectChat).toHaveBeenCalledWith('77')
  expect(model.selected?.hypeLinked).toBe(false)
})

it('discovers Telegram dialogs on connection and retains native metadata without inventing HYPE membership', async () => {
  mock.conversations.mockImplementation(({ accountId }: { accountId: string }) =>
    query([
      {
        ...conversation(accountId),
        recipient: null,
        displayName: null,
        preview: 'Saved preview',
      },
    ]),
  )
  const model = setup(['a'])
  await waitFor(() => expect(model.accounts).toHaveLength(1))
  const nativeRuntime = {
    ...runtime(),
    status: { connected: true },
    conversations: [
      {
        id: '42',
        name: 'Provider Name',
        username: 'provider_handle',
        photo: null,
        timestamp: 2,
        preview: 'Native preview',
      },
    ],
    loadConversations: vi.fn().mockResolvedValue(undefined),
    conversationsComplete: true,
  } as unknown as WhatsAppConsoleModel
  flushSync(() => {
    model.registerRuntime('a', nativeRuntime)
  })
  await waitFor(() => expect(nativeRuntime.loadConversations).toHaveBeenCalledOnce())
  expect(model.conversations[0]).toMatchObject({
    hypeLinked: false,
    recipient: { name: 'Provider Name', username: 'provider_handle' },
    preview: 'Native preview',
  })
  expect(model.hasMoreConversations).toBe(false)
})

it('pins without changing selection or drafts, retains pins during refresh, and rolls back failed unpins', async () => {
  const rows = [
    { ...conversation('a'), id: 'new', chatId: '42', lastMessageAt: 100 },
    { ...conversation('a'), id: 'old', chatId: '77', lastMessageAt: 1 },
  ]
  mock.conversations.mockImplementation(() => query(structuredClone(rows)))
  mock.pin.mockImplementation(
    async ({ chat, pinned }: { chat: string; pinned: boolean }) => {
      const row = rows.find(row => row.chatId === chat)!
      row.pinnedAt = pinned ? 500 : null
      return { id: row.id, pinnedAt: row.pinnedAt }
    },
  )
  const model = setup(['a'])
  await waitFor(() => expect(model.conversations).toHaveLength(2))
  const live = runtime()
  model.registerRuntime('a', live)
  await model.selectConversation('a:42')
  await model.pinConversation('a:77', true)
  expect(model.conversations.map(row => row.chatId)).toEqual(['77', '42'])
  expect(model.selected?.chatId).toBe('42')
  rows[0].lastMessageAt = 999999
  await model.refreshDirectory(true)
  expect(model.conversations.map(row => row.chatId)).toEqual(['77', '42'])
  mock.pin.mockRejectedValueOnce(new Error('Pin save failed'))
  await model.pinConversation('a:77', false)
  expect(model.conversations[0].chatId).toBe('77')
  expect(model.error).toBe('Pin save failed')
  await model.pinConversation('a:77', false)
  expect(model.conversations.map(row => row.chatId)).toEqual(['42', '77'])
})

it('does not mount suspended Telegram runtimes or request their directory', async () => {
  integrations.telegram = false
  mock.accounts.mockImplementation(() =>
    query([
      { id: 'tg', organisationId: 'a', platform: 'telegram' },
      { id: 'wa', organisationId: 'a', platform: 'whatsapp' },
    ]),
  )
  const model = setup(['a'])
  await waitFor(() => expect(model.accounts.map(account => account.id)).toEqual(['wa']))
  expect(mock.conversations).not.toHaveBeenCalledWith(
    expect.objectContaining({ accountId: 'tg' }),
  )
  await waitFor(() =>
    expect(mock.conversations).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'wa' }),
    ),
  )
})
