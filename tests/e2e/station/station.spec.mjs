import { test, expect } from '@playwright/test'
import { join } from 'node:path'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: the managed Chrome runner supplies its artifact directory.
const output = process.env.DEV_RUNNER_ARTIFACTS
test('station panel, flat branding, exploded drilldown and retained map/search', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(
    page.getByRole('button', { name: 'Kennedy Town', exact: true }),
  ).toBeVisible({ timeout: 60000 })
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  const search = page.locator('#omni-search-bar')
  const searchBefore = await search.count()
  await page.getByRole('button', { name: 'Kennedy Town', exact: true }).click()
  await expect(page.locator('[data-station-scene="exploded"]')).toBeVisible({
    timeout: 30000,
  })
  await expect(page.getByRole('region', { name: 'Station layout panel' })).toBeVisible()
  await expect(page.locator('[data-station-level]')).toHaveCount(6)
  expect(searchBefore).toBe(1)
  await expect(search).toBeVisible()
  await page.screenshot({ path: join(output, 'hype-station-exploded.png') })
  await page.locator('g[role="button"]').filter({ hasText: 'Concourse' }).click()
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible()
  await expect(page.locator('[data-shop-logo]')).toHaveCount(3)
  await page.screenshot({ path: join(output, 'hype-station-plan.png') })
  await page.getByRole('searchbox', { name: 'Search station directory' }).fill('KET3')
  await page.getByRole('button', { name: /7-Eleven KET 3/ }).click()
  await expect(
    page.getByRole('region', { name: 'Station place details' }),
  ).toContainText('Unpaid area')
  await page.screenshot({ path: join(output, 'hype-station-ket3.png') })
  // A real theme change must repaint the SVG without replacing source data.
  await page.evaluate(() =>
    document.documentElement.setAttribute('data-theme', 'hype-light'),
  )
  await page.screenshot({ path: join(output, 'hype-station-light.png') })
  await page.getByRole('button', { name: 'Fit layout', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search station directory' }).fill('lift')
  await page
    .getByRole('button', { name: /Elevator.*Concourse/ })
    .first()
    .click()
  const destination = page
    .getByRole('region', { name: 'Station place details' })
    .getByRole('button', { name: /to / })
    .first()
  await expect(destination).toBeVisible()
  await destination.click()
  await expect(page.getByRole('combobox', { name: 'Station level' })).not.toHaveValue(
    '2374cbd5-3901-4ee9-8b84-ca926994c99d',
  )
  await page.getByRole('button', { name: 'General map', exact: true }).click()
  await expect(page.locator('[data-station-surface]')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Kennedy Town', exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Close panel', exact: true }).click()
  await page.getByRole('button', { name: 'Kennedy Town', exact: true }).click()
  await page.getByRole('button', { name: 'Close station panel' }).click()
  await page.getByRole('button', { name: 'Exploded view', exact: true }).click()
  await expect(page.locator('[data-station-scene="exploded"]')).toBeVisible()
  await page.screenshot({ path: join(output, 'hype-station-mobile.png') })
  await page.getByRole('button', { name: 'Station', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Station level' })
    .selectOption({ label: 'Concourse Level' })
  await page.getByRole('button', { name: 'Close station panel' }).click()
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
})

test('premises URLs restore exact places, share links and search stations', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const path = '/premises/kennedy-town-mtr/places/85dc0347-d11b-4c8c-9686-dc6697050317'
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  const details = page.getByRole('region', { name: 'Station place details' })
  await expect(details).toContainText('KET 3', { timeout: 60000 })
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible()
  await page.evaluate(() => {
    window.__shared = []
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async data => window.__shared.push(data),
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => (window.__copied = text) },
    })
  })
  await details.getByRole('button', { name: 'Copy link', exact: true }).click()
  expect(await page.evaluate(() => window.__copied)).toContain(path)
  await details.getByRole('button', { name: 'Share', exact: true }).click()
  expect(await page.evaluate(() => window.__shared[0].url)).toContain(path)
  await page.reload()
  await expect(details).toContainText('KET 3', { timeout: 60000 })
  await page.getByRole('searchbox', { name: 'Search station directory' }).fill('KET8')
  await page.getByRole('button', { name: /Yamazaki.*KET 8/ }).click()
  await expect(page).not.toHaveURL(/85dc0347/)
  await page.goBack()
  await expect(details).toContainText('KET 3', { timeout: 60000 })
  await page.screenshot({ path: join(output, 'hype-premises-shared-place.png') })
  await page.goto('/premises/tiu-keng-leng-mtr')
  await expect(
    page.getByRole('heading', { name: 'Tiu Keng Leng' }).first(),
  ).toBeVisible({ timeout: 60000 })
  await expect(page.getByRole('link', { name: 'Station layout ↗' })).toHaveAttribute(
    'href',
    'https://www.mtr.com.hk/archive/en/services/layouts/tik.pdf',
  )
  await expect(page.locator('[data-station-scene]')).toHaveCount(0)
  await page.goto('/')
  const input = page.locator('#omni-search-bar')
  await expect(input).toBeVisible({ timeout: 60000 })
  await input.fill('MTR')
  await page.getByRole('button', { name: 'MTR stations', exact: true }).click()
  await expect(page.getByText('Yuen Long · 元朗 · YUL', { exact: true })).toBeAttached()
  await input.fill('堅尼地城')
  await expect(
    page.getByText('Kennedy Town · 堅尼地城 · KET', { exact: true }),
  ).toBeVisible()
  await page.getByText('Kennedy Town · 堅尼地城 · KET', { exact: true }).click()
  await expect(page).toHaveURL(/\/premises\/kennedy-town-mtr$/)
  await page.goto(
    '/premises/kennedy-town-mtr/places/00000000-0000-0000-0000-000000000000',
  )
  await expect(page.getByRole('alert')).toContainText('not available', {
    timeout: 60000,
  })
})

