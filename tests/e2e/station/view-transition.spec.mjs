import { selectIndoorLevel } from './map-data.mjs'
import { test, expect } from '@playwright/test'

for (const width of [1440, 390]) {
  test(`indoor floor geometry animates both ways at ${width}px`, async ({ page }) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/premises/kennedy-town-mtr')
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    const scene = page.locator('[data-station-scene]')
    await expect(scene).toBeVisible({ timeout: 60000 })
    await expect(scene).toHaveAttribute('data-station-transition', 'settled')
    const count = await page.locator('[data-station-level]').count()
    expect(count).toBeGreaterThan(1)
    await expect(scene).toContainText('G/F')
    await expect(scene).toContainText('M/F')
    if (width === 1440) {
      const legend = page.getByRole('list', { name: 'Map symbol legend' })
      const labels = await legend.getByRole('button').allTextContents()
      expect(labels.map(text => text.trim().replace(/^(?:↕|SOS)\s*/, ''))).toEqual([
        'Level change',
        'Information',
        'Female toilet',
        'Male toilet',
        'Accessible toilet',
        'Ticket machine',
        'Helpline',
        'Defibrillator',
        'Emergency intercom',
        'Police sign-in box',
      ])
    }
    // Capture frame-by-frame geometry, viewBox and mounted floors through each move.
    await page.evaluate(() => {
      window.initialScene = document.querySelector('[data-station-scene]')
      window.floorFrames = []
      window.recordFloors = true
      const record = () => {
        const svg = document.querySelector('[data-station-scene]')
        const levels = [...document.querySelectorAll('[data-station-level]')]
        window.floorFrames.push({
          sameScene: svg === window.initialScene,
          moving: svg?.dataset.stationTransition === 'moving',
          time: performance.now(),
          detailOpacity: Number(
            svg?.querySelector('[data-level-details]')?.getAttribute('opacity') ?? 0,
          ),
          box: svg?.getAttribute('viewBox'),
          paths: Object.fromEntries(
            levels.map(level => [
              level.dataset.stationLevel,
              level.querySelector('path').getAttribute('d'),
            ]),
          ),
        })
        if (window.recordFloors) requestAnimationFrame(record)
      }
      requestAnimationFrame(record)
    })
    await selectIndoorLevel(page, 'Concourse')
    await expect(scene).toHaveAttribute('data-station-transition', 'moving')
    await expect(page.locator('[data-station-level]')).toHaveCount(count)
    await expect(scene).toHaveAttribute('data-station-transition', 'settled')
    await expect(page.locator('[data-station-level]')).toHaveCount(1)
    const selected = await page
      .locator('[data-station-level]')
      .getAttribute('data-station-level')
    const fills = await page
      .locator('[data-unit-label]')
      .evaluateAll(nodes =>
        nodes
          .filter(node => ['KET 4', 'KET 6', 'KET 8'].includes(node.dataset.unitLabel))
          .map(node => getComputedStyle(node.previousElementSibling).fill),
      )
    expect(fills).toHaveLength(3)
    expect(new Set(fills).size).toBe(1)
    const frames = await page.evaluate(() => window.floorFrames)
    expect(frames.every(frame => frame.sameScene)).toBe(true)
    const moving = frames.filter(frame => frame.moving)
    expect(
      moving
        .filter(frame => frame.time - moving[0].time < 400)
        .every(frame => frame.detailOpacity === 0),
    ).toBe(true)
    expect(
      moving.some(frame => frame.detailOpacity > 0 && frame.detailOpacity < 1),
    ).toBe(true)
    expect(new Set(moving.map(frame => frame.paths[selected])).size).toBeGreaterThan(2)
    expect(new Set(moving.map(frame => frame.box)).size).toBeGreaterThan(2)
    expect(moving.every(frame => Object.keys(frame.paths).length === count)).toBe(true)
    await page.evaluate(() => {
      window.floorFrames = []
    })
    await selectIndoorLevel(page, 'All')
    await expect(scene).toHaveAttribute('data-station-transition', 'moving')
    await expect(scene).toHaveAttribute('data-station-transition', 'settled')
    await expect(page.locator('[data-station-level]')).toHaveCount(count)
    expect(
      await page.evaluate(() => window.floorFrames.every(frame => frame.sameScene)),
    ).toBe(true)
    const reverse = await page.evaluate(() =>
      window.floorFrames.filter(frame => frame.moving),
    )
    expect(
      reverse.some(frame => frame.detailOpacity > 0 && frame.detailOpacity < 1),
    ).toBe(true)
    expect(new Set(reverse.map(frame => frame.paths[selected])).size).toBeGreaterThan(2)
    await page.evaluate(() => {
      window.recordFloors = false
    })
    // Interrupting a transition must settle at the latest requested mode.
    await selectIndoorLevel(page, 'Concourse')
    await expect(scene).toHaveAttribute('data-station-transition', 'moving')
    await selectIndoorLevel(page, 'All')
    await expect(scene).toHaveAttribute('data-station-transition', 'settled')
    await expect(page.locator('[data-station-level]')).toHaveCount(count)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await selectIndoorLevel(page, 'Concourse')
    await expect(scene).toHaveAttribute('data-station-transition', 'settled')
    await expect(page.locator('[data-station-level]')).toHaveCount(1)
  })
}

test('same-venue place navigation retains the scene during catalogue resolution', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/premises/kennedy-town-mtr')
  const scene = page.locator('[data-station-scene]')
  await expect(scene).toBeVisible({ timeout: 60000 })
  const original = await scene.elementHandle()
  let releaseCatalogue
  let catalogueRequested
  const gate = new Promise(resolve => {
    releaseCatalogue = resolve
  })
  const requested = new Promise(resolve => {
    catalogueRequested = resolve
  })
  await page.route('**/api/premises-maps', async route => {
    catalogueRequested()
    await gate
    await route.continue()
  })
  try {
    await page.getByRole('button', { name: 'Find Information', exact: true }).click()
    await requested
    await expect(page).toHaveURL(/\/places\//)
    await expect(scene).toBeVisible()
    expect(await original.evaluate(node => node.isConnected)).toBe(true)
    await expect(
      page.getByRole('status', { name: 'Loading station layout' }),
    ).toHaveCount(0)
  } finally {
    releaseCatalogue()
  }
  await expect(scene).toHaveAttribute('data-station-transition', 'settled')
  expect(await original.evaluate(node => node.isConnected)).toBe(true)
})
