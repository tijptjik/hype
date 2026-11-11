// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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
  await fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Title · English' }))
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
  ).toBeUndefined()
  await fireEvent.click(screen.getByRole('button', { name: 'Title · English' }))
  input = await screen.findByRole('textbox', { name: 'Title · English' })
  await fireEvent.input(input, { target: { value: 'Independent title' } })
  await fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByText('Independent title')).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: 'Use name' }))
  expect(screen.getByText('Garden — donor')).toBeTruthy()
  expect(screen.getByText('Managed by location')).toBeTruthy()
})
