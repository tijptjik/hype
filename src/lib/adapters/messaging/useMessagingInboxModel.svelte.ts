import type { WhatsAppMessage } from '#lib/api/services/whatsover.types.js'
import { messagingAvailability } from '#lib/messaging/availability.js'
// SVELTE
import { onMount, untrack } from 'svelte'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// API
import {
  checkMessagingUser,
  getMessagingAccounts,
  getMessagingConversations,
  getMessagingOrganisations,
  openUserMessagingConversation,
  searchMessagingUsers,
  setMessagingConversationArchived,
} from '#lib/api/messaging.remote.js'
// MESSAGING
import { chooseMessagingOrganisation } from '#lib/messaging/organisation-selection.js'
// TYPES
import type { WhatsAppConsoleModel } from '#lib/bits/patterns/whatsapp/whatsapp.types.js'
import type { MessagingPlatform } from '#lib/messaging/types.js'

type Account = Awaited<ReturnType<typeof getMessagingAccounts>>[number]
type Organisation = Awaited<ReturnType<typeof getMessagingOrganisations>>[number]
type StoredConversation = Awaited<ReturnType<typeof getMessagingConversations>>[number]
export type MessagingUser = Awaited<ReturnType<typeof searchMessagingUsers>>[number]
export type InboxConversation = Omit<StoredConversation, 'recipient'> & {
  recipient: StoredConversation['recipient'] & { name: string }
  key: string
  platform: MessagingPlatform
  preview: string
  timestamp: number
}

/** One prism-selected organisation and one list of its HYPE-user conversations.
 * @returns Reactive inbox state; child runtimes retain one live session per account.
 */
