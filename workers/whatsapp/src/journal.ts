import { ConversationJournal } from '@hype/messaging-bridge/conversations'
export interface MessageTarget {
  id: string
  sender: string
}
export interface TextRequest {
  requestId: string
  to: string
  text: string
  editTo?: MessageTarget
  replyTo?: MessageTarget
  reaction?: string
  attachmentId?: string
}
export interface MessageProjection {
  senderName: string | null
  content: {
    kind: string
    text: string | null
    mimeType: string | null
    fileName: string | null
    byteLength: number | null
    duration: number | null
    voiceNote: boolean
    viewOnce: boolean
    quoted: { id: string; sender: string; text: string | null; kind: string } | null
    reaction: {
      targetId: string
      targetSender: string | null
      targetFromMe: boolean
      emoji: string
    } | null
  }
}

/** Compare all delivery-affecting fields; omitted optional fields equal null. */
export function sameRequest(a: TextRequest, b: TextRequest): boolean {
  return (
    a.to === b.to &&
    a.text === b.text &&
    (a.editTo?.id ?? null) === (b.editTo?.id ?? null) &&
    (a.editTo?.sender ?? null) === (b.editTo?.sender ?? null) &&
    (a.replyTo?.id ?? null) === (b.replyTo?.id ?? null) &&
    (a.replyTo?.sender ?? null) === (b.replyTo?.sender ?? null) &&
    (a.reaction ?? null) === (b.reaction ?? null) &&
    (a.attachmentId ?? null) === (b.attachmentId ?? null)
  )
}
export interface Outbound {
  request: TextRequest
  messageId: string
  state: 'pending' | 'submitted' | 'uncertain'
}
interface InboxMessage {
  chat: string
  sender: string
  id: string
  timestamp: number
  fromMe: boolean
  text: string | null
  editedAt?: number
  deleted?: boolean
  readByMe?: boolean
  delivery?: 'delivered' | 'read'
  payload: string
}

