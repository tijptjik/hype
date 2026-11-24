import { test, expect } from '@playwright/test'
import { join } from 'node:path'
test('building interior uses an editable upload surface', async ({ page }) => {
  test.setTimeout(180000)
  await page.goto('/admin/locations/IssVInhZb-Gd#interior')
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  await expect(
    page.getByRole('heading', { name: 'Building interior', exact: true }),
  ).toBeVisible({ timeout: 60000 })
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByText('Upload floor plans', { exact: true })).toBeVisible()
  await expect(page.locator('input[type=file]')).toHaveAttribute(
    'accept',
    'application/pdf,image/png,image/jpeg',
  )
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'interior-upload.png'),
  })
})

test('service compartments remain distinct and uncovered space is flagged', async ({
  page,
}) => {
  test.setTimeout(180000)
  await page.goto('/admin/locations/IssVInhZb-Gd#interior')
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const job = '11111111-1111-4111-8111-111111111111'
  const extraction = {
    warnings: [],
    floors: [
      {
        id: 'first',
        label: 'First floor',
        page: 1,
        width: 100,
        height: 100,
        boundary: [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0],
        ],
        warnings: [],
        units: ['kitchen', 'toilet', 'lavatory'].map((category, index) => ({
          id: category,
          label: category,
          category,
          confidence: 0.8,
          evidence: 'Synthetic enclosed compartment',
          polygon: [
            [index * 30, 0],
            [index * 30 + 30, 0],
            [index * 30 + 30, 60],
            [index * 30, 60],
            [index * 30, 0],
          ],
        })),
      },
    ],
  }
  await page.route('**/interior/jobs', route =>
    route.fulfill({ status: 202, json: { id: job } }),
  )
  await page.route('**/interior/jobs/' + job, route =>
    route.fulfill({
      json: { status: 'needs-review', pages: ['page-1.png'], extraction },
    }),
  )
  await page.route('**/interior/jobs/' + job + '/page-1.png', route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/></svg>',
    }),
  )
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'synthetic.png',
      mimeType: 'image/png',
      buffer: Buffer.from('synthetic fixture'),
    })
  await expect(
    page.getByText('Amber areas remain unclassified.', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'kitchen · 80%' }).click()
  await expect(page.getByLabel('Part type', { exact: true })).toHaveValue('kitchen')
  await page.getByRole('button', { name: 'toilet · 80%' }).click()
  await expect(page.getByLabel('Part type', { exact: true })).toHaveValue('toilet')
  await page.getByRole('button', { name: 'lavatory · 80%' }).click()
  await expect(page.getByLabel('Part type', { exact: true })).toHaveValue('lavatory')
  await expect(page.getByRole('button', { name: 'Save interior draft' })).toBeDisabled()
  await page.getByRole('button', { name: 'Draw missing space' }).click()
  for (const [x, y] of [
    [70, 70],
    [90, 70],
    [90, 90],
    [70, 90],
  ]) {
    await page.getByLabel('X', { exact: true }).fill(String(x))
    await page.getByLabel('Y', { exact: true }).fill(String(y))
    await page.getByRole('button', { name: 'Add vertex', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Finish polygon' }).click()
  await page.getByLabel('Part label', { exact: true }).fill('Manual space')
  await page.getByLabel('Cut coordinate', { exact: true }).fill('80')
  await page.getByRole('button', { name: 'Split space', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Manual space · 0%', exact: true }),
  ).toHaveCount(2)
  await page
    .getByLabel('Merge with', { exact: true })
    .selectOption({ label: 'Manual space' })
  await page.getByRole('button', { name: 'Merge spaces', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Manual space · 0%', exact: true }),
  ).toHaveCount(1)
  await page.getByRole('button', { name: 'Preview floors', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Back to review', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back to review', exact: true }).click()
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'interior-compartments.png'),
  })
})

test('real upload saves and reopens a disposable local building draft', async ({
  page,
}) => {
  test.skip(
    process.env.FLOORPLAN_INTEGRATION !== '1',
    'Requires the finite worker fixture harness',
  )
  test.setTimeout(180000)
  await page.goto('/admin/locations/IssVInhZb-Gd#interior')
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  const created = await page.evaluate(async () => {
    const { getProjects } = await import('/src/lib/api/project.remote.ts')
    const result = await getProjects({ meta: { isAdminRequest: true } })
    const projects = result.items ?? result.data ?? result
    const project = Array.isArray(projects) ? projects[0] : null
    if (!project?.id)
      throw new Error('No local project available for disposable test building')
    const { createLocalLocation } = await import('/src/lib/api/location.remote.ts')
    return createLocalLocation({
      projectId: project.id,
      state: 'manual',
      kind: 'building',
      facts: {
        names: { en: 'Interior integration fixture ' + Date.now() },
        phoneNumber: [],
        brands: [],
        location: {
          geometry: { type: 'Point', coordinates: [114, 22] },
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
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    })
  await expect(
    page.getByRole('button', { name: 'Integration room · 100%' }),
  ).toBeVisible({ timeout: 60000 })
  await page.reload()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Integration room · 100%' }),
  ).toBeVisible()
  await page.getByText('Floor assignment and alignment', { exact: true }).click()
  await page.getByLabel('New floor label', { exact: true }).fill('Second test floor')
  await page.getByRole('button', { name: 'Create floor from this template' }).click()
  await expect(page.getByLabel('Floor label', { exact: true })).toHaveValue(
    'Second test floor',
  )
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Save interior draft' }).click()
  await expect(page.getByRole('button', { name: 'Save interior draft' })).toBeDisabled({
    timeout: 30000,
  })
  await page.reload()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Integration room · 100%' }),
  ).toBeVisible()
  const persisted = await page.evaluate(async id => {
    const { getLocationInterior } = await import(
      '/src/lib/api/locationInterior.remote.ts'
    )
    return await getLocationInterior({ locationId: id })
  }, created.locationId)
  expect(persisted.review.extraction.floors).toHaveLength(2)
  expect(persisted.map.publishedHash).toBeNull()
  expect(persisted.bundle.data.level_polygon.features).toHaveLength(2)
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'interior-reopened.png'),
  })
  await page.evaluate(async map => {
    const { publishPremisesMapDraft } = await import(
      '/src/lib/api/premisesMaps.remote.ts'
    )
    await publishPremisesMapDraft({
      id: map.id,
      hash: map.draftHash,
      expectedDraftVersion: map.draftVersion,
      expectedPublishedVersion: map.publishedVersion,
    })
  }, persisted.map)
  const pointer = await (
    await page.request.get('/api/premises-maps/' + persisted.map.id)
  ).json()
  const release = await page.request.get(pointer.url)
  expect(release.ok()).toBe(true)
  expect((await release.json()).data.level_polygon.features).toHaveLength(2)
  await page.goto('/premises/' + persisted.map.id)
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'interior-published-fixture.png'),
  })
})
