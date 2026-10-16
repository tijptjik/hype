// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/FormProfileLoadingFixture.svelte'

beforeEach(() => {
  vi.useRealTimers()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  HTMLElement.prototype.getAnimations = vi.fn(() => [])
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations
})

it('shows a non-interactive profile skeleton while the form is unavailable', () => {
  const { container } = render(Fixture)
  expect(screen.getByRole('status').textContent).toContain('Loading resources')
  expect(container.querySelector('form')).toBeNull()
  expect(
    container.querySelectorAll('[data-form-skeleton] .bits-form__field'),
  ).toHaveLength(11)
  expect(
    container.querySelectorAll('[data-form-skeleton] .bits-form__user-card-root'),
  ).toHaveLength(3)
  expect(
    container.querySelectorAll('input, textarea, button, [tabindex="0"]'),
  ).toHaveLength(0)
})

it('replaces loading content with the form and restores placeholders on a subsequent load', async () => {
  const view = render(Fixture)
  await view.rerender({ ready: true })
  await waitFor(() => expect(view.container.querySelector('form')).not.toBeNull())
  expect(view.container.querySelector('[data-form-skeleton]')).toBeNull()
  expect(view.container.querySelectorAll('textarea')).toHaveLength(3)
  await view.rerender({ ready: false })
  expect(await screen.findByRole('status')).toBeTruthy()
  expect(view.container.querySelector('form')).toBeNull()
})
