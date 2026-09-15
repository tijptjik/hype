// TYPES
import type { ImageContextResource, ImageContextResourceExtended } from '$lib/enums'
import type { OrganisationDB } from '$lib/db/zod/schema/organisation.types'
import type { ProjectDB } from '$lib/db/zod/schema/project.types'
import type {
  ImageUpload,
  LoadStatus,
  ImageCtxEnvelope,
} from '$lib/db/zod/schema/image.types'
import type { SvelteSet } from 'svelte/reactivity'
import type { Id } from '$lib/types'
import type { HubDB } from '$lib/db/zod/schema/hub.types'

type ImageCtxMode = 'standalone' | 'gallery' | 'carousel'

type ImageCtxState = {
  mode: ImageCtxMode

  ctxType: ImageContextResource | null
  ctxTypeSecondary: ImageContextResourceExtended | null
  ctxId: Id | null
  ctxIdSecondary: Id | null

  organisation: OrganisationDB | null
  project: ProjectDB | null

  highlightedIds: Id[]
  uploadQueue: ImageUpload[]
  loadStatus: Record<string, LoadStatus>
  activeId: string | null
  images: ImageCtxEnvelope[]
  preloadedImages: Set<string>
  pendingConfirmation: SvelteSet<string>
  deletionQueue: SvelteSet<string>
  rejected: File[]
  thumbnailLoadStatus: Record<string, LoadStatus>
}

type ImageCtxOptions = {
  mode: ImageCtxMode
  isAdminMode: boolean
  ctxType: ImageContextResource
  ctxId: Id
  hub?: HubDB
  organisation?: OrganisationDB
  project?: ProjectDB
  image?: ImageCtxEnvelope
  ctxTypeSecondary?: ImageContextResourceExtended
  ctxIdSecondary?: Id
  highlightedIds?: Id[]
}
