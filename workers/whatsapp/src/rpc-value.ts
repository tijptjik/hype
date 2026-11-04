/**
 * Return owned data rather than forwarding a DO result's RPC lifetime.
 * @param pending A data-only RPC result; never a stream or capability.
 * @returns A detached value after releasing the upstream RPC result.
 */
export async function copyRpcValue<T>(pending: PromiseLike<T>): Promise<T> {
  const value = await pending
  try {
    return structuredClone(value)
  } finally {
    if (value !== null && typeof value === 'object' && Symbol.dispose in value) {
      const dispose = value[Symbol.dispose]
      if (typeof dispose === 'function') dispose.call(value)
    }
  }
}
