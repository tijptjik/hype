// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement) throw new Error('Use dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(origin)
  assert.equal(
    (await (await page.request.get(`${origin}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  for (const [slug, name] of [
    ['admiralty-mtr', 'Admiralty'],
    ['kennedy-town-mtr', 'Kennedy Town'],
  ]) {
    await page.goto(`${origin}/premises/${slug}`)
    await expect(page).toHaveTitle(`ᴰᴱⱽ ${name} · HYPE.HK`, { timeout: 60000 })
    const index = page.getByRole('navigation', { name: 'Indoor levels' })
    await expect(index).toBeVisible({ timeout: 60000 })
    const floor = index.getByRole('button').nth(1)
    const label = await floor.getAttribute('aria-label')
    assert(label)
    await floor.click()
    await expect(page).toHaveTitle(`ᴰᴱⱽ ${name} · ${label} · HYPE.HK`)
    await index.getByRole('button', { name: 'All', exact: true }).click()
    await expect(page).toHaveTitle(`ᴰᴱⱽ ${name} · HYPE.HK`)
    if (slug === 'kennedy-town-mtr') {
      await expect(
        page.locator('[data-connector-relief][data-source-network-edge]'),
      ).toHaveCount(41)
      await expect(
        page.locator('[data-connector-relief][data-exterior-continuation="true"]'),
      ).toHaveCount(7)
      assert((await page.locator('[data-connector-recess-face]').count()) > 0)
      const exterior = page.locator(
        '[data-connector-relief][data-exterior-continuation="true"]',
      )
      for (const item of await exterior.all()) {
        assert.equal(await item.getAttribute('clip-path'), null)
        await expect(item.locator('[data-connector-recess-face]')).toHaveCount(0)
      }
      for (const floorIndex of [1, 2, 3, 4]) {
        const floor = index.getByRole('button').nth(floorIndex)
        await floor.click()
        await page.waitForTimeout(900)
        const camera = page.getByRole('application', {
          name: 'Station plan controls',
          exact: true,
        })
        await camera.focus()
        await camera.press('0')
        for (let i = 0; i < 8; i++) await camera.press('ArrowUp')
        await page.waitForTimeout(700)
        await page.screenshot({
          path: `${artifacts}/kennedy-town-exit-${floorIndex}.png`,
        })
      }
      await index.getByRole('button', { name: 'All', exact: true }).click()
      console.log(
        'Kennedy Town source-backed reliefs:',
        await page.locator('[data-connector-relief][data-source-network-edge]').count(),
      )
    }
    await page.screenshot({ path: `${artifacts}/${slug}-title.png` })
  }
  await page.goto(`${origin}/admin/locations/wY-1kSY7x1kL?panel=settings`)
  const scene = page.locator('[data-location-indoor-map] [data-station-scene]')
  await expect(scene).toBeVisible({ timeout: 120000 })
  await page.screenshot({ path: `${artifacts}/kennedy-town-admin.png` })
  const controls = page.getByRole('application', {
    name: 'Station plan controls',
    exact: true,
  })
  const bearing = Number(await scene.getAttribute('data-camera-bearing'))
  await controls.focus()
  await controls.press('ArrowRight')
  await expect
    .poll(async () => Number(await scene.getAttribute('data-camera-bearing')))
    .toBeCloseTo(bearing + 10, 1)
  await page.screenshot({ path: `${artifacts}/kennedy-town-admin-rotated.png` })
  console.log(
    'PASS: public premises titles, development prefix, selected floor and all-level reset',
  )
} finally {
  await browser.close()
}
