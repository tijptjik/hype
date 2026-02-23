import { command, form, getRequestEvent, query } from '$app/server'
import { invalid } from '@sveltejs/kit'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  RemoteCommand,
  RemoteForm,
  RemoteFormInput,
  RemoteQueryFunction,
} from '@sveltejs/kit'
import { setupRequestHandler } from '$lib/api'
import type {
  GuardedBaseContext,
  GuardedCommandContext,
  GuardedContextResolver,
  GuardedFormContext,
  GuardedIssue,
  GuardedQueryContext,
  SetupRequestEvent,
} from '$lib/types'

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
    platform: event.platform,
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
): RemoteQueryFunction<StandardSchemaV1.InferInput<Schema>, Promise<Output>>

export function guardedQuery<Output>(
  fn: (ctx: GuardedQueryContext) => Promise<Output>,
): RemoteQueryFunction<void, Promise<Output>>

export function guardedQuery(
  schemaOrFn: StandardSchemaV1 | ((ctx: GuardedQueryContext) => Promise<unknown>),
  maybeFn?:
    | ((output: unknown, ctx: GuardedQueryContext) => Promise<unknown>)
    | undefined,
) {
  const resolveCtx: GuardedContextResolver = resolveGuardedContext

  if (typeof maybeFn === 'function' && typeof schemaOrFn !== 'function') {
    return query(schemaOrFn, async output => {
      const ctx = await resolveCtx(output)
      return maybeFn(output, ctx)
    })
  }

  if (typeof schemaOrFn === 'function' && !maybeFn) {
    return query(async () => {
      const ctx = await resolveCtx()
      return schemaOrFn(ctx)
    })
  }

  throw new Error('Invalid arguments')
}

/* ----------------- */
// GUARDED BATCH QUERY
/* -------- */

export function guardedBatchQuery<Schema extends StandardSchemaV1, Output>(
  schema: Schema,
  fn: (
    outputs: Array<StandardSchemaV1.InferOutput<Schema>>,
    ctx: GuardedQueryContext,
  ) => Promise<
    (output: StandardSchemaV1.InferOutput<Schema>) => Output | Promise<Output>
  >,
) {
  const resolveCtx: GuardedContextResolver = resolveGuardedContext
  return query.batch(schema, async outputs => {
    const ctx = await resolveCtx(outputs)
    return fn(outputs, ctx)
  })
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
  } = StandardSchemaV1.InferOutput<Schema> & {
    id: string
  },
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
  const resolveCtx: GuardedContextResolver = resolveGuardedContext

  if (
    typeof maybeFn === 'function' &&
    typeof schemaOrFn !== 'function' &&
    schemaOrFn !== 'unchecked'
  ) {
    return form(schemaOrFn, async (output, issue) => {
      const ctx = await resolveCtx(output)
      return maybeFn(output, {
        ...ctx,
        invalid,
        issue: issue as GuardedIssue,
      })
    })
  }

  if (schemaOrFn === 'unchecked' && typeof maybeFn === 'function') {
    return form('unchecked', async (input: unknown, issue) => {
      const ctx = await resolveCtx(input)
      return maybeFn(input, {
        ...ctx,
        invalid,
        issue: issue as GuardedIssue,
      })
    })
  }

  if (typeof schemaOrFn === 'function' && !maybeFn) {
    return form('unchecked', async (_input: unknown, issue) => {
      const ctx = await resolveCtx()
      return schemaOrFn({
        ...ctx,
        invalid,
        issue: issue as GuardedIssue,
      })
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
): RemoteCommand<StandardSchemaV1.InferInput<Schema>, Promise<Output>>

export function guardedCommand<Input, Output>(
  fn: (input: Input, ctx: GuardedCommandContext) => Promise<Output>,
): RemoteCommand<Input, Promise<Output>>

export function guardedCommand(
  schemaOrFn:
    | StandardSchemaV1
    | ((input: unknown, ctx: GuardedCommandContext) => Promise<unknown>),
  maybeFn?: (output: unknown, ctx: GuardedCommandContext) => Promise<unknown>,
) {
  const resolveCtx: GuardedContextResolver = resolveGuardedContext

  if (typeof maybeFn === 'function' && typeof schemaOrFn !== 'function') {
    return command(schemaOrFn, async output => {
      const ctx = await resolveCtx(output)
      return maybeFn(output, ctx)
    })
  }

  if (typeof schemaOrFn === 'function' && !maybeFn) {
    return command('unchecked', async (input: unknown) => {
      const ctx = await resolveCtx(input)
      return schemaOrFn(input, ctx)
    })
  }

  throw new Error('Invalid arguments')
}
