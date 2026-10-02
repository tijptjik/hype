import { invalid, isRedirect } from '@sveltejs/kit'

import {
  command,
  form,
  getRequestEvent,
  query,
  requested,
  type RemoteCommand,
  type RemoteForm,
  type RemoteFormInput,
  type RemoteQueryFunction,
} from '$app/server'

import type { StandardSchemaV1 } from '@standard-schema/spec'
import { setupRequestHandler } from '#lib/api/index.js'

import type {
  GuardedBaseContext,
  GuardedCommandContext,
  GuardedFormContext,
  GuardedIssue,
  GuardedQueryContext,
} from '#lib/api/guarded.types.js'
// TYPES

type SetupRequestEvent = Parameters<typeof setupRequestHandler>[0]

// Only query definitions are shared here; results and authorization remain request-local.
const refreshableQueries = new Set<RemoteQueryFunction<unknown, unknown>>()

/**
 * Registers a native query family for bounded client-requested mutation refreshes.
 * @param remote - Native query function, including batched query families.
 * @returns The unchanged query function.
 */
function registerQuery<T extends RemoteQueryFunction<unknown, unknown>>(remote: T): T {
  refreshableQueries.add(remote)
  return remote
}

/**
 * Accepts explicit client refresh requests only after a successful write.
 * @param write - Authorized mutation handler.
 * @returns The mutation result; native query updates travel in the same response.
 * @remarks No unrequested query runs. Validation failures never refresh collections.
 */
async function withRequestedRefreshes<T>(write: () => Promise<T>): Promise<T> {
  let committed = false
  try {
    const result = await write()
    committed = true
    return result
  } catch (error) {
    committed = isRedirect(error)
    throw error
  } finally {
    if (committed) {
      // Load feature query registration after initialization to avoid remote-module cycles.
      // Only client-requested active pages refresh, including map filters and saved lists.
      await import('../featureQueries.remote.js')
      for (const remote of refreshableQueries) void requested(remote, 32).refreshAll()
    }
  }
}

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// GET
// - guardedQuery
// - guardedBatchByIdQuery
//
// FORM
// - guardedForm
//
// COMMAND
// - guardedCommand

/**
 * Extract explicit admin intent from a single remote payload item.
 *
 * Request-level admin detection (URL/referer/header) can be ambiguous for
 * remote calls, so handlers accept an explicit `meta.isAdminRequest` signal.
 * Returning `undefined` means "no explicit override provided".
 */
const toMetaAdminRequest = (payload: unknown): boolean | undefined => {
  if (!payload || typeof payload !== 'object') return undefined
  if (!('meta' in payload)) return undefined

  const meta = (payload as { meta?: unknown }).meta

  if (!meta || typeof meta !== 'object') return undefined

  const isAdminRequest = (meta as { isAdminRequest?: unknown }).isAdminRequest

  return typeof isAdminRequest === 'boolean' ? isAdminRequest : undefined
}

/**
 * Extract explicit admin intent from either single or batched payloads.
 *
 * `query.batch` delivers arrays, while non-batch query/form calls deliver a
 * single object. We need one normalizer so guarded context can read explicit
 * admin intent consistently across both call shapes.
 */
const toPayloadAdminRequest = (payload: unknown): boolean => {
  if (Array.isArray(payload)) {
    const items = payload
      .map(item => toMetaAdminRequest(item))
      .filter((value): value is boolean => typeof value === 'boolean')

    return items.some(value => value === true)
  }
  return toMetaAdminRequest(payload) === true
}

/**
 * Build guarded request context for remote handlers.
 *
 * Admin intent is payload-driven: `meta.isAdminRequest === true` enables admin
 * mode; all other payload states are treated as non-admin.
 *
 * This intentionally avoids request URL/referer/header inference so remote
 * callers must send explicit metadata for admin-origin requests.
 */
const resolveGuardedContext = async (
  payload?: unknown,
): Promise<GuardedBaseContext> => {
  const event = getRequestEvent()
  const setupEvent: SetupRequestEvent = {
    locals: event.locals,
    platform: event.locals.platform,
    request: event.request,
  }

  const ctx = await setupRequestHandler(setupEvent)

  return {
    ...ctx,
    isAdminRequest: toPayloadAdminRequest(payload),
    event,
  }
}

