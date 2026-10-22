import { describe, expect, it } from 'vitest'
import {
  lifecycleStatusesForKind,
  LIFECYCLE_STATUSES,
} from '#lib/locations/lifecycle.js'

describe('kind-dependent directory lifecycle choices', () => {
  it('keeps business and physical-building lifecycles separate', () => {
    expect(lifecycleStatusesForKind('establishment')).toEqual([
      'unknown',
      'open',
      'temporarily_closed',
      'permanently_closed',
    ])
    expect(lifecycleStatusesForKind('building')).toEqual([
      'unknown',
      'standing',
      'demolished',
    ])
    expect(lifecycleStatusesForKind('')).toEqual(LIFECYCLE_STATUSES)
  })
  it.each(['unknown', 'premises', 'address', 'natural'] as const)(
    'does not invent lifecycle statuses for %s',
    kind => {
      expect(lifecycleStatusesForKind(kind)).toEqual(['unknown'])
    },
  )
})
