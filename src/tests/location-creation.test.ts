import { describe, expect, it } from 'vitest'
import { LocationCreation } from '#lib/context/locationCreation.svelte.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

describe('Location creation handoff', () => {
  it('keeps the owning Feature checkpoint independent from editable Location values', () => {
    const handoff = new LocationCreation()
    const address = emptyFeatureAddress()
    const checkpoint = {
      data: { title: 'Unsaved Feature', address },
      setupStep: 4,
      facet: 'location',
    }
    handoff.open({
      accountId: 'account',
      projectId: 'project',
      organisationId: 'org',
      checkpoint,
      address,
      originalAddress: address,
      originalNames: { en: 'Original' },
      names: { en: 'Original' },
      kind: 'establishment',
      visibility: 'shared',
    })
    const current = handoff.current
    if (!current) throw new Error('Missing handoff')
    current.names.en = 'Reviewed'
    current.address.coordinates = [114, 22]
    expect(handoff.pending).toBe(true)
    expect(current.checkpoint).toEqual(checkpoint)
    expect(current.originalNames.en).toBe('Original')
    expect(current.originalAddress.coordinates).toBeNull()
    expect(address.coordinates).toBeNull()
    handoff.clear()
    expect(handoff.current).toBeNull()
    expect(handoff.pending).toBe(false)
  })
})
