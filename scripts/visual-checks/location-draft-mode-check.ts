// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
// NODE
import { writeFile } from 'node:fs/promises'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!base || !output || !placement) throw Error('Use dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', '--disable-web-security', `--class=${placement}`],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors: string[] = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(`${base}/admin`, { timeout: 120000 })
  const session = await (await page.request.get(`${base}/api/auth/get-session`)).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  await page.goto(`${base}/admin/locations`, { timeout: 120000 })
  const publication = page.getByRole('combobox').filter({ hasText: 'Published' })
  if (!(await publication.isVisible())) {
    const show = page.getByRole('button', { name: 'Show filters', exact: true })
    if (await show.isVisible()) await show.click()
  }
  await expect(publication).toBeVisible({ timeout: 60000 })
  await publication.click()
  await page.getByRole('option', { name: 'Draft', exact: true }).click()
  await expect(page.getByText('Upstream draft', { exact: true }).first()).toBeVisible({
    timeout: 60000,
  })
  for (const width of [1440, 1200]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(
      page.getByRole('combobox').filter({ hasText: 'Draft' }),
    ).toBeInViewport()
    await page.screenshot({ path: `${output}/draft-filter-${width}.png` })
  }
  await page.getByRole('combobox').filter({ hasText: 'Draft' }).click()
  await page.getByRole('option', { name: 'Published', exact: true }).click()
  await expect(page.getByText('Upstream draft', { exact: true })).toHaveCount(0, {
    timeout: 60000,
  })
  expect(errors).toEqual([])
} finally {
  await writeFile(`${output}/draft-mode-errors.json`, JSON.stringify(errors))
  await writeFile(
    `${output}/draft-mode-dom.txt`,
    await page.locator('body').innerText(),
  )
  await page.screenshot({ path: `${output}/draft-mode-final.png` })
  await browser.close()
}
