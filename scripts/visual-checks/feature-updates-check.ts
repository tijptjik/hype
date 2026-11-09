// Verify the saved Feature address and Updates views with the local-only dev:agent account.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright', { recursive: true })
const browser = await chromium.launch({ args: ['--disable-web-security'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(30000)
const errors: string[] = []
page.on('pageerror', error => {
  errors.push(error.message)
  console.error(error.message)
})
try {
  await page.goto(
    'http://127.0.0.1:4173/admin/features/lifecycle-demo-e-feature#updates',
  )
  await page.locator('[data-feature-location-updates]').waitFor()
  await page.getByText('Permanently closed', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page
    .getByRole('button', { name: 'Review latest Location address', exact: true })
    .waitFor()
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'output/playwright/feature-updates-lifecycle.png' })
  await page.goto(
    'http://127.0.0.1:4173/admin/features/lifecycle-demo-e-feature#location',
  )
  const facet = page.locator('[data-facet-id="location"]')
  await facet.locator('[data-location-widget]').waitFor()
  await facet.locator('[data-address-toolbar-display]').waitFor()
  if (await facet.getByRole('heading', { name: 'Lifecycle', exact: true }).count())
    throw new Error('Lifecycle still in Location')
  if (await facet.getByText('Location settings', { exact: true }).count())
    throw new Error('Settings still in Location')
  if (await facet.getByRole('textbox', { name: 'Lookup Address', exact: true }).count())
    throw new Error('Old lookup toolbar remains')
  await page.waitForTimeout(700)
  await page.screenshot({
    path: 'output/playwright/feature-location-saved-toolbar.png',
  })
  await facet.getByRole('link', { name: 'Location connection', exact: true }).click()
  await page.locator('[data-feature-location-updates]').waitFor({ state: 'visible' })
  await page.getByText('Permanently closed', { exact: true }).waitFor()
  await page.goto('http://127.0.0.1:4173/admin/features/GPsiq0ySxzg-#location')
  await page
    .locator('[data-facet-id="location"] [data-address-toolbar-display]')
    .waitFor()
  if (await page.getByRole('button', { name: 'Edit', exact: true }).count())
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.locator('[data-address-editor-layout]').waitFor()
  await page.waitForTimeout(700)
  await page.screenshot({
    path: 'output/playwright/feature-location-joyful-redesign.png',
  })
  await page.goto('http://127.0.0.1:4173/admin/features/GPsiq0ySxzg-#updates')
  await page.locator('[data-feature-location-updates]').waitFor()
  if (await page.getByRole('heading', { name: 'Location status', exact: true }).count())
    throw new Error('Unknown lifecycle shown')
  await page.goto('http://127.0.0.1:4173/admin/features/new#core')
  await page.locator('[data-facet-id="core"]').waitFor()
  if (await page.getByRole('tab', { name: 'Updates', exact: true }).count())
    throw new Error('New Feature exposes Updates')
  console.log(
    JSON.stringify({
      liveDemo: 'lifecycle-demo-e-feature',
      lifecycleInUpdates: true,
      savedToolbar: true,
      connectionNavigation: true,
      errors,
    }),
  )
} catch (error) {
  console.log('Current URL:', page.url())
  console.log((await page.locator('body').innerText()).slice(0, 2800))
  await page.screenshot({ path: 'output/playwright/feature-updates-debug.png' })
  throw error
} finally {
  await browser.close()
}
