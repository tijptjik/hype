// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
// NODE
import { writeFile } from 'node:fs/promises'
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port 4173 chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors: string[] = []
page.on('pageerror', error => errors.push(error.message))
try {
  page.setDefaultTimeout(30000)
  await page.goto(`${origin}/admin/projects/breadline#features`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  })
  expect(
    (await (await page.request.get(`${origin}/api/auth/get-session`)).json())?.user?.id,
  ).toBe('hype-local-agent-admin')
  await expect(page).toHaveURL(/\/admin\/projects\/breadline/)
  await expect(page.getByText('Breadline', { exact: true }).first()).toBeVisible({
    timeout: 120000,
  })
  await writeFile(`${artifacts}/initial.txt`, await page.locator('body').innerText())
  await writeFile(
    `${artifacts}/inputs.json`,
    JSON.stringify(
      await page.locator('input').evaluateAll(inputs =>
        inputs.map(i => ({
          placeholder: i.placeholder,
          type: i.type,
          aria: i.getAttribute('aria-label'),
        })),
      ),
      null,
      2,
    ),
  )
  const search = page
    .getByRole('textbox', { name: 'Filter', exact: true })
    .filter({ visible: true })
  await expect(search).toBeVisible({ timeout: 60000 })
  for (const [term, address] of [
    ['Luard', '20 Luard'],
    ['Continental', 'Continental Mansion'],
  ]) {
    const row = page
      .locator('.bits-resource-row--feature')
      .filter({ hasText: address })
      .first()
    await expect(async () => {
      await search.fill(term)
      await expect(search).toHaveValue(term)
      await expect(row).toBeVisible({ timeout: 5000 })
    }).toPass({ timeout: 60000 })
    const logo = row.locator('img').first()
    await expect(logo).toHaveAttribute('src', /identity-catalogue\/logos\//)
    await expect
      .poll(() => logo.evaluate(img => img.complete && img.naturalWidth > 0))
      .toBe(true)
    await page.screenshot({ path: `${artifacts}/${term.toLowerCase()}-desktop.png` })
    await row.getByRole('button', { name: '7-Eleven', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/features\//)
    await page.goBack()
    await expect(search).toBeVisible()
  }
  await page.setViewportSize({ width: 1200, height: 900 })
  const narrowRow = page
    .locator('.bits-resource-row--feature')
    .filter({ hasText: '20 Luard' })
    .first()
  await expect(async () => {
    await search.fill('Luard')
    await expect(search).toHaveValue('Luard')
    await expect(narrowRow).toBeVisible({ timeout: 5000 })
  }).toPass({ timeout: 60000 })
  await expect(narrowRow.locator('img').first()).toHaveAttribute(
    'src',
    /identity-catalogue\/logos\//,
  )
  await expect
    .poll(() =>
      narrowRow
        .locator('img')
        .first()
        .evaluate(img => img.complete && img.naturalWidth > 0),
    )
    .toBe(true)
  await page.screenshot({ path: `${artifacts}/luard-1200.png` })
  await writeFile(
    `${artifacts}/result.json`,
    JSON.stringify({ admin: true, errors }, null, 2),
  )
  expect(errors).toEqual([])
} finally {
  await page.screenshot({ path: `${artifacts}/final.png` }).catch(() => {})
  await writeFile(
    `${artifacts}/final.txt`,
    await page
      .locator('body')
      .innerText()
      .catch(() => ''),
  )
  await browser.close()
}
