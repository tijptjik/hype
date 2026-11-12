// NODE
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
if (!origin || !artifacts) throw new Error('Run through dev-remote --port PORT chrome')
await mkdir(artifacts, { recursive: true })
if (!process.env.DEV_RUNNER_CHROME_CLASS)
  throw new Error('Managed Chrome placement is required')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin, { timeout: 120_000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  if (session?.user?.id !== 'hype-local-agent-admin')
    throw new Error('Expected local admin identity')
  const admin = await page.goto(`${origin}/admin`, { timeout: 120_000 })
  if (!admin?.ok() || !new URL(page.url()).pathname.startsWith('/admin'))
    throw new Error('Admin access failed')
  const response = await page.goto(`${origin}/admin/docs`, { timeout: 120_000 })
  if (!response?.ok()) throw new Error(`Admin docs HTTP ${response?.status()}`)
  await page
    .getByRole('heading', { name: 'The Location model', exact: true })
    .waitFor({ timeout: 120_000 })
  const storage = page.getByRole('heading', {
    name: 'Translations and search',
    exact: true,
  })
  await storage.scrollIntoViewIfNeeded()
  // Allow the admin route transition to finish before capturing rendered content.
  await page.waitForTimeout(1500)
  await storage.scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(artifacts, 'location-i18n-docs.png') })
  if (!(await page.locator('article').innerText()).includes('locationRevisionI18n'))
    throw new Error('Translation storage documentation missing')
  await page.getByRole('link', { name: 'Taxonomy', exact: true }).click()
  if (!page.url().endsWith('#taxonomy'))
    throw new Error('Documentation navigation failed')
  if (errors.length) throw new Error(errors.join('\n'))
  await writeFile(
    resolve(artifacts, 'location-i18n-check.json'),
    JSON.stringify({
      authenticatedAdminDocs: true,
      translationDocumentation: true,
      anchorInteraction: true,
      errors,
    }),
  )
} finally {
  await browser.close()
}