export function useMessagingInboxModel() {
  const scope = getAdminCtx().view.scope
  const meta = { isAdminRequest: true as const }
  let organisations = $state<Organisation[]>([])
  let accounts = $state<Account[]>([])
  let directory = $state<(StoredConversation & { platform: MessagingPlatform })[]>([])
  let runtimes = $state.raw<Record<string, WhatsAppConsoleModel>>({})
  let selectedOrganisation = $state('')
  let selectedKey = $state('')
  let search = $state('')
  let results = $state<MessagingUser[]>([])
  let failure = $state('')
  let directoryFailure = $state('')
  let loading = $state(true)
  let searching = $state(false)
  let routing = $state(false)
  let ready = $state(false)
  let active = $state(false)
  let generation = 0
  let searchGeneration = 0
  let refreshing: number | null = null
  let directoryRevision = 0
  let archived = $state(false)
  let archiving = $state<string[]>([])

  const conversations = $derived.by((): InboxConversation[] =>
    directory
      .filter(row => Boolean(row.isArchived) === archived)
      .map(row => {
        const model = runtimes[row.accountId]
        const native = model?.conversations.find(
          chat => model.canonicalChat(chat.id) === model.canonicalChat(row.chatId),
        )
        return {
          ...row,
          recipient: {
            ...row.recipient,
            name: row.recipient.name || row.recipient.username || 'HYPE user',
          },
          key: `${row.accountId}:${row.chatId}`,
          preview: native?.preview ?? '',
          timestamp: Math.max(row.lastMessageAt, native?.timestamp ?? 0),
        }
      })
      .sort(
        (a, b) =>
          b.timestamp - a.timestamp ||
          (a.recipient.name || a.recipient.username || '').localeCompare(
            b.recipient.name || b.recipient.username || '',
          ) ||
          a.key.localeCompare(b.key),
      ),
  )
  let preparingForward = $state(false)
  let forwarding = $state<{
    message: WhatsAppMessage
    source: WhatsAppConsoleModel
  } | null>(null)
  const selected = $derived(conversations.find(row => row.key === selectedKey) ?? null)
  const selectedModel = $derived(selected ? runtimes[selected.accountId] : undefined)

  /** Reload verified HYPE associations without disturbing selection, drafts, or live cursors. */
  async function refreshDirectory(force = false): Promise<void> {
    if (
      !active ||
      (!force && refreshing !== null) ||
      archiving.length ||
      !accounts.length
    )
      return
    const scopeRevision = generation
    const revision = ++directoryRevision
    const folder = archived
    refreshing = revision
    const current = [...accounts]
    try {
      const responses = await Promise.allSettled(
        current.map(async account => {
          const query = getMessagingConversations({
            meta,
            accountId: account.id,
            archived: folder,
          })
          await query.refresh()
          return (await query).map(row => ({ ...row, platform: account.platform }))
        }),
      )
      if (!active || scopeRevision !== generation || revision !== directoryRevision)
        return
      const next = responses.flatMap((result, index) =>
        result.status === 'fulfilled'
          ? result.value
          : directory.filter(row => row.accountId === current[index].id),
      )
      directory = next
      directoryFailure = responses.some(result => result.status === 'rejected')
        ? 'Some conversations could not be refreshed. Saved conversations remain available.'
        : ''
    } finally {
      if (refreshing === revision) refreshing = null
    }
  }

  /** Change organisation from the prism, invalidating all in-flight responses for the old scope. */
  async function loadOrganisation(id: string | null): Promise<void> {
    const revision = ++generation
    directoryRevision++
    refreshing = null
    archived = false
    archiving = []
    searchGeneration++
    forwarding = null
    preparingForward = false
    selectedOrganisation = id ?? ''
    selectedKey = ''
    accounts = []
    directory = []
    runtimes = {}
    search = ''
    results = []
    searching = false
    routing = false
    failure = ''
    directoryFailure = ''
    loading = Boolean(id)
    if (!id) return
    try {
      const query = getMessagingAccounts({ meta, organisationId: id })
      await query.refresh()
      const rows = await query
      if (!active || revision !== generation) return
      accounts = rows
      await refreshDirectory()
    } catch (cause) {
      if (active && revision === generation)
        failure =
          cause instanceof Error ? cause.message : 'Unable to load messaging accounts'
    } finally {
      if (active && revision === generation) loading = false
    }
  }

  $effect(() => {
    if (!active || !ready) return
    const pins = scope.prisms.organisation
    const id = chooseMessagingOrganisation(organisations, pins)
    if (pins.length !== (id ? 1 : 0) || (id !== null && pins[0] !== id))
      untrack(() => {
        void Promise.resolve(scope.selectOrganisation(id)).catch(() => {
          if (active && selectedOrganisation === id)
            failure =
              'The organisation was selected, but its sidebar could not be fully refreshed.'
        })
      })
    if ((id ?? '') !== selectedOrganisation)
      untrack(() => {
        void loadOrganisation(id)
      })
  })

  const connectionState = $derived(
    accounts
      .map(
        account => `${account.id}:${runtimes[account.id]?.status?.connected ?? false}`,
      )
      .join('|'),
  )

  $effect(() => {
    // A connection transition retries the current search after pairing/reconnection.
    void connectionState
    const query = search.trim()
    const organisationId = selectedOrganisation
    const revision = ++searchGeneration
    results = []
    if (!active || !organisationId || !query) {
      searching = false
      return
    }
    searching = true
    const timer = setTimeout(() => {
      void searchMessagingUsers({ meta, organisationId, search: query })
        .then(rows => {
          if (!active || revision !== searchGeneration) return
          results = rows
          // Show directory matches immediately; a slow provider only holds its own row.
          const pending = rows.flatMap(row =>
            row.channels
              .filter(channel => channel.checking)
              .map(channel => ({ userId: row.userId, platform: channel.platform })),
          )
          const checkNext = async (): Promise<void> => {
            while (active && revision === searchGeneration && pending.length) {
              const row = pending.shift()!
              try {
                const checked = await checkMessagingUser({
                  meta,
                  organisationId,
                  userId: row.userId,
                  platform: row.platform,
                })
                if (active && revision === searchGeneration)
                  results = results.map(value =>
                    value.userId === row.userId
                      ? {
                          ...value,
                          ...messagingAvailability(
                            value.channels.map(channel =>
                              channel.platform === row.platform ? checked : channel,
                            ),
                            value.preferredPlatform,
                          ),
                        }
                      : value,
                  )
              } catch {
                if (active && revision === searchGeneration)
                  results = results.map(value =>
                    value.userId === row.userId
                      ? {
                          ...value,
                          ...messagingAvailability(
                            value.channels.map(channel =>
                              channel.platform === row.platform
                                ? {
                                    ...channel,
                                    checking: false,
                                    available: false,
                                    unavailableReason:
                                      'Account check unavailable; search again to retry',
                                  }
                                : channel,
                            ),
                            value.preferredPlatform,
                          ),
                        }
                      : value,
                  )
              }
            }
          }
          void Promise.all(
            Array.from({ length: Math.min(3, pending.length) }, checkNext),
          )
        })
        .catch(cause => {
          if (active && revision === searchGeneration)
            failure =
              cause instanceof Error ? cause.message : 'Unable to search HYPE users'
        })
        .finally(() => {
          if (active && revision === searchGeneration) searching = false
        })
    }, 200)
    return () => clearTimeout(timer)
  })

  /** Select an existing account-pinned conversation, retaining each conversation's draft. */
  async function selectConversation(key: string): Promise<void> {
    if (preparingForward) return
    const row = conversations.find(item => item.key === key)
    const model = row && runtimes[row.accountId]
    if (!row || !model) return
    if (
      model.busy ||
      model.recording ||
      selectedModel?.busy ||
      selectedModel?.recording
    ) {
      failure =
        'Finish the current send or voice recording before switching conversations.'
      return
    }
    model.selectChat(row.chatId)
    selectedKey = key
    failure = ''
    if (forwarding) await stageForward(model)
  }

  /** Switch between the inbox and archive without dropping an in-progress send.
   * @param value Whether to show archived threads.
   * @returns Resolves when the requested folder has refreshed.
   */
  async function showArchived(value: boolean): Promise<void> {
    if (value === archived || archiving.length || preparingForward) return
    if (selectedModel?.busy || selectedModel?.recording) {
      failure = 'Finish the current send or voice recording before switching folders.'
      return
    }
    archived = value
    selectedKey = ''
    directory = []
    failure = ''
    await refreshDirectory(true)
  }

  /** Move only the chosen thread, restoring it if the persisted write fails.
   * @param key Account-pinned thread key; opening a context menu never selects it.
   * @param value Desired archive state.
   * @returns Resolves after the durable mutation, with errors retained in the inbox.
   */
  async function archiveConversation(key: string, value: boolean): Promise<void> {
    const row = conversations.find(item => item.key === key)
    if (!row || archiving.includes(key) || preparingForward) return
    const runtime = runtimes[row.accountId]
    if (runtime?.busy || runtime?.recording) {
      failure =
        'Finish the current send or voice recording before archiving this thread.'
      return
    }
    const revision = generation
    directoryRevision++
    refreshing = null
    archiving = [...archiving, key]
    failure = ''
    directory = directory.map(item =>
      item.id === row.id && item.accountId === row.accountId
        ? { ...item, isArchived: value }
        : item,
    )
    try {
      const confirmed = await setMessagingConversationArchived({
        meta,
        accountId: row.accountId,
        chat: row.chatId,
        archived: value,
      })
      if (!active || revision !== generation) return
      directory = directory.map(item =>
        item.id === row.id && item.accountId === row.accountId
          ? { ...item, isArchived: confirmed.isArchived }
          : item,
      )
      if (selectedKey === key && confirmed.isArchived !== archived) selectedKey = ''
    } catch (cause) {
      if (!active || revision !== generation) return
      directory = directory.map(item =>
        item.id === row.id && item.accountId === row.accountId
          ? { ...item, isArchived: row.isArchived }
          : item,
      )
      failure = cause instanceof Error ? cause.message : 'Unable to update this thread'
    } finally {
      if (active && revision === generation)
        archiving = archiving.filter(item => item !== key)
    }
  }

  /** Choose a HYPE destination before staging a forward; the Send button remains explicit. */
  function beginForward(message: WhatsAppMessage): void {
    if (!selectedModel || message.deleted || message.content?.viewOnce) return
    forwarding = { message, source: selectedModel }
    search = ''
  }
  async function stageForward(destination: WhatsAppConsoleModel): Promise<void> {
    const intent = forwarding
    if (!intent) return
    forwarding = null
    if (destination.text || destination.attachment || destination.requestId) {
      failure =
        'This conversation already has a draft. Clear or send it before forwarding.'
      return
    }
    routing = true
    preparingForward = true
    const revision = generation,
      chat = destination.selectedChat
    try {
      const file = await intent.source.downloadForward?.(intent.message)
      if (!active || revision !== generation || destination.selectedChat !== chat)
        throw new Error('Conversation changed; choose the forward destination again')
      if (destination.text || destination.attachment || destination.requestId)
        throw new Error(
          'This conversation already has a draft. Clear or send it before forwarding.',
        )
      if (file)
        await destination.upload(file, intent.message.content?.kind === 'sticker')
      if (!active || revision !== generation || destination.selectedChat !== chat)
        return
      if (file && !destination.attachment)
        throw new Error('Forward attachment could not be prepared')
      destination.text = intent.message.content?.text || intent.message.text || ''
    } catch (cause) {
      if (active && revision === generation)
        failure = cause instanceof Error ? cause.message : 'Unable to prepare forward'
    } finally {
      if (revision === generation) {
        routing = false
        preparingForward = false
      }
    }
  }

  /** Resolve a selected HYPE user through their verified preference; no raw native addresses enter the UI. */
  async function openUser(
    user: MessagingUser,
    platform?: 'whatsapp' | 'telegram',
  ): Promise<void> {
    if (
      routing ||
      !selectedOrganisation ||
      !(platform
        ? user.channels.find(channel => channel.platform === platform)?.available
        : user.available)
    )
      return
    if (selectedModel?.busy || selectedModel?.recording) {
      failure =
        'Finish the current send or voice recording before switching conversations.'
      return
    }
    const revision = generation
    routing = true
    failure = ''
    try {
      const conversation = await openUserMessagingConversation({
        meta,
        organisationId: selectedOrganisation,
        username: user.username,
        ...(platform ? { platform } : {}),
      })
      if (!active || revision !== generation) return
      // A newly opened chat has no messages yet, so load its HYPE identity before selecting it.
      archived = Boolean(conversation.isArchived)
      directoryRevision++
      refreshing = null
      const query = getMessagingConversations({
        meta,
        accountId: conversation.accountId,
        archived,
      })
      await query.refresh()
      const rows = await query
      if (!active || revision !== generation) return
      directory = [
        ...directory.filter(row => row.accountId !== conversation.accountId),
        ...rows.map(row => ({ ...row, platform: conversation.platform })),
      ]
      await selectConversation(`${conversation.accountId}:${conversation.chatId}`)
      search = ''
    } catch (cause) {
      if (active && revision === generation)
        failure =
          cause instanceof Error ? cause.message : 'Unable to open this conversation'
    } finally {
      if (active && revision === generation) routing = false
    }
  }

  /** Publish an account runtime for the lifetime of its mounted child. */
  function registerRuntime(id: string, model: WhatsAppConsoleModel): () => void {
    runtimes = { ...runtimes, [id]: model }
    return () => {
      if (runtimes[id] !== model) return
      const next = { ...runtimes }
      delete next[id]
      runtimes = next
    }
  }

  onMount(() => {
    active = true
    void (async () => {
      try {
        const query = getMessagingOrganisations({ meta })
        await query.refresh()
        const rows = await query
        if (active) {
          organisations = rows
          ready = true
        }
      } catch (cause) {
        if (active)
          failure =
            cause instanceof Error ? cause.message : 'Unable to load organisations'
      } finally {
        if (active && !selectedOrganisation) loading = false
      }
    })()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshDirectory()
    }, 5000)
    return () => {
      active = false
      generation++
      searchGeneration++
      clearInterval(timer)
    }
  })

  return {
    get organisations() {
      return organisations
    },
    get accounts() {
      return accounts
    },
    get selectedOrganisation() {
      return selectedOrganisation
    },
    get organisation() {
      return organisations.find(row => row.id === selectedOrganisation)
    },
    get runtimes() {
      return runtimes
    },
    get conversations() {
      return conversations
    },
    get selected() {
      return selected
    },
    get selectedModel() {
      return selectedModel
    },
    get archived() {
      return archived
    },
    get archiving() {
      return archiving
    },
    showArchived,
    archiveConversation,
    get search() {
      return search
    },
    set search(value: string) {
      search = value
    },
    get results() {
      return results
    },
    get searching() {
      return searching
    },
    get loading() {
      return loading
    },
    get routing() {
      return routing
    },
    get error() {
      return failure || directoryFailure
    },
    get preparingForward() {
      return preparingForward
    },
    get forwarding() {
      return Boolean(forwarding)
    },
    beginForward,
    cancelForward: () => {
      forwarding = null
    },
    selectConversation,
    openUser,
    registerRuntime,
    refreshDirectory,
  }
}
