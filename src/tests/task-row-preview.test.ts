// @vitest-environment jsdom
// TESTING
import { cleanup, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// COMPONENTS
import TaskRow from '#lib/bits/patterns/resource/rows/TaskRow/TaskRow.svelte'

// Keep the actual row's reactive display selection; omit its unrelated layout and media children.
vi.mock('#lib/bits/custom/index.js', async () => ({
  Row: (await import('./fixtures/components/TaskRowTextFixture.svelte')).default,
}))
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('shows proposal text before acceptance and retained evidence after completion', async () => {
  const entity = {
    id: 'task',
    type: 'newFeature',
    featureId: null,
    creationProposal: {
      content: {
        translations: {
          en: {
            title: { value: 'Submitted title', generated: false },
            description: { value: null, generated: false },
            address: { value: 'Submitted address', generated: false },
          },
        },
      },
    },
    feature: null,
  }
  const adminCtx = {
    view: { getUserPreferences: () => ({ locale: 'en', locales: ['en'] }) },
  }
  const view = render(TaskRow, { entity, adminCtx, index: 0 } as never)
  expect(screen.getByRole('heading')).toHaveTextContent('Submitted title')
  expect(screen.getByText('Submitted address')).toBeTruthy()
  await view.rerender({
    entity: {
      ...entity,
      isReviewed: true,
      featureId: 'accepted',
      feature: {
        i18n: { en: { title: 'Later title', displayAddress: 'Later address' } },
      },
    },
  } as never)
  expect(screen.getByRole('heading')).toHaveTextContent('Submitted title')
  expect(screen.getByText('Submitted address')).toBeTruthy()
  expect(screen.queryByText('Later title')).toBeNull()
})

it('uses the accepted Feature text for tasks without a creation proposal', () => {
  render(TaskRow, {
    adminCtx: {
      view: { getUserPreferences: () => ({ locale: 'en', locales: ['en'] }) },
    },
    entity: {
      id: 'task',
      type: 'newPhoto',
      featureId: 'feature',
      feature: {
        i18n: { en: { title: 'Accepted title', displayAddress: 'Accepted address' } },
      },
    },
    index: 0,
  } as never)
  expect(screen.getByRole('heading')).toHaveTextContent('Accepted title')
  expect(screen.getByText('Accepted address')).toBeTruthy()
})
