// NODE
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
// PLAYWRIGHT
import { chromium, expect as baseExpect } from '@playwright/test'

const expect = baseExpect.configure({ timeout: 60000 })

const cases = [
  { id: 'blD02837c194', label: 'Maison Kayser - Quarry Bay' },
  { id: 'blD00328ce57', label: "Maxim's Cakes - Kwun Tong" },
  { id: 'blD02c000a36', label: '7-Eleven - Central MTR (K)' },
  { id: 'blP19581e27d', label: 'Gavin in Hanghau' },
]

/** Exercise real donor/drop-off breadcrumbs with managed Chrome.
 * @returns Screenshots and scoped transport diagnostics in the managed artifact directory.
 * @remarks Reuses the local server; an explicit public origin supports production readback.
 * Readiness requires Feature content and the breadcrumb surface, not a screenshot alone.
 */
async function main(): Promise<void> {
  const output = process.env.DEV_RUNNER_ARTIFACTS
  const browserClass = process.env.DEV_RUNNER_CHROME_CLASS
  const base = process.argv[2] ?? process.env.PLAYWRIGHT_BASE_URL
  if (!output || !browserClass || !base) throw Error('Use the managed Chrome runner')
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--ozone-platform=x11', `--class=${browserClass}`],
  })
  const results: unknown[] = []
  let failed = false
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(60000)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const row of cases) {
        const errors: string[] = []
        const capture = (error: Error): void => {
          errors.push(error.message)
        }
        page.on('pageerror', capture)
        try {
          const response = await page.goto(`${base}/features/${row.id}`, {
            waitUntil: 'domcontentloaded',
            timeout: 120000,
          })
          expect(response?.status()).toBe(200)
          await expect(page.getByText(row.label, { exact: true }).first()).toBeVisible()
          const trail = page.locator('[data-feature-breadcrumb-trail]').first()
          await expect(trail).toBeVisible()
          // Wait for the parent reads, not the initial cached breadcrumb fallback.
          await expect(trail.locator('..')).toHaveAttribute('aria-busy', 'false')
          await expect(page.getByText(/error loading hierarchy/i)).toHaveCount(0)
          await expect(
            page.getByRole('button', { name: 'Feature actions', exact: true }).first(),
          ).toBeVisible()
          // Visible parent labels remain interactive when this viewer can read them.
          const crumb = trail.getByRole('button').filter({ visible: true }).first()
          if (await crumb.count()) {
            await crumb.click()
            await expect(crumb).toHaveAttribute('aria-expanded', 'true')
            await crumb.click()
            await expect(crumb).toHaveAttribute('aria-expanded', 'false')
          }
          expect(errors).toEqual([])
          results.push({ ...row, width, passed: true })
        } catch (error) {
          failed = true
          results.push({ ...row, width, passed: false, error: String(error), errors })
        } finally {
          page.off('pageerror', capture)
          await page.screenshot({
            path: join(output, `${row.id}-${width}.png`),
            fullPage: true,
          })
          await writeFile(
            join(output, 'hierarchy.json'),
            JSON.stringify(results, null, 2),
          )
        }
      }
    }
    expect(failed).toBe(false)
  } finally {
    await browser.close()
  }
}
await main()
