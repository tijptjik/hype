import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'

const kit = createRequire(import.meta.resolve('@sveltejs/kit'))
const { parse, stringify } = await import(kit.resolve('devalue'))
const locationId = 'T6QiBRPPuk0w'

test('queues optimistic slice removals and restores a failed slice for retry', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')

  // Keep the shared Location intact while exercising the editor through its normal remote calls.
  let slices = ['B1', 'B2', 'B3'].map(modelId => ({
    modelId,
    sheet: 'sheet',
    evidenceKeys: [],
    footprintId: modelId,
    label: 'Slice ' + modelId,
  }))
  let assetId = 'initial'
  const reply = (route, value) =>
    route.fulfill({ json: { type: 'result', data: stringify({ _: value }) } })
  await page.route('**/_app/remote/*/getLocationExterior*', route =>
    reply(route, {
      slices,
      evidence: [],
      canImport: true,
      model: slices.length ? { assetId, url: '/slice-test-model.gltf' } : null,
    }),
  )
  await page.route('**/slice-test-model.gltf', route =>
    route.fulfill({
      json: {
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{}],
      },
    }),
  )
  await page.route('**/_app/remote/*/findLocationExteriorCandidates*', route =>
    reply(route, {
      candidates: ['B1', 'B2', 'B3'].map(id => ({ id })),
      footprints: { type: 'FeatureCollection', features: [] },
    }),
  )
  const requests = []
  const firstSave = Promise.withResolvers()
  await page.route('**/_app/remote/*/removeLocationExteriorSlice', async route => {
    const { payload } = route.request().postDataJSON()
    const input = parse(Buffer.from(payload, 'base64url').toString())
    expect(input.locationId).toBe(locationId)
    expect(input.expectedAssetId).toBe(assetId)
    expect(slices.some(slice => slice.modelId === input.modelId)).toBe(true)
    requests.push(input.modelId)
    if (input.modelId === 'B1') await firstSave.promise
    if (input.modelId === 'B2' && requests.length === 2) return route.abort()
    slices = slices.filter(slice => slice.modelId !== input.modelId)
    assetId = 'remaining-' + slices.length
    await reply(
      route,
      slices.length ? { assetId, url: '/slice-test-model.gltf' } : null,
    )
  })

  await page.goto(`/admin/locations/${locationId}?organisation=oDucgyH4H4Bm#exterior`, {
    waitUntil: 'domcontentloaded',
  })
  await page
    .getByRole('button', { name: 'Manage model associations' })
    .click({ timeout: 90_000 })
  const list = page.getByRole('region', { name: 'Building model slices' })
  const choices = page.getByRole('combobox', { name: 'Building model ID' })
  await choices.selectOption('B1')
  await expect(page.getByRole('button', { name: 'Already added' })).toBeDisabled()
  const mode = list.getByRole('button', { name: 'Slice deletion mode' })
  const removeButtons = list.getByRole('button', { name: /^Remove Slice/ })
  await expect(mode).toHaveAttribute('aria-pressed', 'false')
  await expect(removeButtons).toHaveCount(0)
  await mode.click()
  await expect(mode).toHaveAttribute('aria-pressed', 'true')
  await expect(removeButtons).toHaveCount(3)
  await mode.press('Space')
  await expect(removeButtons).toHaveCount(0)
  await expect(list.getByRole('listitem')).toHaveCount(3)
  await mode.click()
  await list.getByRole('button', { name: 'Remove Slice B1 from this location' }).click()
  await expect(list.getByRole('heading')).toHaveText(/Building slices\s*2/)
  await expect(choices.locator('option[value="B1"]')).not.toContainText('Added')
  await expect(choices.locator('option[value="B2"]')).toContainText('Added')
  await list.getByRole('button', { name: 'Remove Slice B2 from this location' }).click()
  await expect(list.getByRole('heading')).toHaveText(/Building slices\s*1/)
  await list.getByRole('button', { name: 'Remove Slice B3 from this location' }).click()
  await expect(list.getByRole('heading')).toHaveText(/Building slices\s*0/)
  await expect.poll(() => requests).toEqual(['B1'])
  firstSave.resolve()
  await expect(page.getByRole('alert')).toContainText('B2')
  await expect(
    page.getByRole('button', { name: 'Add slice to building' }),
  ).toBeEnabled()
  expect(requests).toEqual(['B1', 'B2', 'B3'])
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(choices.locator('option[value="B2"]')).toContainText('Added')
  await list.getByRole('button', { name: 'Remove Slice B2 from this location' }).click()
  await expect(list).toContainText('Added slices will appear here.')
  await expect(mode).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'View 3D model' })).toHaveCount(0)
  expect(requests).toEqual(['B1', 'B2', 'B3', 'B2'])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Associate 3D Models' })).toBeVisible({
    timeout: 60_000,
  })
})
