// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import FeatureTitleSource from '#lib/bits/patterns/forms/featureIntent/FeatureTitleSource.svelte'
import Fixture from './fixtures/components/FeatureRuleTitleFixture.svelte'
import { required } from './fixtures/required'
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  vi.useRealTimers()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
  if (!Element.prototype.getAnimations) Element.prototype.getAnimations = () => []
})
it('edits the resolved title without changing the submitted base and restores inheritance', async () => {
  const { container } = render(Fixture)
  expect(screen.getByText('Garden — donor')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Title · English' })).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Customize title' }))
  let input = await screen.findByRole('textbox', { name: 'Title · English' })
  await fireEvent.input(input, { target: { value: 'Independent title' } })
  expect(container.querySelector<HTMLInputElement>('[name="baseName"]')?.value).toBe(
    'Garden',
  )
  await fireEvent.keyDown(input, { key: 'Escape' })
  expect(
    JSON.parse(
      required(
        required(container.querySelector('[data-state]')).getAttribute('data-state'),
      ),
    ).override,
  ).toBe('Garden — donor')
  await fireEvent.click(screen.getByRole('button', { name: 'Title · English' }))
  input = await screen.findByRole('textbox', { name: 'Title · English' })
  await fireEvent.input(input, { target: { value: 'Independent title' } })
  await fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByText('Independent title')).toBeTruthy()
  expect(screen.getByText('Custom title')).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: 'Use template' }))
  expect(screen.getByText('Garden — donor')).toBeTruthy()
  expect(screen.getByText('Template · From location')).toBeTruthy()
})

it('keeps other languages automatic when one title is customized', async () => {
  const { container } = render(Fixture, { multilingual: true })
  await fireEvent.click(screen.getAllByRole('button', { name: 'Customize title' })[0])
  await screen.findByRole('textbox', { name: 'Title · English' })
  expect(screen.getByText('Custom title')).toBeTruthy()
  expect(
    container.querySelector('[data-profile-locale="zh-Hant"]')?.textContent,
  ).toContain('Template · From location')
  expect(screen.queryByRole('button', { name: 'Title · 繁體中文' })).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Use template' }))
  expect(screen.queryByText('Custom title')).toBeNull()
})

it('distinguishes direct location inheritance from a feature-based template', () => {
  const actions = {
    scopeId: 'layer',
    locale: 'en',
    editable: true,
    onCustomize: vi.fn(),
    onRestore: vi.fn(),
    onLocation: vi.fn(),
  }
  const direct = render(FeatureTitleSource, {
    ...actions,
    rule: { base: 'location', conditions: [] },
    fromLocation: true,
    required: true,
  })
  expect(screen.getByText('From location')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'View template' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Customize title' })).toBeNull()
  direct.unmount()
  render(FeatureTitleSource, { ...actions, rule: { base: 'feature', conditions: [] } })
  expect(screen.getByText('Template')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Customize title' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Go to location' })).toBeNull()
})
