import { z } from 'zod'
import { redirect } from '@sveltejs/kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetRequestEvent,
  mockQuery,
  mockForm,
  mockCommand,
  mockSetupRequestHandler,
  mockRequested,
} = vi.hoisted(() => ({
  mockGetRequestEvent: vi.fn(),
  mockQuery: Object.assign(
    vi.fn((...args: unknown[]) => {
      const handler = args.length === 1 ? args[0] : args[1]
      // Lazily registered remote families must carry SvelteKit's runtime metadata.
      return Object.assign(handler as (...args: unknown[]) => unknown, {
        __: { type: 'query', id: '', name: '' },
      })
    }),
    {
      batch: vi.fn((_schema: unknown, handler: unknown) =>
        Object.assign(handler as (...args: unknown[]) => unknown, {
          __: { type: 'query_batch', id: '', name: '' },
        }),
      ),
    },
  ),
  mockForm: vi.fn((...args: unknown[]) => {
    const handler = args.length === 1 ? args[0] : args[1]
    return handler
  }),
  mockCommand: vi.fn((...args: unknown[]) => {
    const handler = args.length === 1 ? args[0] : args[1]
    return handler
  }),
  mockSetupRequestHandler: vi.fn(),
  mockRequested: vi.fn(() => ({ refreshAll: async () => {} })),
}))

vi.mock('$app/server', () => ({
  requested: mockRequested,
  getRequestEvent: mockGetRequestEvent,
  query: mockQuery,
  form: mockForm,
  command: mockCommand,
}))

vi.mock('#lib/api/index.js', () => ({
  setupRequestHandler: mockSetupRequestHandler,
}))

import {
  guardedBatchQuery,
  guardedCommand,
  guardedForm,
  guardedQuery,
} from '#lib/api/server/guarded.js'

