// NODE
import { writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port 4173 chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  const titles: string[] = []
  await page.goto(`${origin}/admin/projects/breadline`, { timeout: 120000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toBe('/admin/projects/breadline')
  const organisation = page.locator(
    '.bits-header__breadcrumbs:visible a[href^="/admin/organisations/"]',
  )
  await expect(organisation).toHaveCount(1, { timeout: 120000 })
  await expect(organisation).toHaveText(/\S/)
  await expect(page).toHaveTitle(/Breadline · (?:Profile|Capabilities) · HYPE\.HK$/)
  titles.push(await page.title())
  await page.screenshot({ path: `${artifacts}/project-breadcrumb.png` })
  await page.locator('button[data-facet-ref="capabilities"]:visible').click()
  await expect(page).toHaveTitle(/Breadline · Capabilities · HYPE\.HK$/)
  titles.push(await page.title())
  await page.goto(`${origin}/admin/projects/breadline/match-locations`, {
    timeout: 120000,
  })
  await expect(page).toHaveTitle(/Breadline · Match locations · HYPE\.HK$/, {
    timeout: 120000,
  })
  titles.push(await page.title())
  await page.screenshot({ path: `${artifacts}/match-locations-title.png` })
  await page.goBack()
  await expect(organisation).toHaveCount(1, { timeout: 120000 })
  await expect(page).toHaveTitle(/Breadline · (?:Profile|Capabilities) · HYPE\.HK$/)
  expect(await page.title()).not.toContain('Match locations')
  await writeFile(`${artifacts}/titles.json`, JSON.stringify(titles, null, 2))
} catch (error) {
  await page.screenshot({ path: `${artifacts}/failure.png` })
  await writeFile(`${artifacts}/failure.html`, await page.content())
  throw error
} finally {
  await browser.close()
}
