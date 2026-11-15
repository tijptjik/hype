import { test, expect } from '@playwright/test'
import { selectIndoorLevel } from './map-data.mjs'
import { join } from 'node:path'

for (const width of [1440, 390]) {
  test(`logo mode and distinct camera gestures at ${width}px`, async ({ page }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/premises/kennedy-town-mtr')
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    const scene = page.locator('[data-station-scene]')
    await expect(scene).toBeVisible({ timeout: 60000 })
    await selectIndoorLevel(page, 'Concourse')
    await expect(scene).toHaveAttribute('data-station-transition', 'settled')
    await expect(scene).toHaveAttribute('data-logo-mode', 'screen-aligned')
    const controls = page.locator('[data-station-controls]')
    await controls.locator('summary').click()
    const brands = controls.getByRole('button', { name: 'Brands', exact: true })
    await expect(brands).toHaveAttribute('aria-pressed', 'true')
    const resetBounds = await controls
      .getByRole('button', { name: 'Reset', exact: true })
      .boundingBox()
    const brandsBounds = await brands.boundingBox()
    expect(brandsBounds.x).toBeGreaterThan(resetBounds.x + resetBounds.width)
    expect(Math.abs(brandsBounds.y - resetBounds.y)).toBeLessThan(2)
    const fills = () =>
      scene
        .locator('path[fill-rule="evenodd"]')
        .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fill))
    const themeFills = await fills()
    await expect(scene.locator('[data-shop-logo]').first()).toBeVisible()
    await brands.click()
    await expect(brands).toHaveAttribute('aria-pressed', 'false')
    await expect(scene).toHaveAttribute('data-logo-mode', 'default')
    expect(await fills()).toEqual(themeFills)
    await brands.click()
    await expect(scene).toHaveAttribute('data-logo-mode', 'screen-aligned')
    await controls.locator('summary').click()
    const bounds = await scene.boundingBox()
    const start = {
      x: bounds.x + bounds.width * 0.8,
      y: bounds.y + bounds.height * 0.45,
    }
    const gesture = async (modifier, dx, dy) => {
      await page.mouse.move(start.x, start.y)
      if (modifier) await page.keyboard.down(modifier)
      await page.mouse.down()
      await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 })
      await page.mouse.up()
      if (modifier) await page.keyboard.up(modifier)
      await expect(scene).toHaveAttribute('data-camera-animating', 'false')
    }
    // Pan first: orbit must retain the visible centre, not the station's original centre.
    await gesture(null, -40, 30)
    const paths = scene.locator('path[fill-rule="evenodd"]')
    const capture = () =>
      paths.evaluateAll(nodes =>
        nodes.map(node => {
          const matrix = node.getScreenCTM()
          const vertices = [
            ...(node.getAttribute('d') ?? '').matchAll(
              /[ML](-?[\d.e+]+),(-?[\d.e+]+)/g,
            ),
          ]
          return vertices.map(match => {
            const point = new DOMPoint(
              Number(match[1]),
              Number(match[2]),
            ).matrixTransform(matrix)
            return [point.x, point.y]
          })
        }),
      )
    const before = await capture()
    const centre = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2]
    let anchor
    for (let path = 0; path < before.length && !anchor; path++) {
      const points = before[path]
      for (let i = 1; i + 1 < points.length; i++) {
        const [a, b, c] = [points[0], points[i], points[i + 1]]
        const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if (Math.abs(det) < 10) continue
        const u =
          ((b[1] - c[1]) * (centre[0] - c[0]) + (c[0] - b[0]) * (centre[1] - c[1])) /
          det
        const v =
          ((c[1] - a[1]) * (centre[0] - c[0]) + (a[0] - c[0]) * (centre[1] - c[1])) /
          det
        anchor = { path, indices: [0, i, i + 1], weights: [u, v, 1 - u - v] }
        break
      }
    }
    expect(anchor).toBeTruthy()
    const viewBefore = (await scene.getAttribute('viewBox')).split(' ').map(Number)
    const bearing = Number(await scene.getAttribute('data-camera-bearing'))
    await gesture('Control', -45, -50)
    await expect
      .poll(async () => Number(await scene.getAttribute('data-camera-bearing')))
      .toBeCloseTo(bearing - 18, 1)
    await expect
      .poll(async () => {
        const after = (await capture())[anchor.path]
        const point = [0, 1].map(axis =>
          anchor.indices.reduce(
            (sum, index, i) => sum + after[index][axis] * anchor.weights[i],
            0,
          ),
        )
        return Math.hypot(point[0] - centre[0], point[1] - centre[1])
      })
      .toBeLessThan(1)
    const viewAfter = (await scene.getAttribute('viewBox')).split(' ').map(Number)
    expect(viewAfter[2]).toBeCloseTo(viewBefore[2], 6)
    expect(viewAfter[3]).toBeCloseTo(viewBefore[3], 6)
    const tilt = Number(await scene.getAttribute('data-camera-tilt'))
    expect(tilt).toBeGreaterThan(0)
    await gesture('Shift', -30, -25)
    expect(Number(await scene.getAttribute('data-camera-tilt'))).toBeCloseTo(tilt, 1)
    const spunBearing = Number(await scene.getAttribute('data-camera-bearing'))
    await gesture('Alt', -30, -25)
    expect(Number(await scene.getAttribute('data-camera-bearing'))).toBeCloseTo(
      spunBearing,
      1,
    )
    expect(Number(await scene.getAttribute('data-camera-tilt'))).toBeGreaterThan(tilt)
    // Artwork follows floor pitch without rotating its bottom edge away from screen-down.
    const transform = await scene
      .locator('[data-shop-logo]')
      .first()
      .getAttribute('transform')
    const [a, b, c, d] = transform.slice(7, -1).split(' ').map(Number)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeCloseTo(0, 8)
    expect(c).toBeCloseTo(0, 8)
    expect(d).toBeGreaterThan(0)
    expect(d).toBeLessThan(a)
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: supplied by the managed runner.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `logo-mode-orbit-${width}.png`),
    })
  })
}
