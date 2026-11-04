import {
  BaseSqliteStorage,
  BaseSqliteStorageDriver,
  type ISqliteDatabase,
} from '@mtcute/core'

/** Convert SDK values to the Workers SQLite binding types without lossy coercion. */
function binding(value: unknown): string | number | null | ArrayBuffer {
  if (value === null || typeof value === 'string' || typeof value === 'number')
    return value
  if (value instanceof Uint8Array) return Uint8Array.from(value).buffer
  if (value instanceof ArrayBuffer) return value
  throw new Error('Unsupported Telegram storage binding')
}

/** SDK repositories expect byte arrays for BLOB columns, not Workers ArrayBuffers. */
function row(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [
      key,
      field instanceof ArrayBuffer ? new Uint8Array(field) : field,
    ]),
  )
}

/** Durable, synchronous adapter for mtcute's SQLite repositories. */
export class TelegramStorageDriver extends BaseSqliteStorageDriver {
  constructor(private readonly storage: DurableObjectStorage) {
    super()
  }

  _createDatabase(): ISqliteDatabase {
    const storage = this.storage
    return {
      transaction: fn =>
        ((...args: Parameters<typeof fn>) =>
          storage.transactionSync(() => fn(...args))) as typeof fn,
      prepare: sql => ({
        run: (...params) => {
          storage.sql.exec(sql, ...params.map(binding))
        },
        get: (...params) => {
          const value = storage.sql.exec(sql, ...params.map(binding)).toArray()[0]
          return value ? row(value) : undefined
        },
        all: (...params) =>
          storage.sql
            .exec(sql, ...params.map(binding))
            .toArray()
            .map(row),
      }),
      exec: sql => {
        storage.sql.exec(sql)
      },
      close: () => {
        /* The Durable Object owns SQLite lifetime. */
      },
    }
  }

  /** Persist SDK deferred writes immediately; eviction has no shutdown hook. */
  override _writeLater(
    statement: Parameters<BaseSqliteStorageDriver['_writeLater']>[0],
    params: unknown[],
  ): void {
    statement.run(...params)
  }

  /** Confirm protocol writes before acknowledging application-level operations. */
  async flush(): Promise<void> {
    this._save()
    await this.storage.sync()
  }
}

/** Construct account-local repositories; credentials never leave the object. */
export function createTelegramStorage(
  storage: DurableObjectStorage,
): BaseSqliteStorage {
  return new BaseSqliteStorage(new TelegramStorageDriver(storage))
}