test('indoor camera rotates, tilts, pans and distinguishes reviewed links', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/premises/kennedy-town-mtr', { waitUntil: 'domcontentloaded' })
  const scene = page.locator('[data-station-scene]')
  await expect(scene).toBeVisible({ timeout: 60000 })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  expect(
    await page.locator('[data-connection="aligned-footprints"]').count(),
  ).toBeGreaterThan(0)
  await expect(page.locator('[data-connection="matching-lift-code"]')).toHaveCount(4)
  await expect(page.locator('[data-connection="reviewed-layout"]')).toHaveCount(1)
  const box = await scene.boundingBox()
  const x = box.x + box.width * 0.7,
    y = box.y + box.height * 0.25
  const before = await scene.getAttribute('viewBox')
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 60, y + 30, { steps: 8 })
  await page.mouse.up()
  await expect(scene).not.toHaveAttribute('viewBox', before)
  await page.mouse.move(x, y)
  await page.keyboard.down('Control')
  await page.mouse.down()
  await page.mouse.move(x + 80, y - 40, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up('Control')
  await expect(scene).not.toHaveAttribute('data-bearing', '-115')
  await expect(scene).not.toHaveAttribute('data-tilt', '60')
  await page.getByText('Options', { exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Floor spacing' })).toHaveValue('25')
  await page.getByRole('slider', { name: 'Floor spacing' }).fill('15')
  await page.getByRole('checkbox', { name: 'Show unverified connections' }).check()
  expect(
    await page.locator('[data-connection="aligned-footprints"]').count(),
  ).toBeGreaterThan(0)
  await page.getByRole('checkbox', { name: 'Show unverified connections' }).uncheck()
  await page.getByRole('button', { name: 'Reset view', exact: true }).click()
  await expect(scene).toHaveAttribute('data-bearing', '-115')
  await page.getByText('Options', { exact: true }).click()
  await page.screenshot({ path: join(output, 'hype-station-compact-connections.png') })
})

test('station outline offers indoor entry at close outdoor zoom', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1200, height: 900 })
  const url = zoom =>
    `/?mapTracking=true&lng=114.1286&lat=22.28128&zoom=${zoom}&bearing=0&pitch=0`
  await page.goto(url(14), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#omni-search-bar')).toBeVisible({ timeout: 60000 })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(
    page.getByRole('link', { name: 'Open Kennedy Town indoor map' }),
  ).toHaveCount(0)
  await page.goto(url(18), { waitUntil: 'domcontentloaded' })
  await expect(
    page.getByRole('link', { name: 'Open Kennedy Town indoor map' }),
  ).toBeAttached({ timeout: 60000 })
  const close = page.getByRole('button', { name: 'Close panel', exact: true })
  if (await close.isVisible()) await close.click()
  await expect(page.getByTestId('map')).toHaveAttribute('data-map-visual-ready', 'true')
  await expect(page.getByTestId('map')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: join(output, 'hype-station-outdoor-outline.png') })
  // The map centre lies inside the source venue footprint at this URL.
  await page.mouse.click(600, 450)
  await expect(page).toHaveURL(/premises\/kennedy-town-mtr/, { timeout: 15000 })
})

