// DOMAIN
import {
  equalRevisionValue,
  mergeRevisionContent,
  resolveRevisionContent,
} from './merge'
// TYPES
import type {
  RevisionConflict,
  RevisionValue,
  RevisionResolution,
  RevisionMergePolicy,
} from './merge'
import type { FeatureRevisionRef } from './lineage'

export type SubmittedFeatureRevision = FeatureRevisionRef &
  Readonly<{
    proposalId: string
    baseRevisionId: string
    content: RevisionValue
  }>

export type FeatureAcceptancePlan = Readonly<{
  proposalId: string
  featureId: string
  expectedPublishedRevisionId: string
  expectedSubmittedRevisionId: string
  resolutions?: readonly RevisionResolution[]
  result:
    | { kind: 'promote'; revisionId: string; content: RevisionValue }
    | {
        kind: 'merge'
        mainlineParentRevisionId: string
        proposalParentRevisionId: string
        content: RevisionValue
      }
}>

export type FeatureAcceptanceResult =
  | { status: 'ready'; plan: FeatureAcceptancePlan }
  | { status: 'conflict'; conflicts: RevisionConflict[] }
  | { status: 'invalid'; errors: readonly string[] }

/**
 * Prepares a same-feature acceptance without losing intervening published edits.
 * @param input Exact server-loaded base, current public head and submitted snapshot.
 * @returns A conflict, invalid domain result, or a revision-fenced publication plan.
 * @remarks This is not authorization or persistence. The caller must authorize the
 * result and atomically compare both expected heads, write any merge revision,
 * publication/review events and public projections. A stale comparison must abort,
 * not be silently recomputed after a reviewer approved different evidence.
 */
export function prepareFeatureAcceptance(input: {
  base: FeatureRevisionRef & { content: RevisionValue }
  published: FeatureRevisionRef & { content: RevisionValue }
  submitted: SubmittedFeatureRevision
  resolutions?: readonly RevisionResolution[]
  mergePolicy?: RevisionMergePolicy
  validate: (content: RevisionValue) => readonly string[]
}): FeatureAcceptanceResult {
  const { base, published, submitted } = input
  if (
    base.featureId !== submitted.featureId ||
    published.featureId !== submitted.featureId ||
    base.revisionId !== submitted.baseRevisionId
  ) {
    return {
      status: 'invalid',
      errors: ['Proposal base and published head must belong to the same feature'],
    }
  }
  if (
    [
      base.featureId,
      base.revisionId,
      published.revisionId,
      submitted.revisionId,
      submitted.proposalId,
    ].some(id => !id.trim())
  ) {
    return {
      status: 'invalid',
      errors: ['Feature, proposal and revision identifiers are required'],
    }
  }
  if (
    submitted.revisionId === base.revisionId ||
    submitted.revisionId === published.revisionId
  ) {
    return {
      status: 'invalid',
      errors: ['Submitted revisions must be distinct immutable candidates'],
    }
  }
  if (
    base.revisionId === published.revisionId &&
    !equalRevisionValue(base.content, published.content)
  ) {
    return {
      status: 'invalid',
      errors: ['An immutable revision cannot have different content'],
    }
  }
  const merged = mergeRevisionContent(
    base.content,
    published.content,
    submitted.content,
    input.mergePolicy,
  )
  if (merged.status === 'conflict' && input.resolutions === undefined) return merged
  let content: RevisionValue
  if (input.resolutions !== undefined) {
    try {
      content = resolveRevisionContent(
        base.content,
        published.content,
        submitted.content,
        input.resolutions,
        input.mergePolicy,
      )
    } catch (cause) {
      return {
        status: 'invalid',
        errors: [
          cause instanceof Error ? cause.message : 'Invalid conflict resolution',
        ],
      }
    }
  } else if (merged.status === 'merged') {
    content = merged.value
  } else {
    return merged
  }
  // Field independence is insufficient: validate relationships and gallery invariants together.
  const errors = input.validate(content)
  if (errors.length) return { status: 'invalid', errors: [...errors] }
  return {
    status: 'ready',
    plan: {
      proposalId: submitted.proposalId,
      featureId: submitted.featureId,
      expectedPublishedRevisionId: published.revisionId,
      expectedSubmittedRevisionId: submitted.revisionId,
      ...(input.resolutions === undefined
        ? {}
        : { resolutions: structuredClone(input.resolutions) }),
      result:
        base.revisionId === published.revisionId
          ? { kind: 'promote', revisionId: submitted.revisionId, content }
          : {
              kind: 'merge',
              mainlineParentRevisionId: published.revisionId,
              proposalParentRevisionId: submitted.revisionId,
              content,
            },
    },
  }
}
