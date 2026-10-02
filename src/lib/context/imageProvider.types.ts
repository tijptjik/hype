// TYPES
import type { ImageContextResource, ImageContextResourceExtended } from '#lib/enums.js'
import type { HubDB } from '#lib/db/zod/schema/hub.types.js'
import type { OrganisationDB } from '#lib/db/zod/schema/organisation.types.js'
import type { ProjectDB } from '#lib/db/zod/schema/project.types.js'
import type { Id } from '#lib/types.js'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'

export type NormalizedImageUploadAsset = {
  file: File
  originalFilename: string
  originalExtension: string | null
  originalWidth: number | null
  originalHeight: number | null
  uploadedWidth: number | null
  uploadedHeight: number | null
  wasResized: boolean
}

export interface ImageContextConfig {
  ctxType?: ImageContextResource
  ctxId?: Id
  hub?: HubDB
  organisation?: OrganisationDB
  project?: ProjectDB
  ctxTypeSecondary?: ImageContextResourceExtended
  ctxIdSecondary?: Id
}

export interface ImageCtxConstructorOptions {
  isAdminMode?: boolean
  isValid?: boolean
  context?: ImageContextConfig | null
  image?: ImageCtxEnvelope | null
  images?: ImageCtxEnvelope[] | null
  highlightedIds?: Id[]
  isFullScreen?: boolean
}

export interface ImageProviderSyncTarget {
  state: {
    activeImage: ImageCtxEnvelope | null
    images: Map<Id, ImageCtxEnvelope>
  }
  setContext: (options: {
    context?: ImageContextConfig | null
    image?: ImageCtxEnvelope | null | undefined
    images?: ImageCtxEnvelope[] | null
    highlightedIds?: Id[]
    clearActiveImageOnContextChange?: boolean
  }) => Promise<void>
  refreshImages: (targetImageId?: string) => Promise<void>
  target: (imageId: Id) => ImageCtxEnvelope | undefined
  setTargetImageId: (imageId: Id | null) => void
  setMode: (mode: 'fullscreen' | 'normal') => void
}

export interface ImageProviderModel {
  getInitialOptions: () => ImageCtxConstructorOptions
  sync: (imageCtx: ImageProviderSyncTarget) => void
}
