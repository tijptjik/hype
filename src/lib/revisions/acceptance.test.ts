import { describe, expect, it } from 'vitest'
import { prepareFeatureAcceptance } from './acceptance'

const base = { featureId: 'f', revisionId: 'p1', content: { en: 'Old', zh: '舊' } }
const submitted = {
  featureId: 'f',
  revisionId: 'candidate',
  proposalId: 'proposal',
  baseRevisionId: 'p1',
  content: { en: 'New', zh: '舊' },
}
const validate = () => []

it('uses the same dependent-value policy for comparison and reviewed resolution', () => {
  const location = { locationId: 'place', factsRevisionId: 'facts' }
  const comparison = {
    base: { ...base, content: { location } },
    published: {
      ...base,
      revisionId: 'new-head',
      content: { location: { ...location, locationId: 'other' } },
    },
    submitted: {
      ...submitted,
      content: { location: { ...location, factsRevisionId: 'new-facts' } },
    },
    mergePolicy: {
      isAtomic: (path: readonly string[]) =>
        path.length === 1 && path[0] === 'location',
    },
    validate,
  }
  expect(prepareFeatureAcceptance(comparison).status).toBe('conflict')
  expect(
    prepareFeatureAcceptance({
      ...comparison,
      resolutions: [{ path: ['location'], result: { present: true, value: location } }],
    }),
  ).toMatchObject({
    status: 'ready',
    plan: { result: { kind: 'merge', content: { location } } },
  })
  expect(prepareFeatureAcceptance({ ...comparison, resolutions: [] }).status).toBe(
    'invalid',
  )
})

describe('acceptance publishes a reviewed proposal', () => {
  it('promotes a candidate directly when published content has not advanced', () => {
    expect(
      prepareFeatureAcceptance({ base, published: base, submitted, validate }),
    ).toEqual({
      status: 'ready',
      plan: {
        proposalId: 'proposal',
        featureId: 'f',
        expectedPublishedRevisionId: 'p1',
        expectedSubmittedRevisionId: 'candidate',
        result: {
          kind: 'promote',
          revisionId: 'candidate',
          content: submitted.content,
        },
      },
    })
  })
  it('records both parents and exact publication guards after concurrent acceptance', () => {
    const published = { ...base, revisionId: 'p2', content: { en: 'Old', zh: '新' } }
    expect(prepareFeatureAcceptance({ base, published, submitted, validate })).toEqual({
      status: 'ready',
      plan: {
        proposalId: 'proposal',
        featureId: 'f',
        expectedPublishedRevisionId: 'p2',
        expectedSubmittedRevisionId: 'candidate',
        result: {
          kind: 'merge',
          mainlineParentRevisionId: 'p2',
          proposalParentRevisionId: 'candidate',
          content: { en: 'New', zh: '新' },
        },
      },
    })
  })
  it('does not issue a publishable plan for overlapping edits or invalid domain combinations', () => {
    expect(
      prepareFeatureAcceptance({
        base,
        published: { ...base, revisionId: 'p2', content: { en: 'Other', zh: '舊' } },
        submitted,
        validate,
      }).status,
    ).toBe('conflict')
    expect(
      prepareFeatureAcceptance({
        base,
        published: base,
        submitted,
        validate: () => ['Two canonical images'],
      }),
    ).toEqual({ status: 'invalid', errors: ['Two canonical images'] })
  })
  it('does not permit cross-feature identity changes through ordinary acceptance', () => {
    expect(
      prepareFeatureAcceptance({
        base,
        published: base,
        submitted: { ...submitted, featureId: 'other' },
        validate,
      }).status,
    ).toBe('invalid')
  })
  it('rejects inconsistent base evidence and reusing the published revision as a candidate', () => {
    expect(
      prepareFeatureAcceptance({
        base,
        published: { ...base, content: { en: 'Wrong', zh: '舊' } },
        submitted,
        validate,
      }).status,
    ).toBe('invalid')
    expect(
      prepareFeatureAcceptance({
        base,
        published: base,
        submitted: { ...submitted, revisionId: 'p1' },
        validate,
      }).status,
    ).toBe('invalid')
  })
})

it('retains explicit resolution evidence and validates the resolved content', () => {
  const resolutions = [
    { path: ['en'], result: { present: true as const, value: 'Reviewer choice' } },
  ]
  const result = prepareFeatureAcceptance({
    base,
    published: { ...base, revisionId: 'p2', content: { en: 'Other', zh: '舊' } },
    submitted,
    resolutions,
    validate,
  })
  expect(result).toMatchObject({
    status: 'ready',
    plan: {
      resolutions,
      expectedPublishedRevisionId: 'p2',
      result: { kind: 'merge', content: { en: 'Reviewer choice', zh: '舊' } },
    },
  })
})
