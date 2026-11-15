import { selectIndoorLevel } from './map-data.mjs'
import { test, expect } from '@playwright/test'
import { publishedMap } from './map-data.mjs'

for (const width of [1440, 390]) {
  test(`return to world map preserves the panned indoor location at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/premises/kennedy-town-mtr')
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    await selectIndoorLevel(page, 'Concourse')
    const scene = page.locator('[data-station-scene]')
    await expect(scene).toHaveAttribute('data-station-transition', 'settled')
    await expect(page.getByRole('button', { name: 'Fit', exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: /^(Exploded view|Floor plan|Fit layout|General map)$/,
      }),
    ).toHaveCount(0)
    const before = await scene.getAttribute('viewBox')
    await page.mouse.move(width / 2, 750)
    await page.mouse.down()
    await page.mouse.move(width / 2 + 60, 790, { steps: 6 })
    await page.mouse.up()
    await expect(scene).not.toHaveAttribute('viewBox', before)
    const bundle = await publishedMap(page, 'kennedy-town-mtr')
    const positions =
      bundle.data.venue_polygon.features[0].geometry.coordinates.flat(Infinity)
    const lngs = positions.filter((_, index) => index % 2 === 0)
    const lats = positions.filter((_, index) => index % 2 === 1)
    const origin = [
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
      (Math.min(...lats) + Math.max(...lats)) / 2,
    ]
    const box = (await scene.getAttribute('viewBox')).split(' ').map(Number)
    const angle = (Number(await scene.getAttribute('data-bearing')) * Math.PI) / 180
    const rx = box[0] + box[2] / 2,
      ry = -(box[1] + box[3] / 2)
    const expectedCenter = [
      origin[0] +
        (rx * Math.cos(angle) - ry * Math.sin(angle)) /
          (111320 * Math.cos((origin[1] * Math.PI) / 180)),
      origin[1] + (rx * Math.sin(angle) + ry * Math.cos(angle)) / 111320,
    ]
    await page.evaluate(() => {
      window.returnFrames = []
      const sample = () => {
        const surface = document.querySelector('[data-station-surface]')
        if (!surface) return
        window.returnFrames.push({
          phase: surface.dataset.stationReturn,
          opacity: Number(getComputedStyle(surface).opacity),
          viewBox: surface
            .querySelector('svg[data-station-scene]')
            ?.getAttribute('viewBox'),
        })
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await page.getByRole('button', { name: 'Surroundings', exact: true }).click()
    await expect(page).toHaveURL(
      url => url.pathname === '/' && url.searchParams.get('mapTracking') === 'true',
      { timeout: 60000 },
    )
    await expect(page.locator('[data-station-surface]')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Kennedy Town', exact: true }),
    ).toHaveCount(0)
    const url = new URL(page.url())
    expect(Number(url.searchParams.get('lng'))).toBeCloseTo(expectedCenter[0], 4)
    expect(Number(url.searchParams.get('lat'))).toBeCloseTo(expectedCenter[1], 4)
    expect(Number(url.searchParams.get('lng'))).toBeGreaterThan(114.12)
    expect(Number(url.searchParams.get('lng'))).toBeLessThan(114.14)
    expect(Number(url.searchParams.get('lat'))).toBeGreaterThan(22.27)
    expect(Number(url.searchParams.get('lat'))).toBeLessThan(22.29)
    const frames = await page.evaluate(() => window.returnFrames)
    expect(
      new Set(
        frames.filter(frame => frame.phase === 'zooming').map(frame => frame.viewBox),
      ).size,
    ).toBeGreaterThan(2)
    expect(
      frames.some(
        frame => frame.phase === 'fading' && frame.opacity > 0 && frame.opacity < 1,
      ),
    ).toBe(true)
    await page.goBack()
    await expect(scene).toBeVisible()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: 'Surroundings', exact: true }).click()
    await expect(page.locator('[data-station-surface]')).toHaveCount(0)
    await expect(page).toHaveURL(
      url => url.pathname === '/' && url.searchParams.get('mapTracking') === 'true',
      { timeout: 60000 },
    )
    const reloadUrl = new URL(page.url())
    await page.reload()
    await expect(page.locator('[data-map-visual-ready="true"]')).toBeVisible({
      timeout: 60000,
    })
    expect(new URL(page.url()).searchParams.get('lng')).toBe(
      reloadUrl.searchParams.get('lng'),
    )
  })
}
