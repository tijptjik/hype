// TYPES
import type { ResourceContext, Id } from '$lib/types'
import type { Image } from '$lib/db/zod/schema/image.types'

/* ----------------- */
// USER :: PROFILES
/* -------- */

type ContributedFeature = {
  id: string
  title: string
  displayAddress: string
  href: string
  hierarchy: ResourceContext
  createdAt: string
}

type ContributedImage = Image & {
  id: string
  href: string
  url: string
  hierarchy: ResourceContext
  createdAt: string
}

type GroupedFeatures = {
  [projectId: string]: {
    id: Id
    name: string
    code: string
    organisation: {
      name: string
      code: string
    }
    features: ContributedFeature[]
  }
}

type GroupedImages = {
  [projectId: string]: {
    id: Id
    name: string
    code: string
    organisation: {
      name: string
      code: string
    }
    images: ContributedImage[]
  }
}
