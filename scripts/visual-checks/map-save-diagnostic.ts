import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
const origin = process.env.PLAYWRIGHT_BASE_URL!
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage()
  page.on('response', async r => {
    if (r.url().includes('/_app/remote/') && r.request().method() === 'POST')
      console.log('REMOTE', r.status(), (await r.text()).slice(0, 1500))
  })
  await page.goto(`${origin}/admin/premises-maps?map=kowloon-tong-mtr`)
  assert.equal(
    (await (await page.request.get(`${origin}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  await expect(page.locator('[data-connection-map="left"]')).toBeVisible({
    timeout: 120000,
  })
  console.log(
    await page.evaluate(async () => {
      const api = await import('/src/lib/api/premisesMaps.remote.ts')
      const d = await api.getPremisesMapDraft({ id: 'kowloon-tong-mtr' })
      try {
        // A stale fence must fail without changing the draft.
        await api.savePremisesMapDraft({
          id: 'kowloon-tong-mtr',
          expectedVersion: 0,
          connections: d.bundle.data.connections,
        })
        throw new Error('Stale save unexpectedly succeeded')
      } catch (e) {
        if (e.status !== 409 || e.body?.message !== 'MAP_CONFLICT') throw e
        return 'PASS: stale save returns MAP_CONFLICT without altering draft'
      }
    }),
  )
  await page.getByRole('combobox', { name: 'Left floor' }).click()
  await page.getByRole('option', { name: 'Concourse Level', exact: true }).click()
  const unit = page.locator(
    '[data-connection-map="left"] [data-facility="028dc308-38d5-4450-92d8-72f369357761"]',
  )
  await unit.focus()
  await unit.press('Enter')
  const link = page.getByRole('button', {
    name: 'Exit D Mezzanine Level · 3D network',
    exact: true,
  })
  await expect(link).toBeVisible()
  await link.click()
  await expect(
    page.locator('[data-connection-map="right"] [data-state="Selected"]'),
  ).toHaveAttribute('data-facility', '91a1141f-3e5a-4105-ad68-ad842a405218')
  await expect(
    page.getByRole('button', { name: 'Save connections', exact: true }),
  ).toBeDisabled()
  await page.screenshot({
    path: `${process.env.DEV_RUNNER_ARTIFACTS}/kowloon-tong-source-stairs.png`,
  })
  console.log(
    'PASS: recovered source stair pair is visible and selectable without making a correction',
  )
} finally {
  await browser.close()
}
