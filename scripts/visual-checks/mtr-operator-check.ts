// NODE
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect as baseExpect } from '@playwright/test'

const expect = baseExpect.configure({ timeout: 60000 })

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port PORT chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-web-security', '--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.setDefaultTimeout(60000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(
    `${origin}/admin/locations?publication=draft&kind=premises&q=Quarry%20Bay`,
    { timeout: 120000, waitUntil: 'domcontentloaded' },
  )
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toBe('/admin/locations')
  const station = page.getByRole('link', { name: 'Quarry Bay MTR', exact: true })
  await expect(station).toBeVisible({ timeout: 60000 })
  const logo = page.getByRole('img', { name: 'MTR Corporation', exact: true })
  await expect(logo).toBeVisible()
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  await page.screenshot({ path: resolve(artifacts, 'mtr-operator-list.png') })
  await station.click()
  await expect(page.getByText('Operator', { exact: true })).toBeVisible({
    timeout: 60000,
  })
  await expect(page.getByText('MTR Corporation', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: resolve(artifacts, 'mtr-operator-details.png') })
  await page.goBack({ waitUntil: 'domcontentloaded' })
  await expect(station).toBeVisible({ timeout: 60000 })
  await expect(logo).toBeVisible()
  expect(new URL(page.url()).searchParams.get('publication')).toBe('draft')
  await page.goto(
    `${origin}/admin/locations?publication=draft&kind=premises&q=Kennedy%20Town`,
    { waitUntil: 'domcontentloaded' },
  )
  const kennedyTown = page.getByRole('link', { name: 'Kennedy Town MTR', exact: true })
  await expect(kennedyTown).toBeVisible({ timeout: 60000 })
  await kennedyTown.click()
  await expect(page.getByText('KET', { exact: true })).toBeVisible()
  const mapLink = page.getByRole('link', { name: 'View premises map', exact: true })
  await expect(mapLink).toHaveAttribute('href', '/premises/kennedy-town-mtr')
  await mapLink.click()
  await expect(page.locator('[data-station-scene="exploded"]')).toBeVisible({
    timeout: 120000,
  })
  await page.screenshot({ path: resolve(artifacts, 'mtr-linked-premises-map.png') })
  for (const legacy of ['mtr-ket', 'mtr-hok', 'mtr-adm']) {
    const response = await page.request.get(`${origin}/premises/${legacy}`)
    expect(response.status()).toBe(404)
  }
  expect(errors).toEqual([])
} finally {
  await browser.close()
}
