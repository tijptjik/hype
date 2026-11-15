import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('console', message => {
    if (message.type() === 'error') console.log('CONSOLE', message.text())
  })
  page.on('pageerror', e => console.log('PAGE ERROR', e.message))
  await page.goto(`${base}/admin/locations?kind=building_part&publication=all`)
  assert.equal(
    (await (await page.request.get(`${base}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'mixed', {
    timeout: 120000,
  })
  const publicationToggle = page
    .locator('.bits-resource-filter-bar__tri-toggle')
    .filter({ has: page.getByRole('switch') })
  const draftLabel = publicationToggle.getByRole('button', {
    name: 'Draft',
    exact: true,
  })
  await publicationToggle.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  await expect(draftLabel).toHaveCSS('color', 'rgba(0, 0, 0, 0)')
  await publicationToggle.hover()
  await expect(draftLabel).not.toHaveCSS('color', 'rgba(0, 0, 0, 0)')
  await expect(publicationToggle.locator('..')).toHaveCSS('column-gap', '24px')
  const building = page.getByRole('combobox', { name: 'Building', exact: true })
  await building.fill('Kowloon')
  try {
    await page
      .getByRole('option', { name: 'Kowloon Tong MTR', exact: true })
      .click({ timeout: 60000 })
  } catch (error) {
    console.log(await page.locator('body').innerText())
    await page.screenshot({ path: `${output}/filter-failure.png` })
    throw error
  }
  await expect
    .poll(() => new URL(page.url()).searchParams.get('buildingId'))
    .toBe('Judw8c1-tTOG')
  await expect(page.getByText('205', { exact: true })).toBeVisible({ timeout: 60000 })
  await page.screenshot({ path: `${output}/location-building-filter.png` })
  for (const label of ['Draft', 'Published', 'All']) {
    await page
      .getByRole('button', { name: label === 'All' ? 'Published' : label, exact: true })
      .click()
    await expect(page.getByRole('switch')).toHaveAttribute(
      'aria-checked',
      label === 'All' ? 'mixed' : label === 'Published' ? 'true' : 'false',
    )
    await expect
      .poll(() => new URL(page.url()).searchParams.get('publication'))
      .toBe(label.toLowerCase())
    await expect(
      page.getByText(label === 'Published' ? '0' : '205', { exact: true }),
    ).toBeVisible({ timeout: 60000 })
  }
  await page.reload()
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'mixed', {
    timeout: 120000,
  })
  await expect(building).toHaveValue('Kowloon Tong MTR', { timeout: 60000 })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${output}/location-building-filter-mobile.png` })
  console.log('Publication switch, actual building selection and reload verified')
} finally {
  await browser.close()
}
