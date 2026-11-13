// NODE
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect as baseExpect } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 45000 })
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port PORT chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  page.setDefaultTimeout(45000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', async response => {
    if (response.status() >= 400)
      console.log(
        response.status(),
        response.url(),
        (await response.text().catch(() => '')).slice(0, 300),
      )
  })
  await page.goto(`${origin}/admin`, { timeout: 120000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  await page.goto(`${origin}/admin/catalog/brand/arome`, { timeout: 120000 })
  await expect(page.getByRole('group', { name: 'Name · en', exact: true })).toHaveText(
    'Arome',
  )
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  const picker = page.getByRole('region', { name: 'Wikidata', exact: true })
  console.log('Filling Wikidata search')
  await picker.getByRole('textbox', { name: 'Search Wikidata' }).fill('Starbucks')
  await expect(picker.getByRole('textbox', { name: 'Search Wikidata' })).toHaveValue(
    'Starbucks',
  )
  await picker.getByRole('button', { name: 'Search Wikidata', exact: true }).click()
  await picker.getByRole('button', { name: /Starbucks · Q37158/ }).click()
  await expect(picker.getByRole('link', { name: 'Starbucks · Q37158' })).toBeVisible({
    timeout: 30000,
  })
  await expect(picker.getByRole('button', { name: 'Use this logo' })).toBeVisible({
    timeout: 30000,
  })
  console.log('Clearing Wikidata selection')
  await picker.getByRole('button', { name: 'Clear selection' }).click()
  await expect(picker.getByRole('textbox', { name: 'Search Wikidata' })).toHaveValue(
    'Starbucks',
  )
  await picker.getByRole('button', { name: /Starbucks · Q37158/ }).click()
  await picker.getByRole('button', { name: 'Use this logo' }).click()
  await expect(
    page
      .locator('[aria-label="Brand image"]')
      .getByRole('link', { name: /Wikimedia|public domain|PD-|CC /i }),
  ).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  for (const width of [1440, 1200]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(picker.getByRole('link', { name: 'Starbucks · Q37158' })).toBeVisible({
      timeout: 30000,
    })
    await page.screenshot({
      path: resolve(artifacts, `wikidata-${width}.png`),
      fullPage: true,
    })
  }
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Reset', exact: true })
    .click()
  await expect(picker.getByRole('link', { name: 'Starbucks · Q37158' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Name · en', exact: true })).toHaveText(
    'Arome',
  )
  await writeFile(
    resolve(artifacts, 'wikidata-results.json'),
    JSON.stringify(
      { liveProvider: true, searchSelectionLogoReset: true, errors },
      null,
      2,
    ),
  )
  expect(errors).toEqual([])
} catch (cause) {
  await page.screenshot({
    path: resolve(artifacts, 'wikidata-failure.png'),
    fullPage: true,
  })
  await writeFile(
    resolve(artifacts, 'wikidata-failure.txt'),
    await page.locator('body').innerText(),
  )
  throw cause
} finally {
  await browser.close()
}
