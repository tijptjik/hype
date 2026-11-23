import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(base)
  const session = await (await page.request.get(`${base}/api/auth/get-session`)).json()
  assert.equal(session?.user?.id, 'hype-local-agent-admin')
  const response = await page.goto(`${base}/admin/features/vg0uryG54sIM#location`)
  assert(response?.ok())
  assert(new URL(page.url()).pathname.startsWith('/admin/'))
  const submits: string[] = []
  await page.route('**/*', async route => {
    if (
      route.request().method() === 'POST' &&
      route.request().url().includes('featureForm')
    ) {
      submits.push(route.request().url())
      await route.abort()
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Section Sync', exact: true }).click()
  const toggle = page.locator('[data-linked-field="names"]')
  await toggle.waitFor()
  const original = await toggle.getAttribute('data-linked-mode')
  assert.equal(original, 'community')
  for (const mode of ['community', 'internal']) {
    await page.mouse.move(1100, 100)
    await page
      .locator('[data-linked-section-help]:visible')
      .waitFor({ state: 'hidden' })
    await toggle.hover()
    const help = page.locator('[data-linked-section-help]:visible')
    await help.waitFor()
    await page.waitForTimeout(400)
    assert(await help.isVisible())
    assert(
      (await help.innerText()).includes(
        mode === 'community' ? 'Community section' : 'Internal section',
      ),
    )
    assert(
      (await help.innerText()).includes(
        mode === 'community'
          ? 'keep your entries from becoming a community curation'
          : 'contribute your changes to the community',
      ),
    )
    assert((await help.innerText()).includes('Check Sync policy'))
    assert.equal(await help.locator('svg').count(), 2)
    assert.equal(await toggle.getAttribute('title'), null)
    await page.screenshot({ path: `${output}/linked-section-${mode}.png` })
    await page.keyboard.press('Escape')
    await toggle.click()
    await page.keyboard.press('Escape')
  }
  assert.equal(await toggle.getAttribute('data-linked-mode'), original)
  assert.deepEqual(submits, [])
} finally {
  await browser.close()
}
