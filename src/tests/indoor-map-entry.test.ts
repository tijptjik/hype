import { describe, expect, test } from 'bun:test'
import { indoorEntryNavigationKey } from '../lib/indoor/mapEntry'

const origin =
  'http://hype.localhost/?mapTracking=true&lng=114.12825&lat=22.28121&zoom=18.99&bearing=-83.3&pitch=60'

describe('indoor entry navigation guard', () => {
  test('allows the approach animation to update every tracked camera parameter', () => {
    const approached = new URL(origin)
    for (const key of ['lng', 'lat', 'zoom', 'bearing', 'pitch']) {
      approached.searchParams.set(key, '1')
    }
    expect(indoorEntryNavigationKey(approached.href)).toBe(
      indoorEntryNavigationKey(origin),
    )
  })

  test('still cancels entry after route, selection, filter or hash navigation', () => {
    for (const change of [
      '/premises/hong-kong-mtr',
      '/?featureId=another-feature',
      '/?projectId=another-project',
      '/?mapTracking=true#another-view',
    ]) {
      expect(indoorEntryNavigationKey(new URL(change, origin).href)).not.toBe(
        indoorEntryNavigationKey(origin),
      )
    }
  })
})
