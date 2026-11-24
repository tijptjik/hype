import { test, expect } from '@playwright/test'
import { join } from 'node:path'

test('map footprint opens a review draft and survives save/reload', async ({
  page,
}) => {
  test.setTimeout(240000)
  page.setDefaultTimeout(30000)
  await page.goto('/admin/locations/IssVInhZb-Gd#interior')
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  const created = await page.evaluate(async () => {
    const { getProjects } = await import('/src/lib/api/project.remote.ts')
    const result = await getProjects({ meta: { isAdminRequest: true } })
    const projects = result.items ?? result.data ?? result
    const { createLocalLocation } = await import('/src/lib/api/location.remote.ts')
    return createLocalLocation({
      projectId: projects[0].id,
      state: 'manual',
      kind: 'building',
      facts: {
        names: { en: 'Footprint UI fixture ' + Date.now() },
        phoneNumber: [],
        brands: [],
        location: {
          geometry: { type: 'Point', coordinates: [114.1695, 22.3193] },
          address: {
            status: 'unresolved',
            address2dId: null,
            address3dId: null,
            address3dUnitId: null,
            snapshotId: null,
            rawSource: {},
            fallbackDisplay: {},
          },
        },
      },
    })
  })
  await page.goto('/admin/locations/' + created.locationId + '#interior')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose from map' })).toBeEnabled({
    timeout: 60000,
  })
  await expect(page.locator('input[type=file]')).toBeVisible()
  await page.getByRole('button', { name: 'Choose from map' }).click()
  const map = page.getByRole('region', { name: 'Building footprint map' })
  await expect(map).toBeVisible({ timeout: 60000 })
  await expect(
    page.getByRole('button', { name: 'Use footprint', exact: true }),
  ).toBeDisabled()
  const candidates = page
    .getByRole('group', { name: 'Nearby building footprints' })
    .getByRole('button')
  await expect(candidates.first()).toBeVisible()
  // Click actual rendered map geometry; list selection alone would not verify hit testing.
  const canvas = map.locator('canvas')
  const box = await canvas.boundingBox()
  for (const [x, y] of [
    [0.5, 0.5],
    [0.45, 0.45],
    [0.55, 0.55],
    [0.4, 0.5],
    [0.6, 0.5],
    [0.5, 0.4],
    [0.5, 0.6],
    [0.35, 0.35],
    [0.65, 0.65],
  ]) {
    await canvas.click({ position: { x: box.width * x, y: box.height * y } })
    if (await page.getByText(/^Selected:/).count()) break
    await page.waitForTimeout(500)
  }
  await expect(page.getByText(/^Selected:/)).toBeVisible()
  await page.getByLabel('Floor name', { exact: true }).fill('Ground floor test')
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'interior-footprint-map.png'),
  })
  await page.getByRole('button', { name: 'Use footprint', exact: true }).click()
  await expect(page.getByLabel('Floor label', { exact: true })).toHaveValue(
    'Ground floor test',
    { timeout: 60000 },
  )
  await expect(page.getByText('Map footprint only.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save interior draft' })).toBeDisabled()
  await page
    .getByRole('checkbox', { name: 'I reviewed the extracted geometry and labels.' })
    .check()
  await page.getByRole('button', { name: 'Save interior draft' }).click()
  await expect(page.getByText('Interior draft saved.', { exact: false })).toBeVisible({
    timeout: 30000,
  })
  await page.reload()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Floor label', { exact: true })).toHaveValue(
    'Ground floor test',
    { timeout: 30000 },
  )
  const saved = await page.evaluate(async locationId => {
    const { getLocationInterior } = await import(
      '/src/lib/api/locationInterior.remote.ts'
    )
    return await getLocationInterior({ locationId })
  }, created.locationId)
  expect(saved.map.publishedHash).toBeNull()
  expect(saved.bundle.data.sourceDataset).toMatch(/^footprint:/)
  expect(saved.review.pages).toEqual(['footprint.svg'])
  expect(saved.review.extraction.floors[0].units).toEqual([])
  const source = await page.request.get(
    `/api/locations/${created.locationId}/interior/jobs/${saved.review.jobId}/footprint.svg`,
  )
  expect(source.ok()).toBe(true)
  expect(source.headers()['content-type']).toBe('image/svg+xml')
  await expect(page.getByRole('button', { name: 'Choose from map' })).toBeDisabled()
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'interior-footprint-reopened.png'),
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Window Too Small' })).toBeVisible()
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'interior-mobile-size-gate.png'),
  })
  await page.setViewportSize({ width: 1200, height: 900 })
  await page
    .getByRole('checkbox', { name: 'Start a replacement floor plan for this draft' })
    .check()
  await page.getByRole('button', { name: 'Choose from map' }).click()
  await expect(page.getByLabel('Floor name', { exact: true })).toBeVisible({
    timeout: 60000,
  })
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'interior-footprint-narrow.png'),
  })
  await page.getByRole('button', { name: 'Cancel map selection' }).click()
  await expect(page.getByLabel('Floor label', { exact: true })).toHaveValue(
    'Ground floor test',
  )
})
