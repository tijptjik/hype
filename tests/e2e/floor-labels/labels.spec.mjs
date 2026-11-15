import { test, expect } from '@playwright/test'
import { join } from 'node:path'
for (const width of [1440, 390]) {
  test(`floor notation and subtitles at ${width}`, async ({ page }) => {
    test.setTimeout(180000)
    await page.setViewportSize({ width, height: 1000 })
    for (const [station, labels, subtitles] of [
      ['hku', ['Exit A2 · 8/F', 'Exit A1 · 2/F', 'Exit A1 · 1/F', 'Exit A1 · G/F'], []],
      [
        'hong-kong',
        ['Exit E · U1/F', 'Exit C · Concourse', 'Platform · Tung Chung Line'],
        ['Platform · Tung Chung Line'],
      ],
      [
        'ho-man-tin',
        ['Platform · Kwun Tong Line', 'Plant Room · Near Exit A'],
        ['Plant Room · Near Exit A', 'Plant Room · Near Exit B'],
      ],
      [
        'kowloon',
        ['Platform 1 · Airport Express', 'Exit C1 · Concourse · Tung Chung Line'],
        ['Concourse · Exit C1 · Tung Chung Line'],
      ],
      [
        'siu-hong',
        ['Exit C2 · G/F · To Light Rail Platform 3'],
        ['Ground · Exit C2 · To Light Rail Platform 3'],
      ],
    ]) {
      await page.goto(`/premises/${station}-mtr`)
      await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
      for (const label of labels)
        await expect(page.locator('[data-floor-labels]')).toContainText(label)
      for (const subtitle of subtitles) {
        const button = page.getByRole('button', { name: subtitle, exact: true })
        if (!(await button.isVisible()))
          await page.getByText('Levels', { exact: true }).last().click()
        await expect(button).toBeVisible()
        await expect(button.locator('span.text-xs')).toHaveText(
          subtitle.split(' · ').slice(1).join(' · '),
        )
      }
      await page.screenshot({
        // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence.
        path: join(process.env.DEV_RUNNER_ARTIFACTS, `${station}-labels-${width}.png`),
      })
    }
  })
}

for (const width of [1440, 390]) {
  test(`basement exits at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/premises/causeway-bay-mtr')
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    for (const label of ['Exit F2 · B1/F', 'Exit D3 & D4 · B1/F']) {
      await expect(page.locator('[data-floor-labels]')).toContainText(label)
    }
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `basement-labels-${width}.png`),
    })
  })
}
