// TYPES
import type { Task } from '#lib/db/zod/index.js'
import type {
  ImageContextEnvelope,
  ImageCtxEnvelope,
} from '#lib/db/zod/schema/image.types.js'
import type { Resource } from '#lib/types.js'

/* ----------------- */
// ENTITY CARDS
/* -------- */

export type KeyMap = {
  id: 'id' | 'code' | string
  title: string
  subtitle?: string
  description?: string
  image: string
  tags?: string[]
  badges?: Array<{
    label: string
    variant?: 'primary' | 'secondary' | 'outline' | undefined
    type?: 'boolean'
    trueText?: string
    falseText?: string
    superAdminOnly?: boolean
  }>
}

type EntityWithOptionalImage = Exclude<Resource, Task> & {
  image?: ImageContextEnvelope | ImageCtxEnvelope | string | null
}
