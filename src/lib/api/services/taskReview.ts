// TYPES
import type { TaskType as TaskTypeEnum } from '#lib/enums.js'

export type TaskType = `${TaskTypeEnum}`

export const reviewActions = [
  'ignored',
  'set-unpublished',
  'set-intangible',
  'set-archived',
  'added-all-photos',
  'added-all-photos-with-intent',
  'added-feature',
] as const

export type ReviewAction = (typeof reviewActions)[number]
