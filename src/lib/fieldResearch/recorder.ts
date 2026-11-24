/** Mobile projections contain only the internal session label and visible location context. */
export type RecorderOption = { id: string; name: string }
export type RecorderSession = RecorderOption & {
  updatedAt: string
  completed: boolean
  captureIssue: string | null
  layers: RecorderOption[]
  defaultLayerId: string | null
}
export type RecorderLocation = RecorderOption & {
  kind: 'premises' | 'building' | 'building_part'
  premises: RecorderOption | null
  building: RecorderOption | null
  iconPath: string | null
}

export type RecorderRecord = {
  id: string
  featureId: string | null
  title: string | null
}
