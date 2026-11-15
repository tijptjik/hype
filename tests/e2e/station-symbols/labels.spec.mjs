import { test, expect } from '@playwright/test'
import { join } from 'node:path'

for (const width of [1440, 390]) {
  test(`station labels and symbols at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    for (const [slug, label] of [
      ['admiralty', 'Ground · Exit E1 & E2'],
      ['causeway-bay', 'Basement Level 1 · Exit D3 & D4'],
    ]) {
      await page.goto(`/premises/${slug}-mtr`)
      await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
      const levels = page.getByRole('button', { name: label, exact: true })
      if (!(await levels.isVisible()))
        await page.getByText('Levels', { exact: true }).last().click()
      await expect(levels).toBeVisible()
      await expect(levels).toContainText(label.split(' · ')[1])
      await levels.click()
      await expect(levels).toHaveAttribute('aria-pressed', 'true')
      if (slug === 'admiralty') {
        const legend = page.getByRole('list', { name: 'Map symbol legend' })
        if (!(await legend.isVisible()))
          await page.getByText('Map symbols', { exact: true }).click()
        await expect(legend).toContainText("Mother's room")
        await expect(legend).toContainText('Wheelchair assist')
        const labels = await legend.locator('li').allTextContents()
        const rank = term => labels.findIndex(label => label.includes(term))
        expect(rank("Mother's room")).toBeLessThan(rank('Defibrillator'))
        expect(rank('Wheelchair assist')).toBeLessThan(rank('Defibrillator'))
        const paths = await legend
          .locator('button')
          .evaluateAll(buttons =>
            buttons
              .filter(b =>
                /Mother's room|Wheelchair assist|Information/.test(b.textContent),
              )
              .map(b => b.querySelector('path').getAttribute('d')),
          )
        expect(new Set(paths).size).toBe(3)
        const connections = page.getByRole('list', {
          name: 'Connection legend',
          includeHidden: true,
        })
        expect(
          (await connections.locator('button').allTextContents()).map(text =>
            text.trim(),
          ),
        ).toEqual(['Lift', 'Escalator', 'Ramp', 'Stairs'])
        const service = page.getByRole('button', {
          name: 'Platform · Island Line / Tsuen Wan Line',
          exact: true,
        })
        if (width === 1440) {
          const subtitle = service.locator('span.text-xs')
          expect(
            await subtitle.evaluate(el => el.getBoundingClientRect().height),
          ).toBeLessThan(20)
        } else {
          const levelBox = await service.boundingBox()
          const legendBox = await legend.boundingBox()
          expect(levelBox.x + levelBox.width).toBeLessThanOrEqual(legendBox.x)
        }
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true)
      await page.screenshot({
        // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence.
        path: join(process.env.DEV_RUNNER_ARTIFACTS, `${slug}-symbols-${width}.png`),
      })
    }
  })
}

for (const width of [1440, 390]) {
  test(`airport platforms and reception at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/premises/airport-mtr')
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    const platform = page.getByRole('button', {
      name: 'Platform 2 · To AsiaWorld-Expo',
      exact: true,
    })
    if (!(await platform.isVisible()))
      await page.getByText('Levels', { exact: true }).last().click()
    await expect(platform).toContainText('To AsiaWorld-Expo')
    await expect(
      page.getByRole('button', { name: 'Platform 1 · To City', exact: true }),
    ).toBeVisible()
    const legend = page.getByRole('list', { name: 'Map symbol legend' })
    if (!(await legend.isVisible()))
      await page.getByText('Map symbols', { exact: true }).click()
    const labels = await legend.locator('li').allTextContents()
    expect(labels.findIndex(label => label.includes('Reception desk'))).toBe(
      labels.findIndex(label => label.includes('Information')) + 1,
    )
    const paths = await legend
      .locator('button')
      .evaluateAll(buttons =>
        buttons
          .filter(b => /Reception desk|Information/.test(b.textContent))
          .map(b => b.querySelector('path').getAttribute('d')),
      )
    expect(new Set(paths).size).toBe(2)
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner evidence.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `airport-symbols-${width}.png`),
    })
  })
}
