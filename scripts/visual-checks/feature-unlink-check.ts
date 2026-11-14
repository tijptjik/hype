import { chromium, expect } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!base || !output || !placement) throw Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', '--disable-web-security', `--class=${placement}`],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  await page.goto(`${base}/admin`, { timeout: 120000 })
  expect(
    (await (await page.request.get(`${base}/api/auth/get-session`)).json())?.user?.id,
  ).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  await page.goto(`${base}/admin/features/blD162753c27#location`, { timeout: 120000 })
  await page
    .getByRole('button', { name: 'Edit', exact: true })
    .click({ timeout: 60000 })
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  const unlink = page.locator('[data-location-unlink]')
  await expect(unlink).toBeVisible({ timeout: 60000 })
  await expect(unlink).toBeEnabled()
  for (const width of [1440, 1200]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(unlink).toBeInViewport()
    await page.screenshot({ path: `${output}/unlink-${width}.png` })
  }
  if (process.env.HYPE_E2E_PRIVATE_STATE === '1') {
    // Only a private database may exercise the successful persisted mutation.
    await unlink.click()
    await expect(page.getByText('No Location associated', { exact: true })).toBeVisible(
      { timeout: 60000 },
    )
    await page.reload()
    await page.getByRole('button', { name: 'Location', exact: true }).click()
    await expect(page.getByText('No Location associated', { exact: true })).toBeVisible(
      { timeout: 60000 },
    )
  } else {
    // Abort the command to exercise failure recovery without changing the user's data.
    let attempted = false
    await page.route('**/*', async route => {
      if (route.request().method() === 'POST') {
        attempted = true
        await route.abort()
      } else await route.continue()
    })
    await unlink.click()
    await expect.poll(() => attempted).toBe(true)
    await expect(
      page.getByRole('alert').filter({ hasText: 'Unable to load or link' }).first(),
    ).toBeVisible()
    await expect(unlink).toBeEnabled()
  }
} finally {
  await page.screenshot({ path: `${output}/unlink-final.png` })
  await browser.close()
}