test('modifier scroll and two-finger gestures manipulate the indoor camera', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/premises/kennedy-town-mtr', { waitUntil: 'domcontentloaded' })
  const scene = page.locator('[data-station-scene]')
  await expect(scene).toBeVisible({ timeout: 60000 })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  const b = await scene.boundingBox(),
    x = b.x + b.width * 0.65,
    y = b.y + b.height * 0.3
  await page.mouse.move(x, y)
  await page.keyboard.down('Alt')
  await page.mouse.wheel(0, 100)
  await page.keyboard.up('Alt')
  await expect(scene).not.toHaveAttribute('data-bearing', '-115')
  const beforeTilt = await scene.getAttribute('data-tilt')
  await page.keyboard.down('Control')
  await page.keyboard.down('Alt')
  await page.mouse.wheel(0, 100)
  await page.keyboard.up('Alt')
  await page.keyboard.up('Control')
  await expect(scene).not.toHaveAttribute('data-tilt', beforeTilt)
  const client = await page.context().newCDPSession(page)
  const before = await scene.getAttribute('viewBox'),
    bearing = await scene.getAttribute('data-bearing')
  const points = (dx, dy, spread, twist) => [
    { x: x + dx - spread, y: y + dy - twist, id: 1 },
    { x: x + dx + spread, y: y + dy + twist, id: 2 },
  ]
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: points(0, 0, 30, 0),
  })
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: points(40, 20, 50, 20),
  })
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(scene).not.toHaveAttribute('viewBox', before)
  await expect(scene).not.toHaveAttribute('data-bearing', bearing)
  await expect(page.locator('[data-through-floor]').first()).toHaveAttribute(
    'opacity',
    '0.5',
  )
  await page
    .getByRole('combobox', { name: 'Station level' })
    .selectOption({ label: 'Concourse Level' })
  await expect(page.locator('image[href="/indoor/hana-musubi.png"]')).toHaveCount(1)
})

test('bread route highlights, flies to the concourse and can be interrupted', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/premises/kennedy-town-mtr', { waitUntil: 'domcontentloaded' })
  const scene = page.locator('[data-station-scene]')
  await expect(scene).toBeVisible({ timeout: 60000 })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  const close = page.getByRole('button', { name: 'Close panel', exact: true })
  if (await close.isVisible()) await close.click()
  await page.evaluate(() =>
    document.documentElement.setAttribute('data-theme', 'hype-dark'),
  )
  await expect(scene).toHaveAttribute('data-bearing', '-115')
  await expect(scene).toHaveAttribute('data-tilt', '60')
  await expect(
    page.getByText('Select a floor to explore · heights are schematic', {
      exact: true,
    }),
  ).toHaveCount(0)
  await page.screenshot({ path: join(output, 'hype-station-dark-refined.png') })
  await page.getByRole('button', { name: 'Highlight route', exact: true }).click()
  await expect(page.locator('[data-indoor-route]')).toBeVisible()
  await expect(page.locator('[data-route-status]')).toContainText('Exit A → 7-Eleven')
  await page.screenshot({ path: join(output, 'hype-station-route-highlight.png') })
  await page.getByRole('button', { name: '▶ Fly to 7-Eleven', exact: true }).click()
  await expect(scene).toHaveAttribute('data-route-mode', 'flying')
  await expect
    .poll(async () => Number(await scene.getAttribute('data-route-progress')))
    .toBeGreaterThan(0.2)
  await page.screenshot({ path: join(output, 'hype-station-route-flight.png') })
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(scene).toHaveAttribute('data-route-mode', 'highlight')
  await page.getByRole('button', { name: '▶ Fly to 7-Eleven', exact: true }).click()
  await expect(scene).toHaveAttribute('data-route-mode', 'arrived', { timeout: 30000 })
  await expect(page.locator('[data-station-level]')).toHaveCount(1)
  await expect(page.locator('[data-route-status]')).toContainText('Arrived')
  await page.screenshot({ path: join(output, 'hype-station-route-arrival.png') })
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.locator('[data-indoor-route]')).toHaveCount(0)
  await expect(page.locator('[data-station-level]')).toHaveCount(6)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '▶ Fly to 7-Eleven', exact: true }).click()
  await expect(scene).toHaveAttribute('data-route-mode', 'highlight')
  await page.goto(
    '/premises/kennedy-town-mtr/places/e4214678-8599-4e2b-9356-79d1630321ef',
  )
  await expect(scene).toBeVisible({ timeout: 60000 })
  await expect(page.locator('image[href="/indoor/hana-musubi.png"]')).toHaveCount(1)
  await page.screenshot({ path: join(output, 'hype-station-hana-full-bleed.png') })
})

test('Hana-musubi artwork fills the pink shop footprint after image decode', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(
    '/premises/kennedy-town-mtr/places/e4214678-8599-4e2b-9356-79d1630321ef',
    {
      waitUntil: 'domcontentloaded',
    },
  )
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible({
    timeout: 60000,
  })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  const logo = page.locator('image[href="/indoor/hana-musubi.png"]')
  await expect(logo).toHaveCount(1)
  await page.evaluate(async () => {
    await Promise.all(
      [...document.querySelectorAll('svg image')].map(async element => {
        const image = new Image()
        image.src = element.getAttribute('href')
        await image.decode()
      }),
    )
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
  })
  await expect(logo.locator('..')).toHaveAttribute('clip-path', /url/)
  await page.screenshot({
    path: join(output, 'hype-station-hana-full-bleed-decoded.png'),
  })
})
