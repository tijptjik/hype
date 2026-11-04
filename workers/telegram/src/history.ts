import type { TelegramClient } from '@mtcute/core/client.js'
import type {
  BridgeDialogCursor,
  BridgeDialogPage,
  BridgeHistoryPage,
} from '@hype/messaging-bridge/types'
import type { TelegramJournal } from './journal'
import { projectMessage } from './projection'

/** Import one bounded, exclusive history page without advancing the inbox consumer's cursor. */
export async function loadHistoryPage(
  client: Pick<TelegramClient, 'getHistory'>,
  journal: TelegramJournal,
  chat: number,
  before?: string,
): Promise<BridgeHistoryPage> {
  if (
    before !== undefined &&
    (!/^[1-9]\d{0,9}$/.test(before) || Number(before) > 2_147_483_647)
  )
    throw new Error('Invalid history cursor')
  const page = await client.getHistory(chat, {
    limit: 30,
    ...(before ? { offset: { id: Number(before), date: 0 } } : {}),
  })
  // Use native IDs for history order; journal sequences describe arrival/edits instead.
  const eligible = Array.from(page).filter(
    message =>
      String(message.chat.id) === String(chat) &&
      (!before || message.id < Number(before)),
  )
  if (page.length && !eligible.length)
    throw new Error('Telegram history cursor did not advance')
  for (const message of [...eligible].reverse())
    journal.record(projectMessage(message), 'history')
  const messages = eligible
    .flatMap(message => {
      const saved = journal.message(String(chat), String(message.id))
      return saved ? [saved] : []
    })
    .sort((a, b) => a.sequence - b.sequence)
  // A short page may contain filtered Telegram service/deleted rows; only an empty page ends pagination.
  return {
    messages,
    nextBefore: eligible.length
      ? String(Math.min(...eligible.map(message => message.id)))
      : null,
  }
}

/** Discover another bounded conversation page; only the SDK retains peer access hashes. */
export async function loadDialogPage(
  client: Pick<TelegramClient, 'iterDialogs' | 'resolvePeer'>,
  journal: TelegramJournal,
  cursor?: BridgeDialogCursor,
): Promise<BridgeDialogPage> {
  if (
    cursor &&
    (!/^-?[1-9]\d*$/.test(cursor.peer) ||
      !Number.isSafeInteger(Number(cursor.peer)) ||
      !Number.isInteger(cursor.id) ||
      cursor.id <= 0 ||
      cursor.id > 2_147_483_647 ||
      !Number.isSafeInteger(cursor.date) ||
      cursor.date < 0)
  )
    throw new Error('Invalid conversation cursor')
  const offset = cursor
    ? {
        offsetPeer: await client.resolvePeer(Number(cursor.peer)),
        offsetId: cursor.id,
        offsetDate: cursor.date,
        pinned: 'exclude' as const,
      }
    : {}
  let count = 0
  let next: BridgeDialogCursor | null = null
  const identities: { chat: string; id: string }[] = []
  for await (const dialog of client.iterDialogs({
    ...offset,
    archived: 'keep',
    limit: 30,
    chunkSize: 30,
  })) {
    count++
    journal.readThrough(String(dialog.peer.id), dialog.lastReadOutgoing)
    journal.readIncomingThrough(String(dialog.peer.id), dialog.lastReadIngoing)
    if (dialog.lastMessage) {
      journal.record(projectMessage(dialog.lastMessage), 'history')
      identities.push({
        chat: String(dialog.peer.id),
        id: String(dialog.lastMessage.id),
      })
      next = {
        peer: String(dialog.peer.id),
        id: dialog.raw.topMessage,
        date: dialog.lastMessage.date.getTime(),
      }
    }
  }
  if (
    cursor &&
    next &&
    next.peer === cursor.peer &&
    next.id === cursor.id &&
    next.date === cursor.date
  )
    throw new Error('Telegram conversation cursor did not advance')
  const messages = identities
    .flatMap(({ chat, id }) => {
      const saved = journal.message(chat, id)
      return saved ? [saved] : []
    })
    .sort((a, b) => a.sequence - b.sequence)
  return { messages, next: count === 30 ? next : null }
}
