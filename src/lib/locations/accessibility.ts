// VALIDATION
import { z } from 'zod'

export const ACCESSIBILITY_FIELDS = [
  'stepFreeEntrance',
  'lift',
  'wheelchair',
  'toilet',
] as const
export const AccessibilitySchema = z.strictObject({
  wheelchair: z.enum(['unknown', 'yes', 'limited', 'no']),
  stepFreeEntrance: z.enum(['unknown', 'yes', 'no']),
  lift: z.enum(['unknown', 'yes', 'no', 'not_needed']),
  toilet: z.enum(['unknown', 'yes', 'limited', 'no']),
})
export type Accessibility = z.infer<typeof AccessibilitySchema>
export const UNKNOWN_ACCESSIBILITY: Accessibility = {
  wheelchair: 'unknown',
  stepFreeEntrance: 'unknown',
  lift: 'unknown',
  toilet: 'unknown',
}
export const AccessibilitySaveSchema = z.strictObject({
  locationId: z.string().min(1).max(200),
  expectedId: z.string().min(1).max(200).nullable(),
  expectedLocationRevisionId: z.string().min(1).max(200),
  values: AccessibilitySchema,
})
export type AccessibilitySave = z.infer<typeof AccessibilitySaveSchema>
export type AccessibilityRecord = {
  id: string
  locationId: string
  values: Accessibility
  recordedAt: string
  stale: boolean
}
export type AccessibilityView = {
  locationRevisionId: string
  record: AccessibilityRecord | null
  venues: {
    locationId: string
    names: Record<string, string>
    record: AccessibilityRecord
  }[]
  moreVenues: boolean
}

/** Only explicitly edited fields are contributed when a new Feature is created. */
export const AccessibilityDraftSchema = AccessibilitySchema.partial()
export type AccessibilityDraft = z.infer<typeof AccessibilityDraftSchema>
