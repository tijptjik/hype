// ADDRESS
import { loadAddressNames, structurePlaceAddress } from '../addresses/nameCatalogue.js'
// TYPES
import type {
  PlaceAddressRequest,
  PlaceAddressResponse,
} from '../addresses/placeAddressWorker.js'

// Catalogue reads, validation and parsing all run off the UI thread. SourceCache
// retains publication-aware daily caching and coalesces concurrent catalogue loads.
self.onmessage = async (event: MessageEvent<PlaceAddressRequest>): Promise<void> => {
  const { id, addresses } = event.data
  let response: PlaceAddressResponse
  try {
    const [streets, buildings] = await Promise.all([
      loadAddressNames('streets').catch(() => []),
      loadAddressNames('buildings').catch(() => []),
    ])
    response = {
      id,
      addresses: addresses.map(address =>
        structurePlaceAddress(address, streets, buildings),
      ),
    }
  } catch {
    response = { id, error: 'Place address enrichment failed' }
  }
  self.postMessage(response)
}
