import { test, expect } from '@playwright/test'

for (const width of [1440, 390]) {
  test(`compass follows the displayed camera at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/premises/kennedy-town-mtr')
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    const scene = page.locator('[data-station-scene]')
    await expect(scene).toBeVisible({ timeout: 60000 })
    await expect(scene).toHaveAttribute('data-camera-animating', 'false')
    const compass = page.locator('[data-station-compass]')
    await expect(compass).toBeVisible()
    const before = Number(await compass.getAttribute('data-heading'))
    const controls = page.getByRole('application', {
      name: 'Station plan controls',
      exact: true,
    })
    await controls.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(compass).toHaveAttribute('data-heading', String((before + 10) % 360))
    const bearing = Number(await scene.getAttribute('data-camera-bearing'))
    expect(Number(await compass.getAttribute('data-heading'))).toBe(
      ((Math.round(-bearing) % 360) + 360) % 360,
    )
    expect(await compass.evaluate(node => getComputedStyle(node).backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)',
    )
    const bounds = await compass.boundingBox()
    expect(bounds.x).toBeLessThan(40)
    expect(bounds.y).toBeLessThan(120)
    await page.screenshot({
      path: `${process.env.DEV_RUNNER_ARTIFACTS}/compass-${width}.png`,
    })
  })
}
