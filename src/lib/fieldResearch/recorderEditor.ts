/** Small wire contract keeps database and web-editor dependencies out of the device bundle. */
export type RecorderField = {
  id: string
  key: string
  type: string
  component: string
  dataType: 'text' | 'number' | 'date' | 'boolean' | 'link' | 'dateRange' | 'timeRange'
  cardinality: 'one' | 'many'
  dateResolution: 'decade' | 'year' | 'month' | 'day'
  timeMaxHour: 24 | 36
  min: number | null
  max: number | null
  i18n?: Record<string, { label?: string | null }>
  values?: {
    id: string
    value: string
    i18n?: Record<string, { value?: string | null }>
  }[]
}

export type RecorderFieldValue = string | number | boolean | string[] | null
export type RecorderStatus = {
  featureType: string
  isVisitable: boolean
  isIntangible: boolean
  isDraft: boolean
  isPendingReview: boolean
}
export type RecorderEditor = {
  id: string
  title: string
  revisionId: string
  version: number
  modifiedAt: string
  editable: boolean
  status: RecorderStatus
  types: { id: string; label: string; kind?: string }[]
  fields: RecorderField[]
  values: Record<string, RecorderFieldValue>
}
export type RecorderEdit = Pick<
  RecorderEditor,
  'id' | 'revisionId' | 'version' | 'modifiedAt' | 'status' | 'values'
>
