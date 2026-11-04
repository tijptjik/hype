// @vitest-environment jsdom
// TESTS
import { cleanup, fireEvent, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// COMPONENTS
import LocationTaskPreview from '#lib/bits/patterns/forms/featureLocation/LocationTaskPreview.svelte'
// DOMAIN
import { locationTaskPreviewSelection } from '#lib/locations/taskPreview.js'
import {
  getAdminFacetTabsForResource,
  getAdminFacetActionLabel,
} from '#lib/navigation/facets.js'
import { FirstClassResource } from '#lib/enums.js'
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('labels the Feature tab and navigation action Location and uses the location navigation key', () => {
  expect(
    getAdminFacetTabsForResource(FirstClassResource.feature).get('location')?.label,
  ).toBe('Location')
  expect(getAdminFacetActionLabel(FirstClassResource.feature, 'location')).toBe(
    'Location',
  )
})

it('offers four clearly marked queue examples linked to the matching editor preview', () => {
  const view = render(LocationTaskPreview, {
    surface: 'queue',
    featureId: 'sample-feature',
  })
  expect(view.getAllByRole('article')).toHaveLength(4)
  expect(view.getByText('Preview data only. No changes are saved.')).toBeTruthy()
  const links = view.getAllByRole('link', { name: 'Review' })
  expect(links.map(link => link.getAttribute('href'))).toEqual(
    ['facts', 'position', 'identity', 'merge'].map(
      kind => `/admin/features/sample-feature?locationTaskPreview=${kind}#location`,
    ),
  )
})

it('requires a reason and keeps a preview decision in component state only', async () => {
  const view = render(LocationTaskPreview, {
    surface: 'editor',
    selection: 'facts',
    featureId: 'sample-feature',
  })
  expect(view.getAllByRole('article')).toHaveLength(1)
  const accept = view.getByRole('button', {
    name: 'Accept preview',
  }) as HTMLButtonElement
  expect(accept.disabled).toBe(true)
  await fireEvent.input(view.getByRole('textbox'), {
    target: { value: 'Reviewed the mock comparison' },
  })
  expect(accept.disabled).toBe(false)
  await fireEvent.click(accept)
  expect(view.getByRole('status').textContent).toBe('Accepted')
  cleanup()
  const fresh = render(LocationTaskPreview, {
    surface: 'editor',
    selection: 'facts',
    featureId: 'sample-feature',
  })
  expect(fresh.queryByRole('status')).toBeNull()
  expect(locationTaskPreviewSelection('arbitrary')).toBeNull()
})
