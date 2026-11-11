import { expect, it } from 'vitest'
import { submissionErrorMessage } from '#lib/forms/submissionError.js'
it('preserves remote HTTP messages that are not Error instances', () => {
  expect(
    submissionErrorMessage({
      status: 409,
      body: { message: 'The location changed. Reload and retry.' },
    }),
  ).toBe('The location changed. Reload and retry.')
  expect(submissionErrorMessage(new Error('Network unavailable'))).toBe(
    'Network unavailable',
  )
  expect(submissionErrorMessage({ status: 500 })).toBe('Save failed (HTTP 500).')
  expect(
    submissionErrorMessage({ submittedValues: { secret: 'never display' } }),
  ).toBeUndefined()
})
