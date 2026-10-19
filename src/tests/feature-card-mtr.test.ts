// TESTING
import { describe, expect, it } from 'vitest'
// PRESENTATION
import { getFeatureMtrProperty } from '../lib/bits/patterns/cards/featureCard/featureCardMtr'
// ROUTING
import { mtrCatalog } from '../lib/routing/mtr'

const exit = mtrCatalog.exits[0]
const station = mtrCatalog.stations.find(item => item.id === exit.station)
if (!station) throw new Error('Catalog fixture has no station')
const feature = { mtrStation: station.id, mtrExit: exit.id, mtrDistance: 301 }

describe('core MTR card field', () => {
  it('formats the same station, entrance and metres for either card layout', () => {
    const field = getFeatureMtrProperty(feature, 'en')
    if (!field) throw new Error('Expected core MTR field')
    expect(field.id).toBe('core-mtr-access')
    expect(field.value).toContain(station.name)
    expect(field.value).toContain(exit.ref || '—')
    expect(field.value).toContain('301')
    expect(
      getFeatureMtrProperty({ ...feature, mtrDistance: 0 }, 'en')?.value,
    ).toContain('0')
  })

  it('uses the Chinese station name for either Chinese locale', () => {
    for (const locale of ['zh-hant', 'zh-hans'])
      expect(getFeatureMtrProperty(feature, locale)?.value).toContain(
        station.nameZh || station.name,
      )
  })

  it('omits unavailable access rather than inventing a station or distance', () => {
    expect(getFeatureMtrProperty({ ...feature, mtrDistance: null }, 'en')).toBeNull()
    expect(
      getFeatureMtrProperty({ ...feature, mtrStation: 'missing' }, 'en'),
    ).toBeNull()
    expect(getFeatureMtrProperty({ ...feature, mtrExit: 'missing' }, 'en')).toBeNull()
  })
})
