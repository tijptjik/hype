// THIRD PARTY
import { z } from 'zod'

/** Public resource IDs only; never accept free text or account identifiers. */
const resourceId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
export const CLIENT_USAGE_EVENTS = [
  'feature.view',
  'layer.activate',
  'project.filter',
  'organisation.click',
] as const
export const CONTRIBUTION_EVENTS = [
  'contribution.edit',
  'contribution.new_feature',
  'contribution.missing_report',
  'contribution.photos',
] as const

export const clientUsageSchema = z
  .object({
    event: z.enum(CLIENT_USAGE_EVENTS),
    entityId: resourceId,
  })
  .strict()
export const productUsageSchema = z
  .object({
    event: z.enum([...CLIENT_USAGE_EVENTS, ...CONTRIBUTION_EVENTS]),
    entityId: resourceId,
    hubId: resourceId.optional(),
    source: z.enum(['client', 'server']),
  })
  .strict()
export type ClientUsage = z.infer<typeof clientUsageSchema>
export type ProductUsage = z.infer<typeof productUsageSchema>
export type ContributionEvent = (typeof CONTRIBUTION_EVENTS)[number]

export const USAGE_LABELS: Record<ProductUsage['event'], string> = {
  'feature.view': 'Feature visits',
  'layer.activate': 'Layer activations',
  'project.filter': 'Project filters',
  'organisation.click': 'Organisation clicks',
  'contribution.edit': 'Feature edits',
  'contribution.new_feature': 'New features',
  'contribution.missing_report': 'Missing reports',
  'contribution.photos': 'Photo contributions',
}
