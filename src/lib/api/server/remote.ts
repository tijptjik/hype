import { command, form, getRequestEvent, query } from '$app/server'
import { invalid } from '@sveltejs/kit'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  RemoteCommand,
  RemoteForm,
  RemoteFormInput,
  RemoteQueryFunction,
  RequestEvent,
} from '@sveltejs/kit'
import { setupRequestHandler } from '$lib/api'

type GuardedBaseContext = Awaited<ReturnType<typeof setupRequestHandler>> & {
  event: RequestEvent
}

type GuardedQueryContext = GuardedBaseContext
type GuardedInvalid = (...issues: unknown[]) => never
type GuardedIssue<Input extends RemoteFormInput = RemoteFormInput> = any
type GuardedFormContext<Input extends RemoteFormInput = RemoteFormInput> =
  GuardedBaseContext & {
    invalid: GuardedInvalid
    issue: GuardedIssue<Input>
  }
type GuardedCommandContext = GuardedBaseContext

type SetupRequestEvent = Parameters<typeof setupRequestHandler>[0]
type GuardedContextResolver = (payload?: unknown) => Promise<GuardedBaseContext>

const toMetaAdminRequest = (payload: unknown): boolean => {
  if (!payload || typeof payload !== 'object') return false
  if (!('meta' in payload)) return false
  const meta = (payload as { meta?: unknown }).meta
  if (!meta || typeof meta !== 'object') return false
  return (meta as { isAdminRequest?: unknown }).isAdminRequest === true
}

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
    isAdminRequest: ctx.isAdminRequest || toMetaAdminRequest(payload),
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
// GUARDED FORM
/* -------- */

export function guardedForm<
  Schema extends StandardSchemaV1<RemoteFormInput, Record<string, unknown>>,
  Output,
>(
  schema: Schema,
  fn: (
    output: StandardSchemaV1.InferOutput<Schema>,
    ctx: GuardedFormContext<StandardSchemaV1.InferInput<Schema>>,
  ) => Promise<Output>,
): RemoteForm<StandardSchemaV1.InferInput<Schema>, Output>

export function guardedForm<Input extends RemoteFormInput, Output>(
  schema: 'unchecked',
  fn: (output: Input, ctx: GuardedFormContext<Input>) => Promise<Output>,
): RemoteForm<Input, Output>

export function guardedForm<Output>(
  fn: (ctx: GuardedFormContext<RemoteFormInput>) => Promise<Output>,
): RemoteForm<RemoteFormInput, Output>

export function guardedForm(
  schemaOrFn:
    | 'unchecked'
    | StandardSchemaV1<RemoteFormInput, Record<string, unknown>>
    | ((ctx: GuardedFormContext<RemoteFormInput>) => Promise<unknown>),
  maybeFn?:
    | ((output: unknown, ctx: GuardedFormContext<RemoteFormInput>) => Promise<unknown>)
    | ((input: unknown, ctx: GuardedFormContext<RemoteFormInput>) => Promise<unknown>)
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
        issue: issue as GuardedIssue<RemoteFormInput>,
      })
    })
  }

  if (schemaOrFn === 'unchecked' && typeof maybeFn === 'function') {
    return form('unchecked', async (input: unknown, issue) => {
      const ctx = await resolveCtx(input)
      return maybeFn(input, {
        ...ctx,
        invalid,
        issue: issue as GuardedIssue<RemoteFormInput>,
      })
    })
  }

  if (typeof schemaOrFn === 'function' && !maybeFn) {
    return form('unchecked', async (_input: unknown, issue) => {
      const ctx = await resolveCtx()
      return schemaOrFn({
        ...ctx,
        invalid,
        issue: issue as GuardedIssue<RemoteFormInput>,
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
