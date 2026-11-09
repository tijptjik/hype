import { afterEach, expect, it, vi } from 'vitest'
import { createPlaceAddressWorker } from '#lib/addresses/placeAddressWorker.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import type {
  PlaceAddressRequest,
  PlaceAddressResponse,
} from '#lib/addresses/placeAddressWorker.js'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage?: (event: MessageEvent<PlaceAddressResponse>) => void
  onerror?: () => void
  onmessageerror?: () => void
  postMessage = vi.fn<(request: PlaceAddressRequest) => void>()
  terminate = vi.fn()
  constructor() {
    FakeWorker.instances.push(this)
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  FakeWorker.instances = []
})

it('keeps enrichment off the caller and correlates out-of-order replies', async () => {
  vi.stubGlobal('Worker', FakeWorker)
  const client = createPlaceAddressWorker()
  expect(FakeWorker.instances).toHaveLength(0)
  const firstAddress = emptyFeatureAddress({ en: 'Hollywood Road' })
  const secondAddress = emptyFeatureAddress({ en: 'Queen’s Road' })
  const first = client.structure([firstAddress])
  const second = client.structure([secondAddress])
  const worker = FakeWorker.instances[0]
  const firstId = worker.postMessage.mock.calls[0][0].id
  const secondId = worker.postMessage.mock.calls[1][0].id
  worker.onmessage?.({
    data: { id: secondId, addresses: [secondAddress] },
  } as MessageEvent<PlaceAddressResponse>)
  expect(await second).toEqual([secondAddress])
  worker.onmessage?.({
    data: { id: firstId, addresses: [firstAddress] },
  } as MessageEvent<PlaceAddressResponse>)
  expect(await first).toEqual([firstAddress])
  client.destroy()
  expect(worker.terminate).toHaveBeenCalledOnce()
})

it('rejects pending work on failure and allows the retry to start a new worker', async () => {
  vi.stubGlobal('Worker', FakeWorker)
  const client = createPlaceAddressWorker()
  const pending = client.structure([emptyFeatureAddress()])
  const failure = expect(pending).rejects.toThrow('worker failed')
  FakeWorker.instances[0].onerror?.()
  await failure
  const retry = client.structure([emptyFeatureAddress()])
  expect(FakeWorker.instances).toHaveLength(2)
  const disposed = expect(retry).rejects.toThrow('disposed')
  client.destroy()
  await disposed
  await expect(client.structure([])).rejects.toThrow('disposed')
})
