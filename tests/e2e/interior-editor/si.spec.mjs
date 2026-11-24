import { test, expect } from '@playwright/test'
import { join } from 'node:path'

test('real Si extraction returns through HYPE and reopens as an unpublished draft', async ({
  page,
}) => {
  test.skip(
    process.env.FLOORPLAN_REAL_SOURCE !== '1',
    'Requires the retained original page and private Si development bindings',
  )
  test.setTimeout(1200000)
  page.setDefaultNavigationTimeout(60000)
  page.setDefaultTimeout(30000)
  await page.goto('/admin/locations/IssVInhZb-Gd#interior')
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  const created = process.env.FLOORPLAN_RESUME_LOCATION
    ? { locationId: process.env.FLOORPLAN_RESUME_LOCATION }
    : await page.evaluate(async () => {
        const { getProjects } = await import('/src/lib/api/project.remote.ts')
        const result = await getProjects({ meta: { isAdminRequest: true } })
        const project = (result.items ?? result.data ?? result)[0]
        const { createLocalLocation } = await import('/src/lib/api/location.remote.ts')
        return createLocalLocation({
          projectId: project.id,
          state: 'manual',
          kind: 'building',
          facts: {
            names: { en: 'Si extraction acceptance ' + Date.now() },
            phoneNumber: [],
            brands: [],
            location: {
              geometry: { type: 'Point', coordinates: [114.19, 22.33] },
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
  if (!process.env.FLOORPLAN_RESUME_LOCATION) {
    await expect(page.locator('input[type=file]')).toBeEnabled({ timeout: 30000 })
    await page
      .locator('input[type=file]')
      .setInputFiles(join(import.meta.dirname, 'real-source.png'))
  }
  await expect(
    page.getByRole('button', { name: 'Preview floors', exact: true }),
  ).toBeVisible({ timeout: 1100000 })
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Save interior draft' }).click()
  await expect(
    page.getByText(
      'Interior draft saved. It is ready to reopen or review for publication.',
      { exact: true },
    ),
  ).toBeVisible({ timeout: 30000 })
  await page.reload()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Preview floors', exact: true }),
  ).toBeVisible()
  const result = await page.evaluate(async id => {
    const { getLocationInterior } = await import(
      '/src/lib/api/locationInterior.remote.ts'
    )
    const result = await getLocationInterior({ locationId: id })
    return {
      locationId: id,
      jobId: result.review.jobId,
      floors: result.review.extraction.floors.length,
      spaces: result.bundle.data.unit_polygon.features.length,
      publishedHash: result.map.publishedHash,
    }
  }, created.locationId)
  expect(result.floors).toBeGreaterThan(0)
  expect(result.publishedHash).toBeNull()
  const { writeFile } = await import('node:fs/promises')
  await writeFile(
    join(process.env.DEV_RUNNER_ARTIFACTS, 'si-hype-acceptance.json'),
    JSON.stringify(result, null, 2),
  )
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'si-hype-interior.png'),
  })
})
