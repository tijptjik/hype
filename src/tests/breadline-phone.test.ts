// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
// TESTS
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// AUTH
import {
  completeBreadlinePhone,
  handleBreadlinePhone,
} from '#lib/auth/breadline-phone.server.js'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'
import type { RequestEvent } from '@sveltejs/kit'

let sqlite: DatabaseSync
let db: D1Database
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE user (id TEXT PRIMARY KEY, telephone TEXT UNIQUE,
    isAnonymous INTEGER NOT NULL DEFAULT 0, isArchived INTEGER NOT NULL DEFAULT 0, updatedAt INTEGER);
    INSERT INTO user (id,telephone) VALUES ('missing',NULL),('invalid','+852983261'),('owner','+85291234567');`)
  const prepare = (sql: string, params: unknown[] = []) => ({
    bind: (...values: unknown[]) => prepare(sql, values),
    first: async () => sqlite.prepare(sql).get(...(params as never[])) ?? null,
    run: async () => ({
      meta: { changes: sqlite.prepare(sql).run(...(params as never[])).changes },
    }),
  })
  db = { prepare } as unknown as D1Database
})
afterEach(() => sqlite.close())

/**
 * Build a request for the real gate with an authoritative SQLite-backed D1 binding.
 * @param path Application path including any search parameters.
 * @param options Session, hub and request variants.
 * @returns The gate promise and continuation spy.
 */
function gate(
  path = '/',
  options: {
    id?: string
    hub?: string
    guest?: boolean
    signedOut?: boolean
    method?: string
    accept?: string
    data?: boolean
    cachedPhone?: string
  } = {},
) {
  const url = new URL(path, 'https://breadline.example')
  const event = {
    url,
    isDataRequest: options.data ?? false,
    request: new Request(url, {
      method: options.method ?? 'GET',
      headers: { accept: options.accept ?? 'text/html' },
    }),
    locals: {
      platform: { env: { DB: db } },
      hub: { code: options.hub ?? 'breadline' },
      session: options.signedOut ? undefined : { id: 'session' },
      user: options.signedOut
        ? undefined
        : {
            id: options.id ?? 'missing',
            isAnonymous: options.guest ?? false,
            telephone: options.cachedPhone,
          },
    },
  } as unknown as RequestEvent
  const resolve = vi.fn(async () => new Response('application'))
  return { result: handleBreadlinePhone({ event, resolve }), resolve }
}

describe('Breadline phone completion access', () => {
  it('redirects HTML and SvelteKit data loads using persisted state rather than cached phone', async () => {
    for (const options of [
      {},
      { id: 'invalid' },
      { cachedPhone: '+85291234567' },
      { data: true, accept: 'application/json' },
    ]) {
      const { result, resolve } = gate('/plan?date=2026-10-19', options)
      await expect(result).rejects.toMatchObject({
        status: 303,
        location: '/account/phone?returnTo=%2Fplan%3Fdate%3D2026-10-19',
      })
      expect(resolve).not.toHaveBeenCalled()
    }
  })
  it('blocks direct API reads and writes and remote calls before application code executes', async () => {
    for (const [path, method] of [
      ['/api/private', 'GET'],
      ['/api/private', 'POST'],
      ['/_app/remote/command', 'POST'],
    ] as const) {
      const { result, resolve } = gate(path, { method, accept: 'application/json' })
      const response = await result
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'BREADLINE_PHONE_REQUIRED' })
      expect(resolve).not.toHaveBeenCalled()
    }
  })
  it('allows completion, auth, legal pages, guests, other hubs and users with a persisted valid phone', async () => {
    for (const [path, options] of [
      ['/account/phone', {}],
      ['/api/auth/sign-out', { method: 'POST' }],
      ['/policy/privacy', {}],
      ['/_app/immutable/app.js', {}],
      ['/', { guest: true }],
      ['/', { signedOut: true }],
      ['/', { hub: 'core' }],
      ['/', { id: 'owner' }],
    ] as const) {
      const { result, resolve } = gate(path, options)
      expect((await result).status).toBe(200)
      expect(resolve).toHaveBeenCalledOnce()
    }
  })
  it('rejects short/long HK phones and normalizes whitespace before unlocking access', async () => {
    for (const phone of ['+852983261', '+8529070331', '+852905 822 381', 'not a phone'])
      expect(await completeBreadlinePhone(db, 'missing', phone)).toBe('invalid')
    expect(await completeBreadlinePhone(db, 'missing', ' \t+852 9876 5432 \n')).toBe(
      'saved',
    )
    expect(
      sqlite.prepare("SELECT telephone FROM user WHERE id='missing'").get(),
    ).toMatchObject({ telephone: '+85298765432' })
    expect((await gate('/', { id: 'missing' }).result).status).toBe(200)
  })
  it('never transfers history or a phone from another account and denies unavailable accounts', async () => {
    expect(await completeBreadlinePhone(db, 'missing', '+852 9123 4567')).toBe('in-use')
    expect(
      sqlite.prepare("SELECT telephone FROM user WHERE id='missing'").get(),
    ).toMatchObject({ telephone: null })
    sqlite.exec("UPDATE user SET isArchived=1 WHERE id='invalid'")
    expect(await completeBreadlinePhone(db, 'invalid', '+85298765432')).toBe(
      'unavailable',
    )
    expect(await completeBreadlinePhone(db, 'absent', '+85298765432')).toBe(
      'unavailable',
    )
  })
})
