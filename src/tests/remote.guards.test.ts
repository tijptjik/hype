import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetRequestEvent,
  mockQuery,
  mockForm,
  mockCommand,
  mockSetupRequestHandler,
} = vi.hoisted(() => ({
  mockGetRequestEvent: vi.fn(),
  mockQuery: vi.fn((...args: unknown[]) => {
    const handler = args.length === 1 ? args[0] : args[1]
    return handler
  }),
  mockForm: vi.fn((...args: unknown[]) => {
    const handler = args.length === 1 ? args[0] : args[1]
    return handler
  }),
  mockCommand: vi.fn((...args: unknown[]) => {
    const handler = args.length === 1 ? args[0] : args[1]
    return handler
  }),
  mockSetupRequestHandler: vi.fn(),
}))

vi.mock('$app/server', () => ({
  getRequestEvent: mockGetRequestEvent,
  query: mockQuery,
  form: mockForm,
  command: mockCommand,
}))

vi.mock('$lib/api', () => ({
  setupRequestHandler: mockSetupRequestHandler,
}))

import { guardedCommand, guardedForm, guardedQuery } from '$lib/api/server/remote'

describe('remote guard wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetRequestEvent.mockReturnValue({
      locals: { user: { id: 'u-1' } },
      platform: { env: {} },
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
    const handler = guardedQuery({} as any, async (output, ctx) => {
      expect(output).toEqual({ ref: 'org-1' })
      expect(ctx.user.id).toBe('u-1')
      expect(ctx.userRoles).toHaveLength(1)
      expect(ctx.db).toEqual({ tag: 'db' })
      expect(ctx.event.locals.user.id).toBe('u-1')
      return { ok: true }
    })

    const result = await (handler as (input: unknown) => Promise<unknown>)({
      ref: 'org-1',
    })

    expect(result).toEqual({ ok: true })
    expect(mockSetupRequestHandler).toHaveBeenCalledTimes(1)
    expect(mockSetupRequestHandler).toHaveBeenCalledWith({
      locals: { user: { id: 'u-1' } },
      platform: { env: {} },
      request: { method: 'POST' },
    })
  })

  it('guardedQuery(fn) works without schema', async () => {
    const handler = guardedQuery(async ctx => ({ admin: ctx.isAdminRequest }))

    const result = await (handler as () => Promise<unknown>)()

    expect(result).toEqual({ admin: true })
  })

  it('guardedForm(schema, fn) forwards invalid helper and context', async () => {
    const handler = guardedForm({} as any, async (output, ctx) => {
      expect(output).toEqual({ data: { code: 'abc' } })
      expect(typeof ctx.invalid).toBe('function')
      expect(ctx.user.id).toBe('u-1')
      return { ok: true }
    })

    const result = await (
      handler as (input: unknown, invalid: unknown) => Promise<unknown>
    )({ data: { code: 'abc' } }, () => ({ status: 400 }))

    expect(result).toEqual({ ok: true })
  })

  it('guardedForm("unchecked", fn) works with unchecked input', async () => {
    const handler = guardedForm('unchecked', async (input: any, ctx) => {
      expect(input.freeform).toBe('x')
      expect(ctx.user.id).toBe('u-1')
      return { ok: true }
    })

    const result = await (
      handler as (input: unknown, invalid: unknown) => Promise<unknown>
    )({ freeform: 'x' }, () => ({ status: 400 }))

    expect(result).toEqual({ ok: true })
  })

  it('guardedForm(fn) works without schema', async () => {
    const handler = guardedForm(async ctx => {
      expect(ctx.user.id).toBe('u-1')
      return { ok: true }
    })

    const result = await (handler as (invalid: unknown) => Promise<unknown>)(() => ({
      status: 400,
    }))

    expect(result).toEqual({ ok: true })
  })

  it('guardedCommand(schema, fn) forwards output and context', async () => {
    const handler = guardedCommand({} as any, async (output, ctx) => {
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
    const handler = guardedCommand(async (input: any, ctx) => {
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
    expect(() => guardedQuery({} as any)).toThrow('Invalid arguments')
    expect(() => guardedForm('unchecked' as any)).toThrow('Invalid arguments')
    expect(() => guardedCommand({} as any)).toThrow('Invalid arguments')
  })
})
