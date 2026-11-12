import { describe, expect, it } from 'vitest'
import {
  researchErrorMessage,
  researchStackLayout,
} from '../lib/fieldResearch/presentation.js'

describe('research stack presentation', () => {
  it('centers the single top photo above the pair in a three-photo stack', () => {
    const layout = researchStackLayout(3)
    expect(layout.positions).toEqual([
      { x: 38, y: 0 },
      { x: 3, y: 76 },
      { x: 73, y: 76 },
    ])
  })
  it('keeps odd stacks centered and galleries within three rows', () => {
    for (let count = 1; count <= 101; count++) {
      const layout = researchStackLayout(count)
      expect(layout.height).toBeLessThanOrEqual(228)
      if (count % 2) {
        expect(layout.positions[0].x + 32).toBe(layout.width / 2)
        expect(layout.positions.filter(position => position.y === 0)).toHaveLength(1)
      }
    }
  })
  it('explains auth and malformed server responses without exposing parser errors', () => {
    expect(
      researchErrorMessage(
        new Error(
          'JSON.parse: unexpected character at line 1 column 1 of the JSON data',
        ),
      ),
    ).toBe('The server returned an unexpected response. Please try again.')
    expect(researchErrorMessage({ body: { message: 'UNAUTHENTICATED' } })).toBe(
      'Your sign-in could not be verified. Please try again or sign in again.',
    )
  })
  it('unwraps remote validation messages for toasts', () => {
    expect(
      researchErrorMessage(
        new Error(
          JSON.stringify({
            status: 400,
            message: 'Choose a Feature type for every stack before saving.',
          }),
        ),
      ),
    ).toBe('Choose a Feature type for every stack before saving.')
    expect(researchErrorMessage({ body: { message: 'Try again.' } })).toBe('Try again.')
    expect(researchErrorMessage({ status: 500 })).toBe(
      'Something went wrong. Please try again.',
    )
  })
})
