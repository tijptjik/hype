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
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(session)
  const header = page.getByRole('banner')
  const button = name => header.getByRole('button', { name, exact: true })
  const views = ['Interior gallery', '3D model map', 'Exterior gallery']
  for (const [index, tab] of ['Profile', 'Fields', 'Locations'].entries()) {
    await button(tab).click()
    await expect(button(tab)).toHaveAttribute('aria-current', 'page')
    for (const view of views) await expect(button(view)).toBeVisible()
    await expect(button('Records')).toBeVisible()
    if (tab !== 'Locations') {
      const edit = await button('Edit').boundingBox()
      for (const label of ['Records', ...views]) {
        const action = await button(label).boundingBox()
        expect(action.x + action.width).toBeLessThanOrEqual(edit.x)
      }
      await button('Edit').click({ trial: true })
      if (index === 0)
        await header.screenshot({
          path: join(process.env.DEV_RUNNER_ARTIFACTS, 'session-header.png'),
        })
    }

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

test('lists captured records and restores the session tab from browser history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(`${session}#fields`)
  const header = page.getByRole('banner')
  const records = header.getByRole('button', { name: 'Records', exact: true })
  await records.click()
  await expect(records).toHaveAttribute('aria-pressed', 'true')
  const list = page.getByRole('region', { name: 'Records', exact: true })
  const first = list.getByRole('link').first()
  await expect(first).toBeVisible({ timeout: 60_000 })
  await expect(first).toHaveAttribute('href', /^\/admin\/features\/[^/]+$/)
  await expect(first.locator('time')).toHaveAttribute('datetime', /T/)
  await expect(header.getByRole('button', { name: 'Edit', exact: true })).toBeHidden()
  await first.click({ trial: true })
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'session-records.png'),
  })
  await page.reload()
  await first.click({ trial: true })
  await page.goBack()
  await expect(
    header.getByRole('button', { name: 'Fields', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(list).toHaveCount(0)
})

test('shows record-card addresses, capture tags and gallery thumbnails', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1566, height: 850 })
  await page.goto(`${session}&view=records#locations`)
  const list = page.getByRole('region', { name: 'Records', exact: true })
  const photo = list.getByRole('link', { name: /#006/ })
  await expect(photo.locator('strong')).toContainText('35 Kai Tak Road', {
    timeout: 60_000,
  })
  await expect(photo.getByText('E', { exact: true })).toBeVisible()
  const older = list.getByRole('link', { name: /#001/ })
  // The isolated admin media bucket contains this capture's retained original.
  await expect
    .poll(() =>
      older.locator('img').evaluate(img => img.complete && img.naturalWidth > 0),
    )
    .toBe(true)
  await expect(older.locator('strong')).toHaveText('No address recorded')
  await expect(older.getByText('E', { exact: true })).toBeVisible()
  await expect(list.getByRole('link', { name: /#002/ }).locator('img')).toHaveCount(0)
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'record-card-identities.png'),
  })
  await list.getByRole('searchbox').fill('35 Kai Tak Road')
  await expect(photo).toBeVisible()
  await expect(older).toHaveCount(0)
  await list.getByRole('searchbox').fill('#001')
  await expect(older).toBeVisible()
  await expect(photo).toHaveCount(0)
})

test('filters session records, selects matches and cancels a bulk deletion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1566, height: 850 })
  await page.goto(`${session}&view=records#locations`)
  const list = page.getByRole('region', { name: 'Records', exact: true })
  const filters = list.getByRole('group', { name: 'Record filters and bulk actions' })
  const first = list.getByRole('link').first()
  await expect(first).toBeVisible({ timeout: 60_000 })
  const title = await first.locator('[title]').getAttribute('title')
  const tag = await first.locator('.font-mono').last().textContent()
  await filters.getByRole('searchbox').fill(title)
  await expect(filters.getByLabel('Results: 1', { exact: true })).toBeVisible()
  await filters.getByRole('button', { name: 'Bulk edit', exact: true }).click()
  await filters.getByRole('button', { name: 'Select all matches' }).click()
  const row = list.getByRole('button', { name: tag, exact: false })
  await expect(row).toHaveAttribute('aria-pressed', 'true')
  await filters.getByRole('button', { name: 'Invert selection' }).click()
  await expect(row).toHaveAttribute('aria-pressed', 'false')
  await row.press('Space')
  await expect(row).toHaveAttribute('aria-pressed', 'true')
  await filters.getByRole('combobox', { name: 'Action' }).click()
  await page.getByRole('option', { name: 'Delete', exact: true }).click()
  const confirmation = page.waitForEvent('dialog').then(async dialog => {
    const message = dialog.message()
    await dialog.dismiss()
    return message
  })
  await filters.getByRole('button', { name: 'Apply', exact: true }).click()
  expect(await confirmation).toContain('Permanently delete 1 selected')
  await filters.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(first).toContainText(tag)
  await filters.getByRole('searchbox').fill('')
  await filters.getByRole('combobox', { name: 'Setting', exact: true }).click()
  await page.getByRole('option', { name: 'Interior', exact: true }).click()
  await expect(first).toContainText(/interior/i)
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'record-filters.png'),
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Window Too Small' })).toBeVisible()
  await page.setViewportSize({ width: 1200, height: 844 })
  await filters.getByRole('button', { name: 'Bulk edit', exact: true }).click()
  await filters.getByRole('button', { name: 'Select all matches' }).click()
  await expect(
    filters.getByRole('button', { name: /^Bulk edit \([1-9]/ }),
  ).toBeVisible()
  await filters.getByRole('button', { name: 'Cancel', exact: true }).click()
})

test('opens recorded draft Features from the session and recovers from a failed detail read', async ({
  page,
}) => {
  await page.goto(`${session}&view=records`)
  const rows = page
    .getByRole('region', { name: 'Records', exact: true })
    .getByRole('link')
  await expect(rows.first()).toBeVisible({ timeout: 60_000 })
  const captures = await rows.evaluateAll(links =>
    links.slice(0, 2).map(link => ({
      title: link.querySelector('[title]').getAttribute('title'),
      href: link.getAttribute('href'),
    })),
  )
  expect(captures).toHaveLength(2)
  const failedRead = '**/_app/remote/*/getFeature?*'
  for (const [index, { title, href }] of captures.entries()) {
    if (index === 0) await page.route(failedRead, route => route.abort('failed'))
    await rows.and(page.locator(`[href="${href}"]`)).click()
    await expect(page).toHaveURL(url => url.pathname === href)
    if (index === 0) {
      const retry = page.getByRole('alert').getByRole('button', { name: 'Retry' })
      await expect(retry).toBeVisible({ timeout: 60_000 })
      await page.unroute(failedRead)
      await retry.click()
    }
    await expect(
      page.getByRole('banner').getByRole('paragraph').filter({ hasText: title }),
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page.getByRole('group', { name: 'Title · English', exact: true }),
    ).toContainText(title)
    if (index === 0)
      await page.screenshot({
        path: join(process.env.DEV_RUNNER_ARTIFACTS, 'record-feature-detail.png'),
      })
    await page.goBack()
    await expect(rows.first()).toBeVisible({ timeout: 60_000 })
  }
})

test('opens both recorded photos and the empty photo workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(`${session}&view=records`)
  const records = page.getByRole('region', { name: 'Records', exact: true })
  await records.getByRole('link', { name: /#001/ }).click()
  const photos = page
    .getByRole('banner')
    .getByRole('button', { name: 'Photos', exact: true })
  await photos.click()
  const facet = page.locator('[data-facet-id="images"]')
  const viewport = facet.locator('[data-image-editor-viewport]')
  await expect(viewport).toBeVisible({ timeout: 45_000 })
  const thumbs = facet
    .locator('button[aria-pressed]')
    .filter({ has: page.locator('img') })
  await expect(thumbs).toHaveCount(2, { timeout: 45_000 })
  const revisions = new Set()
  for (const thumb of await thumbs.all()) {
    await thumb.click()
    await expect(thumb).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(() =>
        thumb
          .locator('img')
          .evaluateAll(images =>
            images.some(img => img.complete && img.naturalWidth > 0),
          ),
      )
      .toBe(true)
    const revision = await thumb
      .locator('img')
      .evaluateAll(
        images =>
          new URL(images.find(img => img.complete && img.naturalWidth > 0).currentSrc)
            .pathname,
      )
    revisions.add(revision)
    await expect
      .poll(
        () =>
          viewport
            .locator('.viewer-scene img')
            .evaluateAll(
              (images, path) =>
                images.some(
                  img =>
                    img.complete &&
                    img.naturalWidth > 0 &&
                    new URL(img.currentSrc).pathname === path,
                ),
              revision,
            ),
        { timeout: 30_000 },
      )
      .toBe(true)
  }
  expect(revisions.size).toBe(2)
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'record-photos.png'),
  })
  await page.goto(`${session}&view=records`)
  await records.getByRole('link', { name: /#002/ }).click()
  await photos.click()
  await expect(
    viewport.getByText(/Drop or select images|No image/, { exact: true }),
  ).toBeVisible({ timeout: 45_000 })
})

test('opens read-only session galleries and assembles the exterior models on the map', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 1024 })
  await page.goto(session + '#locations')
  const actions = page.getByRole('banner')
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

