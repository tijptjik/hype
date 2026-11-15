import { test, expect } from '@playwright/test'
import { publishedMap, selectIndoorLevel } from './map-data.mjs'
import { join } from 'node:path'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: supplied by the managed runner.
const output = process.env.DEV_RUNNER_ARTIFACTS

for (const width of [1440, 390]) {
  test(`map selection expands and reveals one inline service card at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/premises/kennedy-town-mtr')
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    const bundle = await publishedMap(page, 'kennedy-town-mtr')
    const room = bundle.data.unit_polygon.features.find(f =>
      /^cuc$/i.test(f.properties.unit_name_en ?? ''),
    )
    const marker = bundle.data.amenity_point.features.find(
      f =>
        f.properties.unit_id === room.properties.unit_id &&
        f.properties.amenity_category === 'information',
    )
    await selectIndoorLevel(page, 'Concourse')
    const scene = page.locator('[data-station-scene]')
    await expect(scene).toHaveAttribute('data-station-transition', 'settled')
    if (width === 390) {
      await page.mouse.move(70, 780)
      await page.mouse.down()
      await page.mouse.move(70, 580, { steps: 8 })
      await page.mouse.up()
    }
    const target = scene.getByRole('button', {
      name: 'Customer Service Centre',
      exact: true,
    })
    await expect(target).toHaveCount(1)
    await page.evaluate(() => {
      window.inlineFrames = []
      window.sampleInline = true
      const sample = () => {
        const card = document.querySelector('[aria-label="Station place details"]')
        const list = document.querySelector('[data-place-scroll]')
        if (card && list)
          window.inlineFrames.push({
            height: card.getBoundingClientRect().height,
            scroll: list.scrollTop,
          })
        if (window.sampleInline) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await target.click()
    const places = page.getByRole('region', { name: 'Places', exact: true })
    const card = places.getByRole('region', { name: 'Station place details' })
    await expect(card).toContainText('Customer Service Centre')
    await expect(
      places.getByText('Customer Service Centre', { exact: true }),
    ).toHaveCount(1)
    await expect(scene.locator('[data-selection-outline]')).toHaveAttribute(
      'data-selection-outline',
      room.properties.unit_id,
    )
    const centered = async () => {
      const row = await card.boundingBox()
      const list = await page.locator('[data-place-scroll]').boundingBox()
      // Cards near either end stay visible without adding artificial list padding.
      return Math.max(list.y - row.y, row.y + row.height - list.y - list.height, 0)
    }
    await expect.poll(centered).toBeLessThan(5)
    const frames = await page.evaluate(() => {
      window.sampleInline = false
      return window.inlineFrames
    })
    expect(new Set(frames.map(frame => Math.round(frame.height))).size).toBeGreaterThan(
      2,
    )
    expect(new Set(frames.map(frame => Math.round(frame.scroll))).size).toBeGreaterThan(
      2,
    )
    await page.screenshot({ path: join(output, `inline-service-${width}.png`) })
    // Old point links resolve to the same room-backed card and outline.
    await page.goto(`/premises/kennedy-town-mtr/places/${marker.properties.amenity_id}`)
    await expect(card).toContainText('Customer Service Centre', { timeout: 60000 })
    await expect(scene.locator('[data-selection-outline]')).toHaveAttribute(
      'data-selection-outline',
      room.properties.unit_id,
    )
    await expect.poll(centered).toBeLessThan(5)
    // A selected anchor remains available even when the current search excludes it.
    await page.getByRole('searchbox', { name: 'Search places' }).fill('no-such-place')
    await expect(card).toBeVisible()
    await expect.poll(centered).toBeLessThan(5)
    await card.getByRole('button', { name: 'Close place details' }).click()
    await expect(card).toHaveCount(0)
    await expect(places).toContainText('No matching shops or facilities.')
  })
}
