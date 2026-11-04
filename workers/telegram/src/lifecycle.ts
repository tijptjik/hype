import { networkMiddlewares, type RpcCallMiddleware } from '@mtcute/core'

/** Bound SDK requests and cancel them before disposing the session they borrow. */
export function sessionMiddlewares(
  lifetime: AbortSignal,
  timeoutMs = 30_000,
): RpcCallMiddleware[] {
  const bounded: RpcCallMiddleware = async (context, next) => {
    const deadline = new AbortController()
    const timer = setTimeout(
      () => deadline.abort(new Error('Telegram request timed out')),
      timeoutMs,
    )
    const signal = AbortSignal.any([
      lifetime,
      deadline.signal,
      ...(context.params?.abortSignal ? [context.params.abortSignal] : []),
    ])
    try {
      signal.throwIfAborted()
      // Await actual cancellation, rather than racing and freeing storage under an unfinished SDK call.
      const result = await next({
        ...context,
        params: { ...context.params, abortSignal: signal },
      })
      signal.throwIfAborted()
      return result
    } finally {
      clearTimeout(timer)
    }
  }
  return [bounded, ...networkMiddlewares.basic()]
}
