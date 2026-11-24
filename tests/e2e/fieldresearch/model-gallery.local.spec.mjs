import { join } from 'node:path'
import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'

const session = '/admin/field-recorder?session=5e856112-1f64-457a-8c64-3170e874688b'
const kit = createRequire(import.meta.resolve('@sveltejs/kit'))
const { parse, stringify } = await import(kit.resolve('devalue'))

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
})

test('opens read-only session galleries and assembles the exterior models on the map', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1024 })
  await page.goto(session + '#locations')
  const actions = page.locator('[data-header-view-actions]')
  const exterior = actions.getByRole('button', { name: 'Exterior gallery' })
  const interior = actions.getByRole('button', { name: 'Interior gallery' })
  const map = actions.getByRole('button', { name: '3D model map' })
  await exterior.click({ timeout: 60_000 })
  const cards = page.getByLabel('Exterior gallery cards', { exact: true })
  await expect(cards.getByRole('article').first()).toBeVisible({ timeout: 45_000 })
  const placeholder = cards.getByRole('img', { name: 'No exterior model' })
  expect(await placeholder.count()).toBeGreaterThan(0)
  const count = await cards.getByRole('article').count()
  const expectedModels = count - (await placeholder.count())
  expect(expectedModels).toBeGreaterThan(1)
  await expect(exterior).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('complementary', { name: 'Included Locations' }),
  ).toHaveCount(0)
  await expect(cards.getByRole('article', { name: 'Kai King Mansion' })).toContainText(
    /57[-–]59 Lung Kong Road/i,
  )
  const tracks = () =>
    cards.evaluate(el =>
      getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat),
    )
  await expect.poll(async () => (await tracks()).length).toBe(3)
  expect(Math.min(...(await tracks()))).toBeGreaterThanOrEqual(520)
  await expect
    .poll(
      () =>
        cards
          .locator('model-viewer')
          .evaluateAll(models => models.filter(m => m.loaded).length),
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0)
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'session-exterior-gallery.png'),
  })
  await page.setViewportSize({ width: 2750, height: 960 })
  await expect.poll(async () => (await tracks()).length).toBe(4)
  await page.setViewportSize({ width: 490, height: 844 })
  await expect.poll(async () => (await tracks()).length).toBe(1)
  expect((await cards.boundingBox()).width).toBeLessThanOrEqual(490)
  await page.setViewportSize({ width: 1600, height: 940 })
  await interior.click()
  const indoor = page.getByLabel('Interior gallery cards')
  await expect(indoor.getByRole('article')).toHaveCount(count)
  await expect(
    indoor.getByRole('img', { name: 'No interior model' }).first(),
  ).toBeVisible()
  await map.click()
  const context = page.getByRole('region', { name: 'Session building map' })
  await expect(context.getByRole('status')).toHaveText(
    expectedModels + ' of ' + expectedModels + ' exterior models',
    { timeout: 60_000 },
  )
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'session-model-map.png'),
  })
  await page.getByRole('button', { name: 'Back to locations' }).click()
  await expect(
    page.getByRole('complementary', { name: 'Included Locations' }),
  ).toBeVisible()
})

test('renders a published interior bundle in a read-only card', async ({ page }) => {
  // This local session has no assigned interiors. Exercise the same renderer with a real release.
  await page.route('**/_app/remote/*/getResearchLocations*', async route => {
    const response = await route.fetch()
    const body = await response.json()
    const payload = parse(body.data)
    const building = payload._.find(row => row.kind === 'building')
    building.interiorMaps = [
      {
        id: 'asiaworld-expo-mtr',
        name: 'AsiaWorld-Expo',
        hash: 'f3567c57dd0a9d7d415685f34468c41e30fb5be52e2a54f07c40946334e9f269',
      },
    ]
    payload._ = [building]
    for (const cached of Object.values(payload.q)) cached.v = payload._
    await route.fulfill({ response, json: { ...body, data: stringify(payload) } })
  })
  await page.goto(session + '&models=interior#locations')
  const cards = page.getByLabel('Interior gallery cards')
  await expect(cards.getByLabel('Station plan controls')).toBeVisible({
    timeout: 60_000,
  })
})
