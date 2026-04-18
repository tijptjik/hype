import type {
  FeatureTextSearchIndexItem,
  FeatureTextSearchWorkerRequest,
  FeatureTextSearchWorkerResponse,
} from '$lib/types'

let indexedItems: FeatureTextSearchIndexItem[] = []
let indexedVersion = 0

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function matchesQuery(
  item: FeatureTextSearchIndexItem,
  normalizedQuery: string,
): boolean {
  if (normalizedQuery === '') return true

  return (
    item.title?.toLowerCase().includes(normalizedQuery) === true ||
    item.description?.toLowerCase().includes(normalizedQuery) === true ||
    item.displayAddress?.toLowerCase().includes(normalizedQuery) === true ||
    item.contributor?.toLowerCase().includes(normalizedQuery) === true
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
