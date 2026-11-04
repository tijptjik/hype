// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import StatsPips from '#lib/bits/custom/featureStats/components/StatsPips.svelte'

beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('keeps delegated status labels and tri-state colors current without tooltip trees', async () => {
  const view = render(StatsPips, {
    title: 'Content',
    tooltipMode: 'native',
    statuses: { Published: true, 'No description': false, 'Translation pending': null },
  })
  expect(screen.getByRole('img', { name: 'Published' }).className).toContain('--ok')
  expect(screen.getByRole('img', { name: 'No description' }).className).toContain(
    '--error',
  )
  expect(screen.getByRole('img', { name: 'Translation pending' }).className).toContain(
    '--pending',
  )
  expect(
    screen.getByRole('img', { name: 'Published' }).getAttribute('data-tooltip'),
  ).toBe('Published')
  expect(view.container.querySelector('[data-tooltip-trigger]')).toBeNull()
  await view.rerender({
    title: 'Content',
    tooltipMode: 'native',
    statuses: { 'Not published': false },
  })
  expect(screen.queryByRole('img', { name: 'Published' })).toBeNull()
  expect(screen.getByRole('img', { name: 'Not published' }).className).toContain(
    '--error',
  )
})
