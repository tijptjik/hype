import { chromium, expect } from '@playwright/test'

const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
try {
  await page.goto(`${base}/admin/field-recorder`)
  const auth = await (await page.request.get(`${base}/api/auth/get-session`)).json()
  expect(auth?.user?.id).toBe('hype-local-agent-admin')
  const links = page.locator('a[href*="field-recorder?session="]')
  await expect(links.first()).toBeVisible({ timeout: 120000 })
  const ura = links.filter({ hasText: 'URA bad boys' })
  await ((await ura.count()) ? ura.first() : links.first()).click()
  const code = page.getByLabel('Session code', { exact: true })
  await expect(code).toBeVisible({ timeout: 120000 })
  await expect(page.getByText('No default layer', { exact: true })).toHaveCount(0)
  const layers = page
    .locator('section')
    .filter({ has: page.locator('header').getByText('Layers', { exact: true }) })
    .last()
  await expect(layers.getByRole('switch').first()).toBeDisabled()
  await page.screenshot({ path: `${output}/profile-read.png`, fullPage: true })
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await code.fill('SESSION-LIVE')
  const preview = page.locator('output').last()
  await expect(preview).toContainText('SESSION-LIVE')
  const included = layers.getByRole('switch').first()
  if (!(await included.isChecked())) await included.check()
  const defaultLayer = layers.getByRole('checkbox').first()
  await defaultLayer.check()
  await expect(defaultLayer).toBeChecked()
  await defaultLayer.uncheck()
  await expect(defaultLayer).not.toBeChecked()
  await included.uncheck()
  await expect(defaultLayer).toBeDisabled()
  await included.check()
  await expect(defaultLayer).toBeEnabled()
  await page.getByRole('button', { name: 'Select Sequence', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Number of digits' }).fill('5')
  await expect(preview).toContainText('SESSION-LIVE-00001')
  await page.getByRole('checkbox', { name: 'Zero-padded', exact: true }).uncheck()
  await expect(preview).toHaveText('SESSION-LIVE-1')
  await page.getByRole('checkbox', { name: 'Zero-padded', exact: true }).check()
  await expect(preview).toContainText('SESSION-LIVE-00001')
  await page.screenshot({ path: `${output}/sequence-options.png`, fullPage: true })
  for (const width of [1440, 960, 600, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const defaults = page.getByRole('combobox', { name: 'Feature type default value' })
    await defaults.scrollIntoViewIfNeeded()
    const label = defaults.locator('.bits-form__select-label')
    expect(
      await label.evaluate(element => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
    await page.screenshot({ path: `${output}/profile-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.reload()
  await expect(code).toBeVisible({ timeout: 120000 })
  await Bun.write(
    `${output}/result.json`,
    JSON.stringify({
      auth: true,
      defaultLayerToggle: true,
      inclusion: true,
      sequenceOptions: true,
      liveSessionCode: true,
      widths: [1440, 960, 600, 390],
    }),
  )
} catch (error) {
  await page
    .screenshot({ path: `${output}/failure.png`, fullPage: true })
    .catch(() => {})
  await Bun.write(
    `${output}/failure.txt`,
    await page
      .locator('body')
      .innerText()
      .catch(() => ''),
  )
  throw error
} finally {
  await browser.close()
}