/* ----------------- */
// GUARDED QUERY
/* -------- */

export function guardedQuery<Schema extends StandardSchemaV1, Output>(
  schema: Schema,
  fn: (
    output: StandardSchemaV1.InferOutput<Schema>,
    ctx: GuardedQueryContext,
  ) => Promise<Output>,
): RemoteQueryFunction<StandardSchemaV1.InferInput<Schema>, Output>

export function guardedQuery<Output>(
  fn: (ctx: GuardedQueryContext) => Promise<Output>,
): RemoteQueryFunction<void, Output>

export function guardedQuery(
  schemaOrFn: StandardSchemaV1 | ((ctx: GuardedQueryContext) => Promise<unknown>),
  maybeFn?:
    | ((output: unknown, ctx: GuardedQueryContext) => Promise<unknown>)
    | undefined,
) {
  if (typeof maybeFn === 'function' && typeof schemaOrFn !== 'function') {
    return registerQuery(
      query(schemaOrFn, async output => {
        const ctx = await resolveGuardedContext(output)

        return maybeFn(output, ctx)
      }),
    )
  }

  if (typeof schemaOrFn === 'function' && !maybeFn) {
    return registerQuery(
      query(async () => {
        const ctx = await resolveGuardedContext()
        return schemaOrFn(ctx)
      }),
    )
  }

  throw new Error('Invalid arguments')
}

/* ----------------- */
// GUARDED BATCH QUERY
/* -------- */

/**
 * Creates a guarded native batched query and eagerly resolves each row.
 * @param schema - Validator used by SvelteKit for every batch item.
 * @param fn - Shared batch handler that returns a resolver for each validated item.
 * @returns A registered SvelteKit batched query function.
 * @remarks SvelteKit serializes the value returned by each resolver synchronously,
 * so this wrapper settles row promises before returning the resolver. Captured row
 * errors are re-thrown from that synchronous resolver and retain per-item failures.
 */
export function guardedBatchQuery<Schema extends StandardSchemaV1, Output>(
  schema: Schema,
  fn: (
    outputs: Array<StandardSchemaV1.InferOutput<Schema>>,
    ctx: GuardedQueryContext,
  ) => Promise<
    (
      output: StandardSchemaV1.InferOutput<Schema>,
      index: number,
    ) => Output | Promise<Output>
  >,
) {
  return registerQuery(
    query.batch(schema, async outputs => {
      const ctx = await resolveGuardedContext(outputs)
      const resolver = await fn(outputs, ctx)

      const settled = await Promise.all(
        outputs.map(async (output, index) => {
          try {
            return { ok: true as const, value: await resolver(output, index) }
          } catch (error) {
            return { ok: false as const, error }
          }
        }),
      )

      return (_output, index) => {
        const result = settled[index]

        if (!result) throw new Error(`Missing batch result at index ${index}`)
        if (!result.ok) throw result.error

        return result.value
      }
    }) as RemoteQueryFunction<StandardSchemaV1.InferInput<Schema>, Awaited<Output>>,
  )
}

/* ----------------- */
// GUARDED BATCH QUERY - SUBTYPES
/* -------- */

/**
 * Batch query helper for ID-shaped inputs.
 *
 * Use this when each batch item includes an `id` and your handler needs to:
 * 1. de-duplicate IDs for a single backend lookup, then
 * 2. resolve each original item from that shared lookup result.
 *
 * Compared to `guardedBatchQuery`, this helper supplies:
 * - `ids`: unique IDs extracted from `args`
 */
export function guardedBatchByIdQuery<
  Schema extends StandardSchemaV1,
  Output,
  Item extends StandardSchemaV1.InferOutput<Schema> & {
    id: string
  } = StandardSchemaV1.InferOutput<Schema> & { id: string },
>(
  schema: Schema,
  fn: (params: {
    args: Item[]
    ids: string[]
    ctx: GuardedQueryContext
  }) => Promise<(output: Item) => Output | Promise<Output>>,
) {
  return guardedBatchQuery(schema, async (outputs, ctx) => {
    const args = outputs as Item[]
    const ids = Array.from(new Set(args.map(arg => arg.id)))
    const resolver = await fn({ args, ids, ctx })
    return (output: StandardSchemaV1.InferOutput<Schema>) => resolver(output as Item)
  })
}