describe('remote guard wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetRequestEvent.mockReturnValue({
      locals: { platform: { env: {} }, user: { id: 'u-1' } },

      request: { method: 'POST' },
    })

    mockSetupRequestHandler.mockResolvedValue({
      db: { tag: 'db' },
      session: { id: 's-1' },
      user: { id: 'u-1', isAnonymous: false },
      userId: 'u-1',
      userRoles: [{ type: 'organisation', organisationId: 'org-1', role: 'owner' }],
      isAdminRequest: true,
      request: { method: 'POST' },
    })
  })

  it('guardedQuery(schema, fn) resolves guarded context and forwards output', async () => {
    const handler = guardedQuery(z.object({}).passthrough(), async (output, ctx) => {
      expect(output).toEqual({ ref: 'org-1' })
      expect(ctx.user.id).toBe('u-1')
      expect(Array.isArray(ctx.userRoles)).toBe(true)
      expect(ctx.db).toBeTruthy()
      expect(ctx.event.locals).toMatchObject({ user: { id: 'u-1' } })
      return { ok: true }
    })

    const result = await (handler as (input: unknown) => Promise<unknown>)({
      ref: 'org-1',
    })

    expect(result).toEqual({ ok: true })
    expect(mockSetupRequestHandler).toHaveBeenCalledTimes(1)
    expect(mockSetupRequestHandler).toHaveBeenCalledWith({
      platform: { env: {} },
      locals: { platform: { env: {} }, user: { id: 'u-1' } },

      request: { method: 'POST' },
    })
  })

  it('guardedQuery(schema, fn) promotes admin scope from meta envelope', async () => {
    mockSetupRequestHandler.mockResolvedValue({
      db: { tag: 'db' },
      session: { id: 's-1' },
      user: { id: 'u-1', isAnonymous: false },
      userId: 'u-1',
      userRoles: [],
      isAdminRequest: false,
      request: { method: 'POST' },
    })

    const handler = guardedQuery(z.object({}).passthrough(), async (_output, ctx) => {
      expect(ctx.isAdminRequest).toBe(true)
      return { ok: true }
    })

    const result = await (handler as (input: unknown) => Promise<unknown>)({
      ref: 'org-1',
      meta: { isAdminRequest: true },
    })

    expect(result).toEqual({ ok: true })
  })

  it.each([
    [true, true],
    ['true', true],
    [false, false],
    ['false', false],
    ['on', false],
    ['1', false],
    ['', false],
    [undefined, false],
  ])('normalizes unchecked form admin intent %s to %s', async (flag, expected) => {
    const handler = guardedForm('unchecked', async (_input, ctx) => {
      expect(ctx.isAdminRequest).toBe(expected)
      return { ok: true }
    })
    await (handler as unknown as (input: unknown, issue: unknown) => Promise<unknown>)(
      { meta: { isAdminRequest: flag } },
      {},
    )
  })

  it('guardedBatchQuery settles row promises before returning its resolver', async () => {
    const handler = guardedBatchQuery(
      z.object({ id: z.string() }),
      async (_outputs, ctx) => {
        expect(ctx.user.id).toBe('u-1')
        return async output => {
          await Promise.resolve()
          if (output.id === 'bad') throw new Error('ROW_FAILED')
          return { id: output.id }
        }
      },
    )

    const resolver = await (
      handler as unknown as (
        inputs: unknown[],
      ) => Promise<(input: { id: string }, index: number) => unknown>
    )([{ id: 'good' }, { id: 'bad' }])

    expect(resolver({ id: 'good' }, 0)).toEqual({ id: 'good' })
    expect(resolver({ id: 'good' }, 0)).not.toBeInstanceOf(Promise)
    expect(() => resolver({ id: 'bad' }, 1)).toThrow('ROW_FAILED')
  })

  it('guardedForm(schema, fn) forwards invalid helper and context', async () => {
    const handler = guardedForm(
      z.object({ data: z.object({ code: z.string() }) }),
      async (output, ctx) => {
        expect(output).toEqual({ data: { code: 'abc' } })
        expect(typeof ctx.invalid).toBe('function')
        expect(ctx.user.id).toBe('u-1')
        return { ok: true }
      },
    )

    const result = await (
      handler as unknown as (input: unknown, invalid: unknown) => Promise<unknown>
    )({ data: { code: 'abc' } }, () => ({ status: 400 }))

    expect(result).toEqual({ ok: true })
  })

  it('guardedForm("unchecked", fn) works with unchecked input', async () => {
    const handler = guardedForm('unchecked', async (input: unknown, ctx) => {
      expect((input as { freeform?: string }).freeform).toBe('x')
      expect(ctx.user.id).toBe('u-1')
      return { ok: true }
    })

    const result = await (
      handler as unknown as (input: unknown, invalid: unknown) => Promise<unknown>
    )({ freeform: 'x' }, () => ({ status: 400 }))

    expect(result).toEqual({ ok: true })
  })

  it('guardedForm(fn) works without schema', async () => {
    const handler = guardedForm(async ctx => {
      expect(ctx.user.id).toBe('u-1')
      return { ok: true }
    })

    const result = await (handler as unknown as (invalid: unknown) => Promise<unknown>)(
      () => ({
        status: 400,
      }),
    )

    expect(result).toEqual({ ok: true })
  })

  it('guardedCommand(schema, fn) forwards output and context', async () => {
    const handler = guardedCommand(z.object({}).passthrough(), async (output, ctx) => {
      expect(output).toEqual({ id: 'org-1' })
      expect(ctx.user.id).toBe('u-1')
      return { ok: true }
    })

    const result = await (handler as (input: unknown) => Promise<unknown>)({
      id: 'org-1',
    })

    expect(result).toEqual({ ok: true })
  })

  it('guardedCommand(fn) works without schema', async () => {
    const handler = guardedCommand(async (input: { id: string }, ctx) => {
      expect(input.id).toBe('org-1')
      expect(ctx.user.id).toBe('u-1')
      return { ok: true }
    })

    const result = await (handler as (input: unknown) => Promise<unknown>)({
      id: 'org-1',
    })

    expect(result).toEqual({ ok: true })
  })

  it('throws Invalid arguments for unsupported signatures', () => {
    expect(() => Reflect.apply(guardedQuery, undefined, [{}])).toThrow(
      'Invalid arguments',
    )
    expect(() => Reflect.apply(guardedForm, undefined, ['unchecked'])).toThrow(
      'Invalid arguments',
    )
    expect(() => Reflect.apply(guardedCommand, undefined, [{}])).toThrow(
      'Invalid arguments',
    )
  })
  it('accepts bounded requested refreshes after a successful mutation', async () => {
    const read = guardedQuery(z.object({}).passthrough(), async () => ({ data: [] }))
    const write = guardedCommand(z.object({}).passthrough(), async () => ({
      saved: true,
    }))
    await write({})
    expect(mockRequested).toHaveBeenCalledWith(read, 32)
  })

  it('does not refresh queries when validation or authorization rejects the write', async () => {
    const write = guardedCommand(z.object({}).passthrough(), async () => {
      throw new Error('DENIED')
    })
    await expect(write({})).rejects.toThrow('DENIED')
    expect(mockRequested).not.toHaveBeenCalled()
  })

  it.each(['command', 'form'] as const)(
    'waits for requested refresh registration before completing a %s',
    async kind => {
      vi.useRealTimers()
      let release!: () => void
      let started!: () => void
      const pending = new Promise<void>(resolve => {
        release = resolve
      })
      const registered = new Promise<void>(resolve => {
        started = resolve
      })
      mockRequested.mockImplementation(() => ({
        refreshAll: async () => {
          started()
          await pending
        },
      }))
      const write =
        kind === 'command'
          ? guardedCommand(z.object({}), async () => ({ saved: true }))
          : guardedForm(z.object({}), async () => ({ saved: true }))
      let completed = false
      const result = (write as unknown as (input: unknown) => Promise<unknown>)(
        {},
      ).then(value => {
        completed = true
        return value
      })
      try {
        await registered
        // Let the mutation settle if it incorrectly discards refreshAll's promise.
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(completed).toBe(false)
      } finally {
        release()
        await result
        mockRequested.mockImplementation(() => ({ refreshAll: async () => {} }))
      }
      expect(await result).toEqual({ saved: true })
    },
  )

  describe('post-commit refresh failures', () => {
    it('awaits remaining refresh registration when one family fails', async () => {
      vi.useRealTimers()
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      let release!: () => void, started!: () => void
      const pending = new Promise<void>(resolve => {
        release = resolve
      })
      const registered = new Promise<void>(resolve => {
        started = resolve
      })
      let calls = 0
      mockRequested.mockImplementation(() => ({
        refreshAll: async () => {
          if (++calls === 1) throw new Error('first family failed')
          started()
          await pending
        },
      }))
      guardedQuery(z.object({}), async () => ({}))
      guardedQuery(z.object({}), async () => ({}))
      const write = guardedCommand(z.object({}), async () => ({ saved: true }))
      let completed = false
      const result = write({}).then(value => {
        completed = true
        return value
      })
      try {
        await registered
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(completed).toBe(false)
      } finally {
        release()
        await result
        mockRequested.mockImplementation(() => ({ refreshAll: async () => {} }))
        logged.mockRestore()
      }
      expect(await result).toEqual({ saved: true })
    })
    it.each(['command', 'form', 'redirect'] as const)(
      'preserves the committed %s outcome when refresh registration rejects',
      async kind => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockRequested.mockImplementation(() => ({
          refreshAll: async () => {
            throw new Error('refresh registration failed')
          },
        }))
        let writes = 0
        const handler = async () => {
          writes++
          if (kind === 'redirect') redirect(303, '/saved')
          return { saved: true }
        }
        const write =
          kind === 'command'
            ? guardedCommand(z.object({}), handler)
            : guardedForm(z.object({}), handler)
        try {
          const result = (write as unknown as (input: unknown) => Promise<unknown>)({})
          if (kind === 'redirect')
            await expect(result).rejects.toMatchObject({
              status: 303,
              location: '/saved',
            })
          else await expect(result).resolves.toEqual({ saved: true })
          expect(writes).toBe(1)
          expect(logged).toHaveBeenCalled()
        } finally {
          mockRequested.mockImplementation(() => ({ refreshAll: async () => {} }))
          logged.mockRestore()
        }
      },
    )
  })
})
