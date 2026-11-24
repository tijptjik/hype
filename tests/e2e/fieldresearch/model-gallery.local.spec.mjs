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

test('keeps the read-only views available across all session tabs', async ({
  page,
}) => {
  await page.goto(session)
  const header = page.getByRole('banner')
  const button = name => header.getByRole('button', { name, exact: true })
  const views = ['Interior gallery', '3D model map', 'Exterior gallery']
  for (const [index, tab] of ['Profile', 'Fields', 'Locations'].entries()) {
    await button(tab).click()
    await expect(button(tab)).toHaveAttribute('aria-current', 'page')
    for (const view of views) await expect(button(view)).toBeVisible()
    if (tab !== 'Locations') await button('Edit').click({ trial: true })

    const view = views[index]
    await button(view).click()
    await expect(button(view)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('region', { name: view, exact: true })).toBeVisible()
    await expect(button(tab)).not.toHaveAttribute('aria-current', 'page')
    if (index === 0) await page.getByRole('button', { name: 'Close gallery' }).click()
    else if (index === 1) await button(view).click()
    else await button(tab).click()
    await expect(button(tab)).toHaveAttribute('aria-current', 'page')
    await expect(page).not.toHaveURL(/models=/)
  }
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
  await map.click()
  await expect(
    page.getByRole('complementary', { name: 'Included Locations' }),
  ).toBeVisible()
})

test('opens the model facing its front and links its caption to the Location', async ({
  page,
}) => {
  await page.goto(session + '&models=exterior#locations', {
    waitUntil: 'domcontentloaded',
  })
  const card = page.getByRole('article', { name: 'Kai King Mansion' })
  const caption = card.getByRole('link', {
    name: /Kai King Mansion.*57[-–]59 Lung Kong Road/i,
  })
  const href =
    '/admin/locations/building%3Acbab3d4d32f73b706b05fb7836f120f3d695277bdd5ecba28894dc7c0aedce26?organisation=oDucgyH4H4Bm'
  await expect(caption).toHaveAttribute('href', href, { timeout: 60_000 })
  await card.scrollIntoViewIfNeeded()
  const model = card.locator('model-viewer')
  await expect(model).toHaveAttribute('camera-orbit', /deg 90deg auto$/, {
    timeout: 60_000,
  })
  const { actual, expected } = await model.evaluate(el => ({
    actual: el.getCameraOrbit().theta,
    expected: (Number.parseFloat(el.cameraOrbit) * Math.PI) / 180,
  }))
  expect(Math.cos(actual - expected)).toBeCloseTo(1)
  await caption.click()
  await expect(page).toHaveURL(url => url.pathname + url.search === href)
})

test('fills the session workspace and lowers the camera to view facades', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 940 })
  await page.goto(session + '&models=map#locations', {
    waitUntil: 'domcontentloaded',
  })
  const region = page.getByRole('region', { name: 'Session building map' })
  const compass = region.locator('.maplibregl-ctrl-compass .maplibregl-ctrl-icon')
  await expect(compass).toBeVisible({ timeout: 60_000 })
  const pitch = () =>
    compass.evaluate(el => {
      const transform = new DOMMatrix(getComputedStyle(el).transform)
      return (Math.acos(transform.m33) * 180) / Math.PI
    })
  const canvas = region.locator('canvas').first()
  const main = page.locator('main[data-responsive-main]')
  await expect(region.getByRole('status')).toHaveText(
    /^[1-9]\d* of \d+ exterior models/,
    {
      timeout: 60_000,
    },
  )
  await expect(page.getByRole('button', { name: 'Back to locations' })).toHaveCount(0)
  for (const viewport of [
    { width: 490, height: 844 },
    { width: 1600, height: 940 },
  ]) {
    await page.setViewportSize(viewport)
    await expect
      .poll(async () => {
        const workspace = await main.boundingBox()
        const map = await canvas.boundingBox()
        return Math.max(
          Math.abs(map.y - workspace.y),
          Math.abs(map.y + map.height - workspace.y - workspace.height),
        )
      })
      .toBeLessThan(3)
  }
  await expect.poll(pitch).toBeCloseTo(60, 1)
  const bounds = await canvas.boundingBox()
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x, y - 140, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await expect.poll(pitch).toBeCloseTo(85, 1)
  await region.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'session-map-facades.png'),
  })
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