/* ----------------- */
// GUARDED FORM
/* -------- */
export function guardedForm<
  Schema extends StandardSchemaV1<RemoteFormInput, Record<string, unknown>>,
  Output,
>(
  schema: Schema,
  fn: (
    output: StandardSchemaV1.InferOutput<Schema>,
    ctx: GuardedFormContext,
  ) => Promise<Output>,
): RemoteForm<StandardSchemaV1.InferInput<Schema>, Output>

export function guardedForm<Input extends RemoteFormInput, Output>(
  schema: 'unchecked',
  fn: (output: Input, ctx: GuardedFormContext) => Promise<Output>,
): RemoteForm<Input, Output>

export function guardedForm<Output>(
  fn: (ctx: GuardedFormContext) => Promise<Output>,
): RemoteForm<RemoteFormInput, Output>

export function guardedForm(
  schemaOrFn:
    | 'unchecked'
    | StandardSchemaV1<RemoteFormInput, Record<string, unknown>>
    | ((ctx: GuardedFormContext) => Promise<unknown>),
  maybeFn?:
    | ((output: unknown, ctx: GuardedFormContext) => Promise<unknown>)
    | ((input: unknown, ctx: GuardedFormContext) => Promise<unknown>)
    | undefined,
) {
  if (
    typeof maybeFn === 'function' &&
    typeof schemaOrFn !== 'function' &&
    schemaOrFn !== 'unchecked'
  ) {
    return form(schemaOrFn, async (output, issue) => {
      const ctx = await resolveGuardedContext(output)
      return withRequestedRefreshes(() =>
        maybeFn(output, {
          ...ctx,
          invalid,
          issue: issue as GuardedIssue,
        }),
      )
    })
  }

  if (schemaOrFn === 'unchecked' && typeof maybeFn === 'function') {
    return form('unchecked', async (input: unknown, issue) => {
      const ctx = await resolveGuardedContext(input)
      return withRequestedRefreshes(() =>
        maybeFn(input, {
          ...ctx,
          invalid,
          issue: issue as GuardedIssue,
        }),
      )
    })
  }

  if (typeof schemaOrFn === 'function' && !maybeFn) {
    return form('unchecked', async (_input: unknown, issue) => {
      const ctx = await resolveGuardedContext()
      return withRequestedRefreshes(() =>
        schemaOrFn({
          ...ctx,
          invalid,
          issue: issue as GuardedIssue,
        }),
      )
    })
  }

  throw new Error('Invalid arguments')
}

/* ----------------- */
// GUARDED COMMAND
/* -------- */

export function guardedCommand<Schema extends StandardSchemaV1, Output>(
  schema: Schema,
  fn: (
    output: StandardSchemaV1.InferOutput<Schema>,
    ctx: GuardedCommandContext,
  ) => Promise<Output>,
): RemoteCommand<StandardSchemaV1.InferInput<Schema>, Output>

export function guardedCommand<Input, Output>(
  fn: (input: Input, ctx: GuardedCommandContext) => Promise<Output>,
): RemoteCommand<Input, Output>

export function guardedCommand(
  schemaOrFn:
    | StandardSchemaV1
    | ((input: unknown, ctx: GuardedCommandContext) => Promise<unknown>),
  maybeFn?: (output: unknown, ctx: GuardedCommandContext) => Promise<unknown>,
) {
  if (typeof maybeFn === 'function' && typeof schemaOrFn !== 'function') {
    return command(schemaOrFn, async output => {
      const ctx = await resolveGuardedContext(output)
      return withRequestedRefreshes(() => maybeFn(output, ctx))
    })
  }

  if (typeof schemaOrFn === 'function' && !maybeFn) {
    return command('unchecked', async (input: unknown) => {
      const ctx = await resolveGuardedContext(input)
      return withRequestedRefreshes(() => schemaOrFn(input, ctx))
    })
  }

  throw new Error('Invalid arguments')
}
