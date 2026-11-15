import { test, expect } from '@playwright/test'
/** Select a level through the public navigation. */
async function selectIndoorLevel(page, name) {
  const index = page.getByRole('navigation', { name: 'Indoor levels' })
  if (!(await index.locator('details').evaluate(node => node.open)))
    await index.locator('summary').click()
  await index.getByRole('button', { name, exact: true }).click()
}

for (const width of [1440, 390]) {
  test(`offscreen floor flies back with travel guidance at ${width}px`, async ({
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
    await selectIndoorLevel(page, 'Concourse')
    await expect(scene).toHaveAttribute('data-camera-animating', 'false')
    // Move far beyond every level, using actual map gestures.
    const box = await scene.boundingBox()
    for (let i = 0; i < 8; i++) {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.75)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.75, {
        steps: 3,
      })
      await page.mouse.up()
    }
    const before = await scene.getAttribute('viewBox')
    await selectIndoorLevel(page, 'Platform')
    const notice = page.locator('[data-camera-travel]')
    await expect(notice).toContainText(/Moving .+ (north|south|east|west)/)
    await expect(scene).toHaveAttribute('data-camera-animating', 'true')
    await expect(scene).toHaveAttribute('data-camera-animating', 'false')
    expect(await scene.getAttribute('viewBox')).not.toBe(before)
    await expect(notice).toHaveCount(0, { timeout: 5000 })
    await selectIndoorLevel(page, 'Concourse')
    await expect(notice).toHaveCount(0)
  })
}
