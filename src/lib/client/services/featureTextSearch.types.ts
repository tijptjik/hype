// TYPES

export type FeatureTextSearchIndexItem = {
  id: string
  title?: string | null
  description?: string | null
  displayAddress?: string | null
  contributor?: string | null
}

export type FeatureTextSearchWorkerRequest =
  | {
      type: 'set-index'
      indexVersion: number
      items: FeatureTextSearchIndexItem[]
    }
  | {
      type: 'filter'
      indexVersion: number
      requestId: number
      query: string
    }

export type FeatureTextSearchWorkerResponse = {
  type: 'result'
  indexVersion: number
  requestId: number
  ids: string[]
}
