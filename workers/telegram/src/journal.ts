import type {
  BridgeAttachment,
  BridgeMessage,
  BridgeUpload,
  SendRequest,
  SendResult,
} from '@hype/messaging-bridge/types'

/** Journal replay feeds D1; the latest version of a message retains its native identity. */
export class TelegramJournal {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(`
            CREATE TABLE IF NOT EXISTS bridge_read_incoming (chat TEXT PRIMARY KEY, max_id INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS bridge_read (chat TEXT PRIMARY KEY, max_id INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS bridge_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, chat TEXT NOT NULL, message_id TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS bridge_events_message ON bridge_events(chat, message_id, sequence DESC);
            CREATE TABLE IF NOT EXISTS bridge_deleted (scope TEXT NOT NULL, message_id TEXT NOT NULL, PRIMARY KEY(scope, message_id));
            CREATE TABLE IF NOT EXISTS bridge_outbox (request_id TEXT PRIMARY KEY, request TEXT NOT NULL, random_id TEXT NOT NULL, message_id TEXT NOT NULL DEFAULT '', state TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS bridge_uploads (id TEXT PRIMARY KEY, metadata TEXT NOT NULL, bytes BLOB NOT NULL, expires INTEGER NOT NULL);
        `)
  }

  /** Insert only changed projections, including edits and reaction changes. */
  record(
    input: Omit<BridgeMessage, 'sequence'>,
    source: 'live' | 'history' = 'live',
  ): void {
    if (
      !input.deleted &&
      this.storage.sql
        .exec(
          'SELECT 1 FROM bridge_deleted WHERE message_id=? AND (scope=? OR scope=?) LIMIT 1',
          input.id,
          input.chat,
          Number(input.chat) > -1_000_000_000_000 ? 'global' : input.chat,
        )
        .toArray().length
    )
      return
    if (input.fromMe) {
      const read =
        this.storage.sql
          .exec<{ max_id: number }>(
            'SELECT max_id FROM bridge_read WHERE chat=?',
            input.chat,
          )
          .toArray()[0]?.max_id ?? 0
      input = { ...input, delivery: Number(input.id) <= read ? 'read' : 'sent' }
    }
    if (!input.fromMe) {
      const read =
        this.storage.sql
          .exec<{ max_id: number }>(
            'SELECT max_id FROM bridge_read_incoming WHERE chat=?',
            input.chat,
          )
          .toArray()[0]?.max_id ?? 0
      input = { ...input, readByMe: Number(input.id) <= read }
    }
    const payload = JSON.stringify(input)
    const previous = this.storage.sql
      .exec<{ payload: string }>(
        'SELECT payload FROM bridge_events WHERE chat=? AND message_id=? ORDER BY sequence DESC LIMIT 1',
        input.chat,
        input.id,
      )
      .toArray()[0]
    if (previous?.payload === payload) return
    if (previous) {
      const saved: Omit<BridgeMessage, 'sequence'> = JSON.parse(previous.payload)
      if (saved.deleted && !input.deleted) return
      if (
        !input.deleted &&
        ((saved.editedAt ?? 0) > (input.editedAt ?? 0) ||
          (source === 'history' && (saved.editedAt ?? 0) >= (input.editedAt ?? 0)))
      )
        return
    }
    this.storage.sql.exec(
      'INSERT INTO bridge_events(chat, message_id, payload) VALUES (?, ?, ?)',
      input.chat,
      input.id,
      payload,
    )
  }

  /** Persist an outgoing-read watermark, including receipts arriving before history. */
  readThrough(chat: string, maxId: number): void {
    if (!Number.isSafeInteger(maxId) || maxId <= 0) return
    this.storage.transactionSync(() => {
      const previous =
        this.storage.sql
          .exec<{ max_id: number }>('SELECT max_id FROM bridge_read WHERE chat=?', chat)
          .toArray()[0]?.max_id ?? 0
      if (maxId <= previous) return
      this.storage.sql.exec(
        'INSERT INTO bridge_read(chat,max_id) VALUES (?,?) ON CONFLICT(chat) DO UPDATE SET max_id=max(max_id,excluded.max_id)',
        chat,
        maxId,
      )
      const rows = this.storage.sql
        .exec<{ message_id: string }>(
          'SELECT DISTINCT message_id FROM bridge_events WHERE chat=? AND CAST(message_id AS INTEGER)<=?',
          chat,
          maxId,
        )
        .toArray()
      for (const row of rows) {
        const saved = this.message(chat, row.message_id)
        if (!saved?.fromMe || saved.delivery === 'read') continue
        const { sequence: _sequence, ...message } = saved
        this.record({ ...message, delivery: 'read' })
      }
    })
  }

  /** Mirror reads from HYPE or another Telegram client, including earlier-than-history updates. */
  readIncomingThrough(chat: string, maxId: number): void {
    if (!Number.isSafeInteger(maxId) || maxId <= 0) return
    this.storage.transactionSync(() => {
      const previous =
        this.storage.sql
          .exec<{ max_id: number }>(
            'SELECT max_id FROM bridge_read_incoming WHERE chat=?',
            chat,
          )
          .toArray()[0]?.max_id ?? 0
      if (maxId <= previous) return
      this.storage.sql.exec(
        'INSERT INTO bridge_read_incoming(chat,max_id) VALUES (?,?) ON CONFLICT(chat) DO UPDATE SET max_id=max(max_id,excluded.max_id)',
        chat,
        maxId,
      )
      const rows = this.storage.sql
        .exec<{ message_id: string }>(
          'SELECT DISTINCT message_id FROM bridge_events WHERE chat=? AND CAST(message_id AS INTEGER)<=?',
          chat,
          maxId,
        )
        .toArray()
      for (const row of rows) {
        const saved = this.message(chat, row.message_id)
        if (!saved || saved.fromMe || saved.readByMe) continue
        const { sequence: _sequence, ...message } = saved
        this.record({ ...message, readByMe: true })
      }
    })
  }

  /** Keep tombstones for unknown messages too, so later history cannot resurrect them. */
  deleteMessages(ids: number[], channel: string | null): void {
    for (const id of ids) {
      this.storage.sql.exec(
        'INSERT OR IGNORE INTO bridge_deleted(scope, message_id) VALUES (?, ?)',
        channel ?? 'global',
        String(id),
      )
      const rows = this.storage.sql
        .exec<{ chat: string }>(
          'SELECT DISTINCT chat FROM bridge_events WHERE message_id=?',
          String(id),
        )
        .toArray()
      for (const { chat } of rows) {
        if (channel !== null ? chat !== channel : Number(chat) <= -1_000_000_000_000)
          continue
        const saved = this.message(chat, String(id))
        if (!saved || saved.deleted) continue
        const { sequence: _sequence, ...previous } = saved
        this.record({
          ...previous,
          deleted: true,
          text: null,
          content: undefined,
          reactions: [],
        })
      }
    }
  }

  /** Apply reaction-only updates without another provider fetch or update-checkpoint gap. */
  reactions(
    chat: string,
    id: string,
    reactions: NonNullable<BridgeMessage['reactions']>,
  ): void {
    const saved = this.message(chat, id)
    if (!saved || saved.deleted) return
    const { sequence: _sequence, ...previous } = saved
    this.record({ ...previous, reactions })
  }

  messages(after: number, limit = 100): BridgeMessage[] {
    if (!Number.isSafeInteger(after) || after < 0)
      throw new Error('Invalid inbox cursor')
    return this.storage.sql
      .exec<{ sequence: number; payload: string }>(
        'SELECT sequence, payload FROM bridge_events WHERE sequence>? ORDER BY sequence LIMIT ?',
        after,
        Math.min(100, Math.max(1, limit)),
      )
      .toArray()
      .map(row => ({ ...JSON.parse(row.payload), sequence: row.sequence }))
  }

  message(chat: string, id: string): BridgeMessage | null {
    const row = this.storage.sql
      .exec<{ sequence: number; payload: string }>(
        'SELECT sequence, payload FROM bridge_events WHERE chat=? AND message_id=? ORDER BY sequence DESC LIMIT 1',
        chat,
        id,
      )
      .toArray()[0]
    return row ? { ...JSON.parse(row.payload), sequence: row.sequence } : null
  }

  result(id: string): SendResult | null {
    const row = this.storage.sql
      .exec<{ request: string; message_id: string; state: SendResult['state'] }>(
        'SELECT request, message_id, state FROM bridge_outbox WHERE request_id=?',
        id,
      )
      .toArray()[0]
    return row
      ? {
          request: JSON.parse(row.request),
          messageId: row.message_id,
          state: row.state,
        }
      : null
  }

  /** Commit intent before network I/O; a restart never blindly replays a send. */
  async begin(request: SendRequest, randomId: string): Promise<void> {
    this.storage.sql.exec(
      'INSERT INTO bridge_outbox(request_id, request, random_id, state) VALUES (?, ?, ?, ?)',
      request.requestId,
      JSON.stringify(request),
      randomId,
      'pending',
    )
    await this.storage.sync()
  }

  async finish(
    id: string,
    messageId: string,
    state: SendResult['state'],
  ): Promise<SendResult> {
    this.storage.sql.exec(
      'UPDATE bridge_outbox SET message_id=?, state=? WHERE request_id=?',
      messageId,
      state,
      id,
    )
    await this.storage.sync()
    return this.result(id)!
  }

  /** Interrupted operations remain visible and require reconciliation, never an automatic resend. */
  recover(): void {
    this.storage.sql.exec(
      "UPDATE bridge_outbox SET state='uncertain' WHERE state='pending'",
    )
  }

  outbox(): SendResult[] {
    return this.storage.sql
      .exec<{ request_id: string }>(
        'SELECT request_id FROM bridge_outbox ORDER BY rowid DESC LIMIT 50',
      )
      .toArray()
      .map(row => this.result(row.request_id)!)
  }

  async stage(
    input: BridgeUpload,
    content: BridgeAttachment['content'],
    bytes: ArrayBuffer,
  ): Promise<BridgeAttachment> {
    this.storage.sql.exec('DELETE FROM bridge_uploads WHERE expires<?', Date.now())
    const total = this.storage.sql
      .exec<{ size: number }>(
        'SELECT coalesce(sum(length(bytes)), 0) AS size FROM bridge_uploads',
      )
      .one().size
    if (total + bytes.byteLength > 32 * 1024 * 1024)
      throw new Error('Too many pending attachments')
    const id = crypto.randomUUID()
    this.storage.sql.exec(
      'INSERT INTO bridge_uploads VALUES (?, ?, ?, ?)',
      id,
      JSON.stringify(input),
      bytes,
      Date.now() + 86_400_000,
    )
    await this.storage.sync()
    return { id, content }
  }

  attachment(id: string): { input: BridgeUpload; bytes: Uint8Array } {
    const row = this.storage.sql
      .exec<{ metadata: string; bytes: ArrayBuffer }>(
        'SELECT metadata, bytes FROM bridge_uploads WHERE id=? AND expires>?',
        id,
        Date.now(),
      )
      .toArray()[0]
    if (!row) throw new Error('Attachment expired or belongs to another account')
    return { input: JSON.parse(row.metadata), bytes: new Uint8Array(row.bytes) }
  }
}
