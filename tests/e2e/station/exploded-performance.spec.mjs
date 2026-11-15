import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { selectIndoorLevel } from './map-data.mjs'

for (const width of [1440, 390]) {
  test(`48-floor exploded rendering at ${width}px`, async ({ page }) => {
    test.setTimeout(180000)
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/buildings/hysan-place')
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    const close = page.getByRole('button', { name: 'Close station panel', exact: true })
    if (await close.isVisible()) await close.click()
    await selectIndoorLevel(page, 'All')
    const scene = page.locator('[data-station-scene]')
    await expect(page.locator('[data-station-level]')).toHaveCount(48)
    await expect(scene).toHaveAttribute('data-camera-animating', 'false')
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: width === 390 ? 4 : 1 })
    const result = await page.evaluate(async () => {
      const scene = document.querySelector('[data-station-scene]')
      const controls = document.querySelector('[aria-label="Station plan controls"]')
      let pathWrites = 0
      const observer = new MutationObserver(records => {
        pathWrites += records.length
      })
      observer.observe(scene, {
        subtree: true,
        attributes: true,
        attributeFilter: ['d'],
      })
      const frames = []
      let previous = performance.now()
      for (let frame = 0; frame < 30; frame++) {
        controls.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
        )
        await new Promise(requestAnimationFrame)
        const now = performance.now()
        frames.push(now - previous)
        previous = now
      }
      observer.disconnect()
      frames.sort((a, b) => a - b)
      return {
        nodes: scene.querySelectorAll('*').length,
        transformedFloors: scene.querySelectorAll('[data-floor-transform="true"]')
          .length,
        pathWrites,
        medianMs: frames[15],
        p95Ms: frames[28],
        maxMs: frames[29],
      }
    })
    console.log(JSON.stringify({ width, ...result }))
    await writeFile(
      join(process.env.DEV_RUNNER_ARTIFACTS, `exploded-${width}.json`),
      JSON.stringify(result, null, 2),
    )
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `exploded-overview-${width}.png`),
    })
    await expect(scene.locator('[data-connection-pass="outside"]')).toHaveCount(1)
    await expect(scene.locator('line[mask]')).toHaveCount(0)
    await expect(
      scene
        .locator('[data-station-level]')
        .getByRole('button', { name: 'Open Ground Floor', exact: true }),
    ).toHaveCount(1)
    await selectIndoorLevel(page, 'Ground Floor')
    await expect(page.locator('[data-station-level]')).toHaveCount(1)
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `exploded-ground-${width}.png`),
    })
  })
}
