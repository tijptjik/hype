// VALIDATION
import { z } from 'zod'

export const FeatureOriginSchema = z.enum([
  'app_contribution',
  'admin_contribution',
  'field_research',
])
export type FeatureOrigin = z.infer<typeof FeatureOriginSchema>
export const featureOriginLabels: Record<FeatureOrigin, string> = {
  app_contribution: 'App contribution',
  admin_contribution: 'Admin contribution',
  field_research: 'Field research',
}

/** Origin IDs are interpreted only through this server-owned namespace registry. */
export const featureOriginReferenceTables = {
  app_contribution: 'featureRevisionProposal',
  admin_contribution: null,
  field_research: 'fieldResearchSession',
} as const satisfies Record<FeatureOrigin, string | null>

export type ResearchSession = {
  id: string
  name: string
  organisationId: string
  projectId: string
  layerId?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  isArchived?: boolean
  archivedAt?: string | null
  archivedBy?: string | null
  completedAt: string | null
  status: 'uploading' | 'organising' | 'completed'
  configurationVersion: number
  revision: number
  west: number | null
  south: number | null
  east: number | null
  north: number | null
}
