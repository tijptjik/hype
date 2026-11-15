import { test, expect } from '@playwright/test'
import { join } from 'node:path'

// biome-ignore lint/suspicious/noUndeclaredEnvVars: supplied by the managed Chrome runner.
const output = process.env.DEV_RUNNER_ARTIFACTS

for (const width of [1440, 390]) {
  test(`direct indoor startup and retained overworld at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width, height: 1000 })
    const overworldRequests = []
    page.on('request', request => {
      if (/\/MapCanvas\.svelte(?:\?|$)/.test(request.url()))
        overworldRequests.push(request.url())
    })
    let releaseCatalogue
    const catalogueGate = new Promise(resolve => {
      releaseCatalogue = resolve
    })
    await page.route('**/api/premises-maps', async route => {
      await catalogueGate
      await route.continue()
    })
    await page.goto('/premises/kennedy-town-mtr', { waitUntil: 'domcontentloaded' })
    const session = await (await page.request.get('/api/auth/get-session')).json()
    expect(session.user.id).toBe('hype-local-agent-admin')
    await expect(
      page.getByRole('status', { name: 'Loading station layout' }),
    ).toBeVisible({ timeout: 60000 })
    await expect(page.locator('.maplibregl-canvas')).toHaveCount(0)
    expect(overworldRequests).toHaveLength(0)
    releaseCatalogue()
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    await expect(page.locator('.maplibregl-canvas')).toHaveCount(0)
    expect(overworldRequests).toHaveLength(0)

    if (width === 1440) {
      // Observe actual transitions on both positioning elements, not just CSS declarations.
      await expect(page.locator('[data-app-intro="complete"]')).toBeVisible()
      await page.evaluate(() => {
        window.chromeMoves = []
        for (const name of ['nav', 'search']) {
          document
            .querySelector(`[data-app-intro-item="${name}"]`)
            .addEventListener('transitionrun', event => {
              if (
                event.target === event.currentTarget &&
                event.propertyName === 'transform'
              )
                window.chromeMoves.push(name)
            })
        }
      })
      await page.getByRole('button', { name: 'Amenities', exact: true }).click()
      await expect
        .poll(() => page.evaluate(() => [...new Set(window.chromeMoves)].sort()))
        .toEqual(['nav', 'search'])
      await page.getByRole('button', { name: 'Amenities', exact: true }).click()
      await page.emulateMedia({ reducedMotion: 'reduce' })
      for (const name of ['nav', 'search']) {
        await expect(page.locator(`[data-app-intro-item="${name}"]`)).toHaveCSS(
          'transition-duration',
          '0s',
        )
      }
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }
    await page.screenshot({ path: join(output, `indoor-direct-${width}.png`) })
    await page.getByRole('button', { name: 'Surroundings', exact: true }).click()
    await expect(page.locator('[data-map-visual-ready="true"]')).toBeVisible({
      timeout: 60000,
    })
    const canvas = await page.locator('.maplibregl-canvas').elementHandle()
    await page.goBack()
    await expect(page.locator('[data-station-scene]')).toBeVisible()
    expect(await canvas.evaluate(node => node.isConnected)).toBe(true)
    await page.goForward()
    await expect(page.locator('[data-station-surface]')).toHaveCount(0)
    expect(await canvas.evaluate(node => node.isConnected)).toBe(true)
  })
}

test('indoor catalogue failure offers retry without starting the overworld', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.route('**/api/premises-maps', route =>
    route.fulfill({ status: 503, body: '{}' }),
  )
  await page.goto('/premises/kennedy-town-mtr', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('alert')).toContainText('Could not load premises maps', {
    timeout: 60000,
  })
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0)
  await page.unroute('**/api/premises-maps')
  await page.getByRole('button', { name: 'Retry loading station' }).click()
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 30000 })
})
