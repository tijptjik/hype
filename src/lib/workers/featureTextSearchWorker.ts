// SEARCH
import { foldFeatureSearchText } from '#lib/features/search.js'
import type {
  FeatureTextSearchIndexItem,
  FeatureTextSearchWorkerRequest,
  FeatureTextSearchWorkerResponse,
} from '#lib/client/services/featureTextSearch.types.js'

let indexedItems: FeatureTextSearchIndexItem[] = []
let indexedVersion = 0

function normalize(value: string): string {
  return foldFeatureSearchText(value.trim())
}

function matchesQuery(
  item: FeatureTextSearchIndexItem,
  normalizedQuery: string,
): boolean {
  if (normalizedQuery === '') return true

  return (
    foldFeatureSearchText(item.id).includes(normalizedQuery) ||
    foldFeatureSearchText(item.title ?? '').includes(normalizedQuery) ||
    foldFeatureSearchText(item.description ?? '').includes(normalizedQuery) ||
    foldFeatureSearchText(item.displayAddress ?? '').includes(normalizedQuery) ||
    foldFeatureSearchText(item.contributor ?? '').includes(normalizedQuery)
  )
}

self.onmessage = (event: MessageEvent<FeatureTextSearchWorkerRequest>): void => {
  const message = event.data

  if (message.type === 'set-index') {
    indexedItems = message.items
    indexedVersion = message.indexVersion
    return
  }

  if (message.indexVersion !== indexedVersion) return

  const normalizedQuery = normalize(message.query)
  const ids =
    normalizedQuery === ''
      ? indexedItems.map(item => item.id)
      : indexedItems
          .filter(item => matchesQuery(item, normalizedQuery))
          .map(item => item.id)

  const response: FeatureTextSearchWorkerResponse = {
    type: 'result',
    indexVersion: message.indexVersion,
    requestId: message.requestId,
    ids,
  }

  self.postMessage(response)
}
