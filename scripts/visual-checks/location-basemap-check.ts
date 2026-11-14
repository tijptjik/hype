// NODE
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!base || !output || !placement) throw new Error('Use dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', '--disable-web-security', `--class=${placement}`],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const tiles: { path: string; status: number }[] = []
const failures: string[] = []
page.on('pageerror', error => failures.push(error.message))
page.on('requestfailed', request =>
  failures.push(new URL(request.url()).pathname + ': ' + request.failure()?.errorText),
)
page.on('response', response => {
  if (response.status() >= 400)
    failures.push(`${new URL(response.url()).pathname}: HTTP ${response.status()}`)
  const url = new URL(response.url())
  if (url.pathname.includes('/api/dev-basemap/'))
    tiles.push({ path: url.pathname, status: response.status() })
})
try {
  await page.goto(`${base}/admin/locations/fCrC6I7ziH9W`, { timeout: 120000 })
  const session = await (await page.request.get(`${base}/api/auth/get-session`)).json()
  assert.equal(session?.user?.id, 'hype-local-agent-admin')
  assert.match(new URL(page.url()).pathname, /^\/admin\/locations\//)
  await expect(page.getByText('Upstream draft', { exact: true })).toBeVisible({
    timeout: 15000,
  })
  await expect
    .poll(() => tiles.some(tile => tile.path.endsWith('.mvt') && tile.status === 200), {
      timeout: 60000,
    })
    .toBe(true)
  await page.waitForTimeout(3000)
  assert(tiles.some(tile => tile.path.endsWith('.mvt') && tile.status === 200))
  assert(!tiles.some(tile => tile.status >= 400), JSON.stringify(tiles))
  await page.screenshot({ path: `${output}/kennedy-town-basemap.png` })
} finally {
  await page.screenshot({ path: `${output}/kennedy-town-basemap-final.png` })
  await writeFile(`${output}/basemap-page.txt`, await page.locator('body').innerText())
  await writeFile(`${output}/basemap-errors.json`, JSON.stringify(failures, null, 2))
  await writeFile(`${output}/basemap-responses.json`, JSON.stringify(tiles, null, 2))
  await browser.close()
}
