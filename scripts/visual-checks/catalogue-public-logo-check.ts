// NODE
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port 5175 chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
try {
  // Public asset verification deliberately uses no session; it targets the server behind hype.localhost.
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  const path =
    '/api/identity-catalogue/logos/79936bc8-f6cc-4d9b-a0fd-0c9e6e8e9a66?retry=2'
  const response = await page.goto(origin + path)
  expect(response?.status()).toBe(200)
  expect(response?.headers()['content-type']).toBe('image/png')
  const image = page.locator('img')
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBe(512)
  await page.screenshot({ path: resolve(artifacts, 'seven-eleven-public-logo.png') })
  await writeFile(
    resolve(artifacts, 'public-logo.json'),
    JSON.stringify({
      path,
      status: response?.status(),
      width: 512,
      unauthenticated: true,
    }),
  )
} finally {
  await browser.close()
}
