import { test, expect } from '@playwright/test'

for (const width of [1440, 390]) {
  test(`tracked Kennedy Town camera repeatedly enters indoors on the first click at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(180000)
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(
      '/?mapTracking=true&lng=114.12825&lat=22.28121&zoom=18.99&bearing=-83.3&pitch=60',
    )
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    await expect(
      page.getByRole('link', { name: 'Open Kennedy Town indoor map' }),
    ).toBeAttached({ timeout: 60000 })
    const close = page.getByRole('button', { name: 'Close panel', exact: true })
    if (await close.isVisible()) await close.click()
    await expect(page.getByTestId('map')).toHaveAttribute(
      'data-map-visual-ready',
      'true',
    )
    const canvas = await page.locator('.maplibregl-canvas').boundingBox()
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
    await expect(page).toHaveURL(/\/premises\/kennedy-town-mtr/, { timeout: 30000 })
    const scene = page.locator('[data-station-scene]')
    await expect(scene).toBeVisible({ timeout: 30000 })
    await expect
      .poll(async () => Number(await scene.getAttribute('data-camera-bearing')))
      .toBeCloseTo(83.3, 1)
    await expect(scene).toHaveAttribute('data-camera-tilt', '60')
    for (let trip = 0; trip < 5; trip++) {
      await page.getByRole('button', { name: 'Surroundings', exact: true }).click()
      await expect(page.locator('[data-station-surface]')).toHaveCount(0)
      await expect(page).toHaveURL(
        url => url.pathname === '/' && Number(url.searchParams.get('pitch')) === 60,
      )
      const world = await page.locator('.maplibregl-canvas').boundingBox()
      await page.mouse.click(world.x + world.width / 2, world.y + world.height / 2)
      await expect(page).toHaveURL(/\/premises\/kennedy-town-mtr/, { timeout: 15000 })
      await expect(scene).toBeVisible()
      await expect(scene).toHaveAttribute('data-camera-tilt', '60')
    }
    // Reuse the same map and scene through browser history, then click the footprint again.
    await page.goBack()
    await expect(page.locator('[data-station-surface]')).toHaveCount(0)
    await page.goForward()
    await expect(scene).toBeVisible()
    await page.goBack()
    await expect(page.locator('[data-station-surface]')).toHaveCount(0)
    const returned = await page.locator('.maplibregl-canvas').boundingBox()
    await page.mouse.click(
      returned.x + returned.width / 2,
      returned.y + returned.height / 2,
    )
    await expect(scene).toBeVisible({ timeout: 15000 })
  })
}

test('return preserves a user-adjusted 75 degree tilt through animation and reload', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/premises/kennedy-town-mtr')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  const scene = page.locator('[data-station-scene]')
  await expect(scene).toBeVisible({ timeout: 60000 })
  const controls = page.getByRole('application', {
    name: 'Station plan controls',
    exact: true,
  })
  await controls.focus()
  for (let step = 0; step < 3; step++) await page.keyboard.press('ArrowUp')
  await expect(scene).toHaveAttribute('data-camera-tilt', '75')
  await page.evaluate(() => {
    window.returnTilts = []
    const sample = () => {
      const scene = document.querySelector('[data-station-scene]')
      if (!scene) return
      window.returnTilts.push(Number(scene.dataset.cameraTilt))
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.getByRole('button', { name: 'Surroundings', exact: true }).click()
  await expect(page.locator('[data-station-surface]')).toHaveCount(0, {
    timeout: 60000,
  })
  await expect(page).toHaveURL(url => Number(url.searchParams.get('pitch')) === 75)
  const tilts = await page.evaluate(() => window.returnTilts)
  expect(tilts.length).toBeGreaterThan(2)
  expect(tilts.every(tilt => tilt === 75)).toBe(true)
  await page.reload()
  await expect(page.getByTestId('map')).toHaveAttribute(
    'data-map-visual-ready',
    'true',
    { timeout: 60000 },
  )
  await expect(page).toHaveURL(url => Number(url.searchParams.get('pitch')) === 75)
})
