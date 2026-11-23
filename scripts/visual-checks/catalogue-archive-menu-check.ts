// NODE
import { mkdir } from 'node:fs/promises'
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
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/admin`, { timeout: 120000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  for (const [kind, code, name] of [
    ['brand', 'arome', 'Arome'],
    ['group', 'maxims-group', "Maxim's Group"],
  ]) {
    await page.goto(`${origin}/admin/catalog/${kind}/${code}`, { timeout: 120000 })
    const trigger = page
      .getByRole('banner')
      .getByRole('button', { name: `${name} actions`, exact: true })
    await expect(trigger).toBeVisible({ timeout: 120000 })
    await trigger.click()
    await expect(
      page.getByRole('menuitem', { name: 'Delete', exact: true }),
    ).toBeVisible()
    await page.screenshot({
      path: resolve(artifacts, `catalogue-archive-${kind}.png`),
      fullPage: true,
    })
    await page.keyboard.press('Escape')
  }
  expect(errors).toEqual([])
} finally {
  await browser.close()
}