/** Rust's durability hook awaits this journal before acknowledging messages. */
export class MessageJournal {
  readonly conversations: ConversationJournal
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly project: (payload: string) => MessageProjection,
    private readonly archiveAliases: (chat: string) => string[] = chat => [chat],
  ) {
    this.conversations = new ConversationJournal(storage)
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS incoming_receipts (chat TEXT NOT NULL,message_id TEXT NOT NULL,PRIMARY KEY(chat,message_id))',
    )
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS message_receipts (chat TEXT NOT NULL, message_id TEXT NOT NULL, rank INTEGER NOT NULL, PRIMARY KEY(chat,message_id))',
    )
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS inbox (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT,
            chat TEXT NOT NULL, sender TEXT NOT NULL, message_id TEXT NOT NULL,
            data TEXT NOT NULL, UNIQUE(chat, sender, message_id)
        )`)
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS outbox (
            request_id TEXT PRIMARY KEY, state TEXT NOT NULL, data TEXT NOT NULL
        )`)
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL)',
    )
    storage.sql.exec(
      "UPDATE outbox SET state='uncertain', data=json_set(data, '$.state', 'uncertain') WHERE state='pending'",
    )
  }

  /** Persist a native app-state callback before the SDK checkpoints its sync version.
   * @param json Canonical peer aliases and the observed native archive flag.
   * @returns Nothing; failures propagate through the host callback.
   */
  archiveUpdate(json: string): void {
    const value = JSON.parse(json) as { chats: string[]; isArchived: boolean }
    if (
      !Array.isArray(value.chats) ||
      value.chats.length > 3 ||
      typeof value.isArchived !== 'boolean'
    )
      throw new Error('Invalid archive update')
    this.storage.transactionSync(() => {
      for (const chat of new Set(
        value.chats.flatMap(chat => this.archiveAliases(chat)),
      ))
        this.conversations.record(chat, value.isArchived)
    })
  }

  /** Project a previously observed native state when its verified alias arrives later.
   * @param chat Peer whose protocol identity mapping was just committed.
   * @returns Nothing; the caller's transaction makes the mapping and projection atomic.
   */
  linkArchiveAliases(chat: string): void {
    const aliases = this.archiveAliases(chat)
    const latest = aliases
      .map(alias => this.conversations.get(alias))
      .filter(state => state !== undefined)
      .sort((a, b) => b.sequence - a.sequence)[0]
    if (latest)
      for (const alias of aliases) this.conversations.record(alias, latest.isArchived)
  }

  /** Advance replay after a successful read acknowledgement or deletion. */
  async updateMessage(
    chat: string,
    target: MessageTarget,
    patch: { readByMe?: boolean; deleted?: boolean },
  ): Promise<void> {
    const row = this.storage.sql
      .exec<{ data: string }>(
        'SELECT data FROM inbox WHERE chat=? AND sender=? AND message_id=?',
        chat,
        target.sender,
        target.id,
      )
      .toArray()[0]
    if (!row) throw new Error('Message not found')
    const data = { ...JSON.parse(row.data), ...patch }
    this.storage.transactionSync(() => {
      this.storage.sql.exec(
        'DELETE FROM inbox WHERE chat=? AND sender=? AND message_id=?',
        chat,
        target.sender,
        target.id,
      )
      this.storage.sql.exec(
        'INSERT INTO inbox(chat,sender,message_id,data) VALUES (?,?,?,?)',
        chat,
        target.sender,
        target.id,
        JSON.stringify(data),
      )
    })
    await this.storage.sync()
  }

  /** Private, account-local encrypted CDN metadata; never returned by RPC. */
  async stage(id: string, data: string): Promise<void> {
    this.storage.sql.exec('DELETE FROM attachments WHERE expires<?', Date.now())
    this.storage.sql.exec(
      'INSERT INTO attachments (id, data, expires) VALUES (?, ?, ?)',
      id,
      data,
      Date.now() + 24 * 60 * 60 * 1000,
    )
    await this.storage.sync()
  }

  async attachment(id: string): Promise<string | null> {
    return (
      this.storage.sql
        .exec<{ data: string }>(
          'SELECT data FROM attachments WHERE id=? AND expires>?',
          id,
          Date.now(),
        )
        .toArray()[0]?.data ?? null
    )
  }

  async receive(json: string): Promise<void> {
    const messages: InboxMessage[] = JSON.parse(json)
    this.storage.transactionSync(() => {
      for (const message of messages) {
        if (
          !message.fromMe &&
          this.storage.sql
            .exec(
              'SELECT 1 FROM incoming_receipts WHERE chat=? AND message_id=?',
              message.chat,
              message.id,
            )
            .toArray().length
        )
          message.readByMe = true
        if (message.fromMe) {
          const rank = this.storage.sql
            .exec<{ rank: number }>(
              'SELECT rank FROM message_receipts WHERE chat=? AND message_id=?',
              message.chat,
              message.id,
            )
            .toArray()[0]?.rank
          if (rank) message.delivery = rank >= 2 ? 'read' : 'delivered'
        }
        this.storage.sql.exec(
          'INSERT INTO inbox (chat, sender, message_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(chat, sender, message_id) DO NOTHING',
          message.chat,
          message.sender,
          message.id,
          JSON.stringify(message),
        )
      }
    })
    await this.storage.sync()
  }

  /** Apply recipient receipts monotonically, retaining early receipts until the local echo arrives. */
  receipt(json: string): void {
    const input: {
      chats: string[]
      ids: string[]
      state: 'delivered' | 'read' | 'readByMe'
    } = JSON.parse(json)
    if (
      !['delivered', 'read', 'readByMe'].includes(input.state) ||
      input.chats.length > 4 ||
      input.ids.length > 1000
    )
      throw new Error('Invalid receipt')
    const rank = input.state === 'read' ? 2 : 1
    this.storage.transactionSync(() => {
      for (const chat of input.chats)
        for (const id of input.ids) {
          if (input.state === 'readByMe')
            this.storage.sql.exec(
              'INSERT OR IGNORE INTO incoming_receipts VALUES (?,?)',
              chat,
              id,
            )
          else
            this.storage.sql.exec(
              'INSERT INTO message_receipts VALUES (?,?,?) ON CONFLICT(chat,message_id) DO UPDATE SET rank=max(rank,excluded.rank)',
              chat,
              id,
              rank,
            )
          const rows = this.storage.sql
            .exec<{ data: string }>(
              'SELECT data FROM inbox WHERE chat=? AND message_id=?',
              chat,
              id,
            )
            .toArray()
          for (const row of rows) {
            const message: InboxMessage = JSON.parse(row.data)
            if (input.state === 'readByMe') {
              if (message.fromMe || message.readByMe) continue
              message.readByMe = true
            } else {
              if (
                !message.fromMe ||
                message.delivery === 'read' ||
                message.delivery === input.state
              )
                continue
              message.delivery = input.state
            }
            this.storage.sql.exec(
              'DELETE FROM inbox WHERE chat=? AND sender=? AND message_id=?',
              chat,
              message.sender,
              id,
            )
            this.storage.sql.exec(
              'INSERT INTO inbox(chat,sender,message_id,data) VALUES (?,?,?,?)',
              chat,
              message.sender,
              id,
              JSON.stringify(message),
            )
          }
        }
    })
  }

  async claim(json: string): Promise<string> {
    const outbound: Outbound = JSON.parse(json)
    const claimed = this.storage.transactionSync(() => {
      const previous = this.result(outbound.request.requestId)
      if (previous) {
        if (!sameRequest(previous.request, outbound.request))
          throw new Error('requestId already belongs to a different message')
        return { fresh: false, outbound: previous }
      }
      this.storage.sql.exec(
        "INSERT INTO outbox (request_id, state, data) VALUES (?, 'pending', ?)",
        outbound.request.requestId,
        json,
      )
      return { fresh: true, outbound }
    })
    await this.storage.sync()
    return JSON.stringify(claimed)
  }

  async finish(json: string): Promise<void> {
    const outbound: Outbound = JSON.parse(json)
    if (outbound.state !== 'submitted' && outbound.state !== 'uncertain')
      throw new Error('invalid terminal send state')
    const changed = this.storage.sql
      .exec(
        "UPDATE outbox SET state=?, data=? WHERE request_id=? AND state='pending' RETURNING request_id",
        outbound.state,
        json,
        outbound.request.requestId,
      )
      .toArray()
    if (changed.length !== 1)
      throw new Error('send claim was lost or already completed')
    await this.storage.sync()
  }

  /** Private host lookup scoped to the exact conversation and sender. */
  async lookup(chat: string, sender: string, id: string): Promise<string> {
    const row = this.storage.sql
      .exec<{ data: string }>(
        'SELECT data FROM inbox WHERE chat=? AND sender=? AND message_id=?',
        chat,
        sender,
        id,
      )
      .toArray()[0]
    return row?.data ?? 'null'
  }

  /** Update the original text and advance replay without changing its identity or creation time. */
  async editText(chat: string, target: MessageTarget, text: string): Promise<void> {
    this.storage.transactionSync(() => {
      const row = this.storage.sql
        .exec<{ data: string }>(
          'SELECT data FROM inbox WHERE chat=? AND sender=? AND message_id=?',
          chat,
          target.sender,
          target.id,
        )
        .toArray()[0]
      if (!row) throw new Error('Edit target is unavailable')
      const message: InboxMessage = JSON.parse(row.data)
      const payload = JSON.parse(message.payload)
      if (payload.message.extended_text_message)
        payload.message.extended_text_message.text = text
      else payload.message.conversation = text
      message.text = text
      message.editedAt = Date.now()
      message.payload = JSON.stringify(payload)
      this.storage.sql.exec(
        'DELETE FROM inbox WHERE chat=? AND sender=? AND message_id=?',
        chat,
        target.sender,
        target.id,
      )
      this.storage.sql.exec(
        'INSERT INTO inbox (chat,sender,message_id,data) VALUES (?,?,?,?)',
        chat,
        target.sender,
        target.id,
        JSON.stringify(message),
      )
    })
    await this.storage.sync()
  }

  /** Latest available push name across verified PN/LID aliases, without guessing identities. */
  senderName(aliases: string[]): string | null {
    if (!aliases.length || aliases.length > 8) return null
    const rows = this.storage.sql
      .exec<{ data: string }>(
        `SELECT data FROM inbox WHERE sender IN (${aliases.map(() => '?').join(',')}) ORDER BY sequence DESC LIMIT 20`,
        ...aliases,
      )
      .toArray()
    for (const row of rows) {
      const message: InboxMessage = JSON.parse(row.data)
      const name = this.project(message.payload).senderName
      if (name) return name
    }
    return null
  }

  result(requestId: string): Outbound | null {
    const row = this.storage.sql
      .exec<{ data: string }>('SELECT data FROM outbox WHERE request_id=?', requestId)
      .toArray()[0]
    return row ? JSON.parse(row.data) : null
  }

  outbox(limit: number): Outbound[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new Error('invalid outbox limit')
    return this.storage.sql
      .exec<{ data: string }>(
        'SELECT data FROM outbox ORDER BY rowid DESC LIMIT ?',
        limit,
      )
      .toArray()
      .map(row => JSON.parse(row.data))
  }

  inbox(
    after: number,
    limit: number,
  ): (Omit<InboxMessage, 'payload'> & MessageProjection & { sequence: number })[] {
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 500
    )
      throw new Error('invalid inbox cursor or limit')
    return this.storage.sql
      .exec<{ sequence: number; data: string }>(
        'SELECT sequence, data FROM inbox WHERE sequence>? ORDER BY sequence LIMIT ?',
        after,
        limit,
      )
      .toArray()
      .map(row => {
        const { payload, ...message } = JSON.parse(row.data) as InboxMessage
        return { ...message, ...this.project(payload), sequence: row.sequence }
      })
  }
}
