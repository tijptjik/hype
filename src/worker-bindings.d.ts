// Keep Worker database globals needed by Drizzle separate from browser DOM globals.
import type * as Workers from '@cloudflare/workers-types'

declare global {
  interface D1Database extends Workers.D1Database {}
  interface D1PreparedStatement extends Workers.D1PreparedStatement {}
  type D1Result<T = unknown> = Workers.D1Result<T>
  type D1Response = Workers.D1Response
}
