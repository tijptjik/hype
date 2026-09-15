// TYPES
import { TaskType as TaskTypeEnum, TaskReviewOutcome } from '$lib/enums'

const taskTypes = Object.values(TaskTypeEnum)

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

const reportedMissingActions = [
  'ignored',
  'set-archived',
  'set-unpublished',
  'set-intangible',
] as const

type ReportedMissingAction = (typeof reportedMissingActions)[number]

const newPhotoActions = [
  'ignored',
  'added-all-photos',
  'added-all-photos-with-intent',
] as const

type NewPhotoAction = (typeof newPhotoActions)[number]

const newFeatureActions = ['ignored', 'added-feature'] as const

type NewFeatureAction = (typeof newFeatureActions)[number]

const reviewOutcomes = Object.values(TaskReviewOutcome)

type ReviewOutcome = `${TaskReviewOutcome}`
