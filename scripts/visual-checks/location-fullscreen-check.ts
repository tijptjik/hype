import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--disable-web-security',
    '--ozone-platform=x11',
    `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`,
  ],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/admin/locations/4EY5jL6MWVAI`)
  assert.equal(
    (await (await page.request.get(`${base}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 120000 })
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion })
    for (const name of ['indoor map', 'context map']) {
      const original = await page
        .locator(
          name === 'indoor map'
            ? '[data-station-scene]'
            : '[data-location-context-map] canvas',
        )
        .first()
        .elementHandle()
      const expand = page.getByRole('button', { name: `Expand ${name}`, exact: true })
      await expand.click()
      const dialog = page.getByRole('dialog', { name, exact: true })
      await expect(dialog).toBeVisible()
      const collapse = dialog.getByRole('button', {
        name: `Collapse ${name}`,
        exact: true,
      })
      await expect(collapse).toBeEnabled()
      const bounds = await dialog.boundingBox()
      assert(bounds && bounds.width >= 1439 && bounds.height >= 899)
      if (name === 'indoor map') {
        await expect(
          dialog.getByRole('navigation', { name: 'Indoor levels' }),
        ).toBeVisible()
        await dialog.getByRole('button', { name: 'All', exact: true }).click()
        await expect(dialog.locator('[data-station-scene]')).toHaveAttribute(
          'data-station-scene',
          'exploded',
        )
        const levels = dialog.locator('[data-station-legend="levels"] button')
        await levels.nth(1).click()
        await expect(dialog.locator('[data-station-scene]')).toHaveAttribute(
          'data-station-scene',
          'plan',
        )
        const facility = dialog.getByRole('button', { name: /^Find / }).first()
        if (await facility.count()) await facility.click()
        assert(page.url().includes('/admin/locations/4EY5jL6MWVAI'))
      } else {
        await expect(dialog.locator('[data-map-loading]')).toHaveCount(0, {
          timeout: 120000,
        })
      }
      assert(
        await original?.evaluate(
          node => node.isConnected && Boolean(node.closest('dialog[open]')),
        ),
      )
      await page.screenshot({
        path: `${output}/${name.replace(' ', '-')}-${reducedMotion}.png`,
      })
      if (reducedMotion === 'reduce') await collapse.click()
      else await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(expand).toBeEnabled()
      await expect(expand).toBeFocused()
      assert(
        await original?.evaluate(node => node.isConnected && !node.closest('dialog')),
      )
    }
  }
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