test('sizes the model preview as a square at two admin widths', async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 1024 })
  await page.goto(session + '&models=exterior#locations', {
    waitUntil: 'domcontentloaded',
  })
  const cards = page.getByRole('region', { name: 'Exterior gallery cards' })
  const card = cards.getByRole('article', { name: 'Kai King Mansion' })
  for (const width of [2160, 1280]) {
    await page.setViewportSize({ width, height: 1024 })
    await card.scrollIntoViewIfNeeded()
    const preview = card.locator('model-viewer')
    await expect(preview).toBeVisible({ timeout: 60_000 })
    await expect
      .poll(() => preview.evaluate(el => el.loaded), { timeout: 60_000 })
      .toBe(true)
    const bounds = await preview.boundingBox()
    expect(Math.abs(bounds.width - bounds.height)).toBeLessThan(2)
    expect(bounds.width).toBeGreaterThan(500)
    await card.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `session-gallery-card-${width}.png`),
    })
  }
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
  const angles = () =>
    compass.evaluate(el => {
      const transform = new DOMMatrix(getComputedStyle(el).transform)
      return {
        pitch: (Math.acos(transform.m33) * 180) / Math.PI,
        heading: (Math.atan2(transform.m21, transform.m11) * 180) / Math.PI,
      }
    })
  const heading = async () => (await angles()).heading
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
  await expect.poll(async () => (await angles()).pitch).toBeCloseTo(60, 1)
  await region.getByRole('button', { name: 'Rotate map right' }).click()
  await expect.poll(heading).toBeCloseTo(30, 1)
  await region.getByRole('button', { name: 'Rotate map left' }).click()
  await expect.poll(heading).toBeCloseTo(0, 1)
  const bounds = await canvas.boundingBox()
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x + 100, y, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await expect.poll(async () => Math.abs(await heading())).toBeGreaterThan(5)
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x, y - 140, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await expect.poll(async () => (await angles()).pitch).toBeCloseTo(85, 1)
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
