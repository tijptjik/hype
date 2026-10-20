// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte/pure'
import { afterEach, expect, it } from 'vitest'
import FeaturePropertyValue from '#lib/bits/patterns/cards/featureCard/components/content/FeaturePropertyValue.svelte'
import { getFeaturePropertyDisplay, getFPI18n } from '#lib/i18n.js'
import type { FeatureProperty } from '#lib/db/zod/schema/feature.types.js'
import type { UserPreferences } from '#lib/db/zod/schema/user.types.js'
afterEach(cleanup)
it('formats international and local HK phone values into callable card links', () => {
  const property = {
    value: '["+31613401674","23456789"]',
    property: { component: 'PhoneField' },
  } as unknown as FeatureProperty
  const preferences = {} as UserPreferences
  const display = getFeaturePropertyDisplay(property, preferences)
  render(FeaturePropertyValue, { display, value: getFPI18n(property, preferences) })
  expect(
    screen.getByRole('link', { name: '+31 6 13401674' }).getAttribute('href'),
  ).toBe('tel:+31613401674')
  expect(
    screen.getByRole('link', { name: '+852 2345 6789' }).getAttribute('href'),
  ).toBe('tel:+85223456789')
  expect(getFPI18n(property, preferences)).toBe('+31 6 13401674, +852 2345 6789')
})
