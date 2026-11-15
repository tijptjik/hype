import { test, expect } from '@playwright/test'

test('rotated overworld entry retains its orientation indoors', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto(
    '/?mapTracking=true&lng=114.1581&lat=22.2847&zoom=18&bearing=73&pitch=0',
  )
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(
    page.getByRole('link', { name: 'Open Hong Kong indoor map' }),
  ).toBeAttached({ timeout: 60000 })
  const close = page.getByRole('button', { name: 'Close panel', exact: true })
  if (await close.isVisible()) await close.click()
  await expect(page.getByTestId('map')).toHaveAttribute('data-map-visual-ready', 'true')
  await page.mouse.click(600, 450)
  const scene = page.locator('[data-station-scene]')
  await expect(scene).toBeVisible({ timeout: 60000 })
  await expect(scene).toHaveAttribute('data-station-scene', 'plan')
  await expect
    .poll(async () => Number(await scene.getAttribute('data-camera-bearing')))
    .toBeCloseTo(-73, 1)
})

for (const width of [1440, 390]) {
  test(`floor crossfade preserves the panned and zoomed frame at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/premises/kennedy-town-mtr')
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    const scene = page.locator('[data-station-scene]')
    await expect(scene).toBeVisible({ timeout: 60000 })
    const close = page.getByRole('button', { name: 'Close station panel', exact: true })
    if (await close.isVisible()) await close.click()
    const index = page.getByRole('navigation', { name: 'Indoor levels' })
    const details = index.locator('details')
    if ((await details.count()) && !(await details.getAttribute('open'))) {
      if (!(await details.evaluate(node => node.open)))
        await details.locator('summary').click()
    }
    await index.getByRole('button').nth(1).click()
    await expect(scene).toHaveAttribute('data-camera-animating', 'false')
    const controls = page.getByRole('application', {
      name: 'Station plan controls',
      exact: true,
    })
    await controls.focus()
    await page.keyboard.press('+')
    await page.keyboard.press('ArrowLeft')
    await expect(scene).toHaveAttribute('data-camera-animating', 'false')
    const box = await scene.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20)
    await page.mouse.up()
    const before = await scene.getAttribute('viewBox')
    const bearing = await scene.getAttribute('data-camera-bearing')
    await page.evaluate(() => {
      window.cameraFrames = []
      window.recordCamera = true
      const record = () => {
        window.cameraFrames.push(
          document.querySelector('[data-station-scene]').getAttribute('viewBox'),
        )
        if (window.recordCamera) requestAnimationFrame(record)
      }
      requestAnimationFrame(record)
    })
    await index.getByRole('button').nth(2).click()
    await expect(scene).toHaveAttribute('data-camera-animating', 'false')
    await expect(scene).toHaveAttribute('viewBox', before)
    await expect(scene).toHaveAttribute('data-camera-bearing', bearing)
    await expect(page.locator('[data-station-level]')).toHaveCount(1)
    const frames = await page.evaluate(() => {
      window.recordCamera = false
      return window.cameraFrames
    })
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.every(frame => frame === before)).toBe(true)

    // URL acknowledgement and reduced-motion switching must preserve the same frame too.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await index.getByRole('button').nth(1).click()
    await expect(scene).toHaveAttribute('viewBox', before)
    await expect(scene).toHaveAttribute('data-camera-bearing', bearing)
  })
}
