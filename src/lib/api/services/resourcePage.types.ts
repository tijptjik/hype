// TYPES

// RESOURCE LOADING
/** Raw public ancestor labels joined directly from a resource's foreign keys. */
export type CompactAncestorRow = {
  organisation?: {
    id: string
    code: string
    i18n?: Array<Record<string, unknown>>
  } | null
  project?: {
    id: string
    code: string
    useAllInOrgContext?: boolean
    i18n?: Array<Record<string, unknown>>
  } | null
}

/** Resources exposed by the independently paged hierarchy panels. */
export type PanelResourceType = 'organisation' | 'project' | 'layer'

export type PanelResource =
  | import('#lib/db/zod/schema/organisation.types.js').OrganisationEntityByProfile<'compact'>
  | import('#lib/db/zod/schema/project.types.js').ProjectEntityByProfile<'compact'>
  | import('#lib/db/zod/schema/layer.types.js').LayerEntityByProfile<'compact'>

export type ResourcePage = {
  data: PanelResource[]
  nextCursor: { id: string; signature: string; value?: string | number | null } | null
}

export type ResourcePageInput = {
  type: PanelResourceType
  profile?: 'compact' | 'default'
  sorting?: { sortBy: string; sortOrder: 'asc' | 'desc' }
  conditions?: { isPublished?: boolean | null; isArchived?: boolean | null }
  q?: string
  cursor?: { id: string; signature: string; value?: string | number | null } | null
  prisms?: { organisation?: string[]; project?: string[]; layer?: string[] }
  meta: { isAdminRequest: boolean; scope: string }
}
