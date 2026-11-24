import { expect, test } from 'bun:test'
import { reviewedDonorCuration } from './lib/donor-curation'

test('operator decisions survive changing source facts without crossing namespaces', () => {
  for (const sourcePhone of [null, '', '23456789']) {
    const correction = reviewedDonorCuration('donors', '767')
    expect(correction?.phoneNumber ?? sourcePhone).toEqual(['+85229722222'])
  }
  expect(reviewedDonorCuration('donors', '768')?.operatingStatus).toBe(
    'permanently_closed',
  )
  expect(reviewedDonorCuration('dropoffs', '767')).toBeNull()
  expect(reviewedDonorCuration('donors', 'other')).toBeNull()
  expect(reviewedDonorCuration('donors', 'toString')).toBeNull()
})
