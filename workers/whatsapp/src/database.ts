/** Synchronous, account-scoped protocol storage for the Rust WASM backend.
 * Reads and construction of a write batch must occur in one JS turn, with no
 * await between them. Each batch is atomic; sync() is the durability barrier.
 */
export type Key = readonly [
  bucket: string,
  first: string,
  second: string,
  third: string,
]
export type Mutation =
  | { kind: 'put'; key: Key; value: Uint8Array; timestamp: number }
  | { kind: 'delete'; key: Key }
  | { kind: 'clear'; bucket: string; first: string | null }
  | { kind: 'expire'; bucket: string; before: number }

type BlobRow = { value: ArrayBuffer; size: number }
type ScanRow = BlobRow & {
  first: string
  second: string
  third: string
  timestamp: number
}

export class AccountDatabase {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly onMapping: (chat: string) => void = () => {},
  ) {
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS protocol (
            bucket TEXT NOT NULL, first TEXT NOT NULL, second TEXT NOT NULL,
            third TEXT NOT NULL, value BLOB NOT NULL, timestamp INTEGER NOT NULL,
            PRIMARY KEY (bucket, first, second, third)
        ) WITHOUT ROWID`)
    storage.sql.exec(
      'CREATE INDEX IF NOT EXISTS protocol_expiry ON protocol(bucket, timestamp)',
    )
  }

  /** Preserve revoked protocol data for recovery while starting a fresh pairing identity.
   * Message history and the immutable send journal live in separate tables.
   */
  archiveRevokedSession(): void {
    this.storage.transactionSync(() => {
      this.storage.sql.exec(
        'CREATE TABLE IF NOT EXISTS revoked_protocol (generation TEXT NOT NULL, bucket TEXT NOT NULL, first TEXT NOT NULL, second TEXT NOT NULL, third TEXT NOT NULL, value BLOB NOT NULL, timestamp INTEGER NOT NULL)',
      )
      this.storage.sql.exec(
        'INSERT INTO revoked_protocol SELECT ?, bucket, first, second, third, value, timestamp FROM protocol',
        crypto.randomUUID(),
      )
      this.storage.sql.exec('DELETE FROM protocol')
    })
  }

  /** Check length before selecting a potentially large blob into WASM memory. */
  read(key: Key, maxBytes: number): Uint8Array | null {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
      throw new Error('invalid read bound')
    const metadata = this.storage.sql
      .exec<{ size: number; type: string }>(
        'SELECT length(value) AS size, typeof(value) AS type FROM protocol WHERE bucket=? AND first=? AND second=? AND third=?',
        ...key,
      )
      .toArray()[0]
    if (!metadata) return null
    if (metadata.type !== 'blob' || metadata.size > maxBytes)
      throw new Error('protocol row exceeds bound or is not a blob')
    const row = this.storage.sql
      .exec<BlobRow>(
        'SELECT value FROM protocol WHERE bucket=? AND first=? AND second=? AND third=?',
        ...key,
      )
      .one()
    return new Uint8Array(row.value)
  }

  /** Bounded snapshot for domain operations that require scanning a collection. */
  scan(
    bucket: string,
    first: string | null | undefined,
    maxRows: number,
    maxBytes: number,
  ): ScanRow[] {
    if (
      !Number.isSafeInteger(maxRows) ||
      maxRows < 1 ||
      maxRows > 10_000 ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 0 ||
      maxBytes > 16 * 1024 * 1024
    )
      throw new Error('invalid scan bounds')
    const filter = first == null ? 'bucket=?' : 'bucket=? AND first=?'
    const bindings = first == null ? [bucket] : [bucket, first]
    const rows = this.storage.sql
      .exec<{ size: number; type: string }>(
        `SELECT length(value) AS size, typeof(value) AS type FROM protocol WHERE ${filter} LIMIT ?`,
        ...bindings,
        maxRows + 1,
      )
      .toArray()
    if (
      rows.length > maxRows ||
      rows.some(r => r.type !== 'blob') ||
      rows.reduce((n, r) => n + r.size, 0) > maxBytes
    )
      throw new Error('protocol scan exceeds bound')
    return this.storage.sql
      .exec<ScanRow>(
        `SELECT first, second, third, timestamp, value, length(value) AS size FROM protocol WHERE ${filter} ORDER BY first, second, third`,
        ...bindings,
      )
      .toArray()
  }

  /** Metadata-only discovery for the SDK's bounded group sender alias check. */
  pendingSenders(chat: string, id: string): string[] {
    const rows = this.storage.sql
      .exec<{ sender: string | null }>(
        "SELECT CASE WHEN length(CAST(second AS BLOB)) <= 128 THEN second ELSE NULL END AS sender FROM protocol WHERE bucket='pending' AND first=? AND third=? LIMIT 401",
        chat,
        id,
      )
      .toArray()
    if (rows.length > 400 || rows.some(r => r.sender === null))
      throw new Error('pending sender metadata exceeds bound')
    return rows.map(r => r.sender!)
  }

  /** Apply related updates together; throwing rolls every mutation back. */
  batch(operations: readonly Mutation[]): number {
    return this.storage.transactionSync(() => {
      let changed = 0
      for (const operation of operations) {
        switch (operation.kind) {
          case 'put': {
            const bytes = operation.value.slice().buffer
            changed += this.storage.sql.exec(
              'INSERT INTO protocol (bucket, first, second, third, value, timestamp) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(bucket, first, second, third) DO UPDATE SET value=excluded.value, timestamp=excluded.timestamp',
              ...operation.key,
              bytes,
              operation.timestamp,
            ).rowsWritten
            break
          }
          case 'delete':
            changed += this.storage.sql.exec(
              'DELETE FROM protocol WHERE bucket=? AND first=? AND second=? AND third=?',
              ...operation.key,
            ).rowsWritten
            break
          case 'clear':
            if (operation.first === null)
              changed += this.storage.sql.exec(
                'DELETE FROM protocol WHERE bucket=?',
                operation.bucket,
              ).rowsWritten
            else
              changed += this.storage.sql.exec(
                'DELETE FROM protocol WHERE bucket=? AND first=?',
                operation.bucket,
                operation.first,
              ).rowsWritten
            break
          case 'expire':
            changed += this.storage.sql.exec(
              'DELETE FROM protocol WHERE bucket=? AND timestamp<?',
              operation.bucket,
              operation.before,
            ).rowsWritten
            break
          default:
            throw new Error('unknown protocol mutation')
        }
      }
      // Alias projections join the same transaction as the verified protocol mapping.
      for (const operation of operations) {
        if (operation.kind === 'put' && operation.key[0] === 'lid')
          this.onMapping(`${operation.key[1]}@lid`)
      }
      return changed
    })
  }

  /** Resolve archive aliases only through the SDK's reciprocal PN/LID mapping.
   * @param chat Native non-device-qualified peer.
   * @returns The peer and, when verified by the protocol store, its alternate identity.
   */
  archiveAliases(chat: string): string[] {
    const match = /^(\d+)@(s\.whatsapp\.net|lid)$/.exec(chat)
    if (!match) return [chat]
    const decode = (bucket: string, id: string): unknown => {
      const bytes = this.read([bucket, id, '', ''], 2048)
      return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null
    }
    const lid = match[2] === 'lid' ? match[1] : decode('pn', match[1])
    if (typeof lid !== 'string' || !/^\d+$/.test(lid)) return [chat]
    const entry = decode('lid', lid) as { lid?: string; phone_number?: string } | null
    if (
      entry?.lid !== lid ||
      !entry.phone_number ||
      !/^\d+$/.test(entry.phone_number) ||
      decode('pn', entry.phone_number) !== lid
    )
      return [chat]
    if (match[2] !== 'lid' && entry.phone_number !== match[1]) return [chat]
    return [`${entry.phone_number}@s.whatsapp.net`, `${lid}@lid`]
  }

  /** Resolve only after Cloudflare confirms prior writes reached durable storage. */
  sync(): Promise<void> {
    return this.storage.sync()
  }
}
