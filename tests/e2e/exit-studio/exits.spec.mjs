import { test, expect } from '@playwright/test'
import { join } from 'node:path'

for (const width of [1440, 390]) {
  test(`exit studio catalogue and controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/themes/exits')
    await expect(
      page.getByRole('heading', { name: 'Exit signs', exact: true }),
    ).toBeVisible()
    await expect(page.locator('[data-exit-specimen]')).toHaveCount(62)
    const search = page.getByRole('searchbox', { name: 'Find an exit or station code' })
    await search.fill('D3')
    await expect(page.locator('[data-exit-specimen]')).toHaveCount(1)
    await expect(page.locator('[data-exit-suffix]')).toHaveText('3')
    await page.getByRole('checkbox', { name: 'Selected state' }).check()
    await expect(page.locator('[data-exit-background]')).toHaveAttribute(
      'stroke-width',
      '3',
    )
    await page.getByRole('slider', { name: 'Badge size' }).fill('96')
    await expect(page.locator('[data-exit-specimen] svg')).toHaveAttribute(
      'width',
      '108',
    )
    await search.fill('no-such-code')
    await expect(page.getByText('No matching exit codes.')).toBeVisible()
    await search.fill('')
    await page.getByRole('checkbox', { name: 'Selected state' }).uncheck()
    await page.getByRole('slider', { name: 'Badge size' }).fill('64')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.evaluate(() => document.fonts.ready)
    const pairs = await page.locator('[data-exit-specimen]').evaluateAll(items =>
      items.flatMap(item => {
        const number = item.querySelector('[data-exit-suffix]')
        if (!number) return []
        const letter = item.querySelector('[data-exit-letter]').getBBox()
        const suffix = number.getBBox()
        return [
          {
            code: item.dataset.exitSpecimen,
            gap: suffix.x - (letter.x + letter.width),
            centre: (letter.x + suffix.x + suffix.width) / 2,
            left: letter.x,
            right: suffix.x + suffix.width,
          },
        ]
      }),
    )
    for (const pair of pairs) {
      // Optical kerning can overlap advance boxes without overlapping the glyphs.
      expect(pair.gap, `${pair.code} gap`).toBeGreaterThan(-1.2)
      expect(pair.gap, `${pair.code} gap`).toBeLessThan(1.1)
      expect(Math.abs(pair.centre), `${pair.code} centring`).toBeLessThan(0.6)
      expect(pair.left).toBeGreaterThan(-12)
      expect(pair.right).toBeLessThan(12)
    }
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence directory.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `exit-studio-${width}.png`),
    })
    await page.getByRole('slider', { name: 'Badge size' }).fill('96')
    await page
      .getByRole('heading', { name: 'Numbered exits', exact: true })
      .scrollIntoViewIfNeeded()
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence directory.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `exit-pairs-${width}.png`),
    })
    for (const code of ['D6', 'G2', 'N1', 'N2', 'N3', 'N4', 'N5']) {
      await search.fill(code)
      await page.getByRole('slider', { name: 'Badge size' }).fill('64')
      await expect(page.locator(`[data-exit-specimen="${code}"]`)).toBeVisible()
      await page.locator(`[data-exit-specimen="${code}"]`).screenshot({
        path: join(
          // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence directory.
          process.env.DEV_RUNNER_ARTIFACTS,
          `exit-optical-${code}-${width}.png`,
        ),
      })
    }
    await page.reload()
    await expect(page.locator('[data-exit-specimen]')).toHaveCount(62)
  })
}
