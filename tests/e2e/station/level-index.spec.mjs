import { test, expect } from '@playwright/test'

for (const width of [1440, 390]) {
  test(`closed-panel level shortcuts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/premises/kennedy-town-mtr')
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    const scene = page.locator('[data-station-scene]')
    await expect(scene).toBeVisible({ timeout: 60000 })
    const index = page.getByRole('navigation', { name: 'Indoor levels' })
    await expect(index).toBeVisible()
    const header = index.locator('summary')
    await expect(header).toHaveText('Levels')
    if (width === 390) await header.click()
    const floors = index.getByRole('button')
    await expect(floors.first()).toBeVisible()
    await header.click()
    await expect(floors.first()).toBeHidden()
    await header.click()
    await expect(floors.first()).toBeVisible()
    expect(await floors.count()).toBeGreaterThan(2)
    await floors.nth(1).click()
    await expect(floors.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-station-level]')).toHaveCount(1)
    await expect(index).toBeVisible()
    await index.getByRole('button', { name: 'All', exact: true }).click()
    await expect(
      index.getByRole('button', { name: 'All', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(() => page.locator('[data-station-level]').count())
      .toBeGreaterThan(1)
    const box = await index.boundingBox()
    expect(box.x).toBeLessThan(width / 2)
    expect(Math.abs(box.y + box.height / 2 - 500)).toBeLessThan(80)
  })
}

test('map legends animate opening and closing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/premises/kennedy-town-mtr')
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  for (const title of ['Levels', 'Concourse', 'Map symbols']) {
    const header = page.locator('summary').filter({ hasText: new RegExp(`^${title}$`) })
    const details = header.locator('..')
    for (const open of [false, true]) {
      await header.click()
      const samples = await details.evaluate(async node => {
        const heights = []
        for (let i = 0; i < 25; i++) {
          await new Promise(requestAnimationFrame)
          heights.push(node.getBoundingClientRect().height)
        }
        return heights
      })
      expect(new Set(samples.map(value => Math.round(value))).size).toBeGreaterThan(2)
      expect(await details.evaluate(node => node.open)).toBe(open)
    }
  }
})
