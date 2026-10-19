// @vitest-environment jsdom
// TESTING
import { describe, expect, it } from 'vitest'
// PRESENTATION
import { countryFlagCodes } from '#lib/features/countryFlags.js'
import { resolveMarkerStyle } from '#lib/features/markerStyle.js'
import {
  customMarkerModel,
  customMarkerSignature,
  createCustomMarkerElement,
} from '#lib/map/customMarkers.js'
import { ProjectEntityFormData } from '#lib/db/zod/schema/project.js'
import { LayerMetadataSchema } from '#lib/db/zod/schema/layer.js'
import { toProjectSubmittedFields } from '#lib/api/services/authz/project.js'

const feature = {
  properties: [
    { property: { key: 'country' }, propertyValue: { value: 'Belgium & Slovenia' } },
    {
      property: { key: 'brand' },
      propertyValue: { i18n: { en: { value: "Maxim's" } } },
    },
  ],
}

describe('marker presentation', () => {
  it('inherits layer and project styles with an application default and rejects unknown renderer codes', () => {
    expect(resolveMarkerStyle('flag', 'pin')).toBe('image')
    expect(resolveMarkerStyle('pin', null)).toBe('image')
    expect(resolveMarkerStyle('flag', null)).toBe('flag')
    expect(resolveMarkerStyle(null, undefined, 'dot')).toBe('dot')
    expect(resolveMarkerStyle('unknown', 'unknown')).toBe('image')
    expect(
      ProjectEntityFormData.pick({ markerStyleCode: true }).parse({
        markerStyleCode: '',
      }).markerStyleCode,
    ).toBeNull()
    expect(LayerMetadataSchema.safeParse({ markerStyleCode: '<script>' }).success).toBe(
      false,
    )
    expect(toProjectSubmittedFields({ markerStyleCode: 'flag' })).toContain(
      'markerStyleCode',
    )
  })
  it('reads country property values including mixed countries, ISO codes and missing values', () => {
    expect(countryFlagCodes('Belgium & Slovenia')).toEqual(['be', 'si'])
    expect(countryFlagCodes('The Netherlands')).toEqual(['nl'])
    expect(countryFlagCodes('FR')).toEqual(['fr'])
    expect(countryFlagCodes('France')).toEqual(['fr'])
    expect(countryFlagCodes('unmapped country')).toEqual([])
    const model = customMarkerModel('flag', { feature, imageSrc: '/photo.jpg' })!
    const element = createCustomMarkerElement(model)
    expect(
      [...element.querySelectorAll('img')].map(image => image.getAttribute('src')),
    ).toEqual(['/flags/be.svg', '/flags/si.svg', '/photo.jpg'])
  })
  it('never uses feature photos for Breadline markers and invalidates all operational states', () => {
    const model = customMarkerModel('breadline', { feature, imageSrc: '/shop.jpg' })!
    expect(model.badge).toBe('美心')
    expect(createCustomMarkerElement(model).innerHTML).not.toContain('/shop.jpg')
    expect(model.state).toMatchObject({
      yield: 'unknown',
      source: 'estimated',
      claimed: false,
    })
    const claimed = customMarkerModel('breadline', {
      feature,
      imageSrc: '/shop.jpg',
      state: { yield: 'high', source: 'reported', claimed: true },
    })!
    expect(customMarkerSignature(claimed)).not.toBe(customMarkerSignature(model))
    expect(
      createCustomMarkerElement(claimed).querySelector('[data-claimed="true"]'),
    ).not.toBeNull()
    const dropoff = customMarkerModel('breadline', {
      feature,
      imageSrc: null,
      state: { yield: 'none', source: 'estimated', claimed: false, dropoff: true },
    })!
    expect(createCustomMarkerElement(dropoff).textContent).toBe('↓')
    expect(
      customMarkerModel('breadline', {
        feature: { layerId: 'kin0shUTfrUi' },
        imageSrc: null,
      })?.state?.dropoff,
    ).toBe(true)
  })
  it('changes the flag signature when country or photo changes', () => {
    const a = customMarkerModel('flag', { feature, imageSrc: '/a.jpg' })!
    const b = customMarkerModel('flag', { feature, imageSrc: '/b.jpg' })!
    expect(customMarkerSignature(a)).not.toBe(customMarkerSignature(b))
    expect(
      createCustomMarkerElement(
        customMarkerModel('flag', { feature: {}, imageSrc: null })!,
      ).querySelector('img'),
    ).toBeNull()
  })
})
