// TYPES
import type { FeatureAddress } from './featureAddress.js'

export type PlaceAddressRequest = { id: number; addresses: FeatureAddress[] }
export type PlaceAddressResponse =
  | { id: number; addresses: FeatureAddress[] }
  | { id: number; error: string }

/** Own a lazy worker for CPU-heavy catalogue validation and Place address parsing.
 * @returns Asynchronous enrichment and explicit component-lifetime cleanup.
 * @remarks Only small result pages cross the thread boundary; catalogues stay in the
 * worker. Failures reject into the search's existing retry UI, never block input with
 * a synchronous fallback. The caller must guard against obsolete search responses.
 */
export function createPlaceAddressWorker(): {
  structure: (addresses: FeatureAddress[]) => Promise<FeatureAddress[]>
  destroy: () => void
} {
  let worker: Worker | undefined
  let sequence = 0
  let disposed = false
  const pending = new Map<
    number,
    { resolve: (value: FeatureAddress[]) => void; reject: (error: Error) => void }
  >()
  /** Release failed or disposed work so searches cannot remain pending indefinitely.
   * @param error Reason for rejecting outstanding requests.
   * @returns Nothing.
   */
  function stop(error: Error): void {
    worker?.terminate()
    worker = undefined
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  }
  return {
    async structure(addresses) {
      if (disposed) throw new Error('Place address worker disposed')
      if (!addresses.length) return []
      if (!worker) {
        worker = new Worker(
          new URL('../workers/placeAddressWorker.ts', import.meta.url),
          {
            type: 'module',
          },
        )
        worker.onmessage = (event: MessageEvent<PlaceAddressResponse>): void => {
          const response = event.data
          const request = pending.get(response.id)
          if (!request) return
          pending.delete(response.id)
          if ('error' in response) request.reject(new Error(response.error))
          else request.resolve(response.addresses)
        }
        worker.onerror = () => stop(new Error('Place address worker failed'))
        worker.onmessageerror = () =>
          stop(new Error('Invalid Place address worker response'))
      }
      const activeWorker = worker
      const id = ++sequence
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        try {
          activeWorker.postMessage({ id, addresses } satisfies PlaceAddressRequest)
        } catch (error) {
          pending.delete(id)
          reject(error)
        }
      })
    },
    destroy() {
      disposed = true
      stop(new Error('Place address worker disposed'))
    },
  }
}
