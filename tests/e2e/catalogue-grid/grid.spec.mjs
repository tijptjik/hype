import { test, expect } from '@playwright/test'
import { join } from 'node:path'
for (const kind of ['brand', 'group']) {
  test(`${kind} catalogue toggles between regular and eight-column compact cards`, async ({
    page,
  }) => {
    test.setTimeout(180000)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`/admin/catalogue?kind=${kind}`)
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    await expect(page).toHaveURL(/admin\/catalogue/)
    const grid = page.locator('[data-catalogue-grid]')
    await expect(grid).toHaveAttribute('aria-busy', 'false', { timeout: 60000 })
    await expect(grid.locator('article').nth(7)).toBeVisible()
    const width = (await grid.locator('article').first().boundingBox()).width
    await page.getByRole('button', { name: 'Show smaller cards', exact: true }).click()
    await expect(grid).toHaveAttribute('data-catalogue-grid', 'compact')
    for (const viewport of [1440, 1200]) {
      await page.setViewportSize({ width: viewport, height: 1000 })
      await expect
        .poll(() =>
          grid.evaluate(
            el => getComputedStyle(el).gridTemplateColumns.split(' ').length,
          ),
        )
        .toBe(8)
      const boxes = await grid.locator('article').evaluateAll(nodes =>
        nodes.slice(0, 8).map(n => ({
          top: n.getBoundingClientRect().top,
          width: n.getBoundingClientRect().width,
        })),
      )
      expect(boxes).toHaveLength(8)
      expect(boxes.every(box => Math.abs(box.top - boxes[0].top) < 1)).toBe(true)
      expect(boxes[0].width).toBeLessThan(width)
      expect(await grid.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    }
    await expect(
      grid.locator('article').first().locator('.bits-index-card__description'),
    ).toBeHidden()
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed browser evidence directory.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `${kind}-compact-grid.png`),
    })
    await grid.locator('article').first().click()
    await expect(page).toHaveURL(new RegExp(`/admin/catalog/${kind}/`))
    await page.goBack()
    await expect(grid).toHaveAttribute('data-catalogue-grid', 'compact')
    await page.getByRole('button', { name: 'Show larger cards', exact: true }).click()
    await expect(grid).toHaveAttribute('data-catalogue-grid', 'regular')
  })
}
