// NODE
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
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
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.route('**/api/identity-catalogue/logos/*', route =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"message":"LOGO_NOT_FOUND"}',
    }),
  )
  await page.goto(`${origin}/admin/catalogue?kind=group`, { timeout: 120_000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toBe('/admin/catalogue')
  const kindPicker = page.getByRole('combobox', { name: 'Kind', exact: true })
  if (await kindPicker.count()) await kindPicker.selectOption('group')
  await page
    .getByRole('button', { name: 'Convenience Retail Asia', exact: true })
    .waitFor()
  const images = page.locator('img[src^="/groups/breadline/"]')
  await expect(images).toHaveCount(7, { timeout: 60000 })
  await expect
    .poll(async () =>
      images.evaluateAll(nodes =>
        nodes.every(image => image.complete && image.naturalWidth > 0),
      ),
    )
    .toBe(true)
  await expect(
    page.getByRole('button', { name: 'The Hongkong and Shanghai Hotels', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Yamazaki Baking', exact: true }),
  ).toBeVisible()
  await writeFile(
    resolve(artifacts, 'list-images.json'),
    JSON.stringify(
      await images.evaluateAll(images =>
        images.map(i => ({
          src: i.getAttribute('src'),
          complete: i.complete,
          width: i.naturalWidth,
        })),
      ),
      null,
      2,
    ),
  )
  for (const width of [1440, 800, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 390)
      await expect(page.getByText('Window Too Small', { exact: true })).toBeVisible()
    else await expect(images).toHaveCount(7)
    await page.screenshot({ path: resolve(artifacts, `list-${width}.png`) })
  }
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages())
      await page
        .screenshot({ path: resolve(artifacts, 'images-failure.png') })
        .catch(() => {})
  throw error
} finally {
  await browser.close()
}
