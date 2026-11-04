// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Details from '#lib/bits/patterns/forms/localLocationAddress/LocationRecordDetails.svelte'
import type { LocationResource } from '#lib/locations/resource.js'
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('separates owner names, readable dates and explicitly labeled revision identifiers', async () => {
  const place: LocationResource = {
    id: 'location-id',
    ssId: null,
    kind: 'unknown',
    sourceReference: null,
    state: 'unresolved',
    sourceAvailability: 'current',
    ownerOrganisationId: 'org-id',
    ownerOrganisationNames: { en: 'Short org' },
    editingOrganisationId: 'org-id',
    editingOrganisationNames: { en: 'Short org' },
    revisionId: 'baseline-token',
    organisationRevision: 'correction-token',
    facts: null,
    metadata: {
      createdAt: '2026-10-21T08:14:39.668Z',
      revisionCreatedAt: '2026-10-21T08:14:39.668Z',
      origin: 'local',
      version: 1,
      apiVersion: null,
      releaseId: null,
      snapshotId: null,
    },
  }
  const view = render(Details, { place })
  expect(view.getByRole('link', { name: 'Short org' }).getAttribute('href')).toBe(
    '/admin/organisations/org-id',
  )
  expect(view.container.querySelector('time')?.textContent).toContain('21 Oct 2026')
  expect(view.container.querySelector('time')?.getAttribute('datetime')).toBe(
    place.metadata?.createdAt,
  )
  expect(view.getByText('Baseline version')).toBeTruthy()
  expect(view.getByText('Locally authored')).toBeTruthy()
  await fireEvent.click(view.getByText('Record identifiers'))
  expect(view.getByText('Location revision ID')).toBeTruthy()
  expect(
    view.getByText('Organisation correction revision ID').getAttribute('data-tooltip'),
  ).toContain('not an organisation ID')
  expect(view.queryByText('Revision · Organisation')).toBeNull()
})
