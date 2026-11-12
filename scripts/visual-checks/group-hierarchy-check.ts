// NODE
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect as baseExpect } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 60_000 })
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use the managed Chrome runner')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(60_000)
  await page.goto(`${origin}/admin/catalog/group/jc`, { timeout: 120_000 })
  expect(
    (await (await page.request.get(`${origin}/api/auth/get-session`)).json()).user.id,
  ).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toBe('/admin/catalog/group/jc')
  await expect(page.getByText('Parent group (optional)', { exact: true })).toBeVisible()
  const nativePicker = page.getByRole('combobox', { name: 'Select group', exact: true })
  if (await nativePicker.count()) {
    await expect(nativePicker.locator('option[value="bl-group-dfi"]')).toHaveCount(1)
    await expect(nativePicker.locator('option[value="bl-group-jc"]')).toHaveCount(0)
    await nativePicker.selectOption('bl-group-dfi')
    await expect(nativePicker).toHaveValue('bl-group-dfi')
    await page.screenshot({ path: resolve(artifacts, 'parent-selected.png') })
    await nativePicker.selectOption('')
    await expect(nativePicker).toHaveValue('')
  } else {
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const search = page.getByRole('combobox', {
      name: 'Search parent groups',
      exact: true,
    })
    await page
      .getByRole('button', { name: 'Open Search parent groups', exact: true })
      .click()
    await expect(
      page.getByRole('option', { name: 'DFI Retail Group', exact: true }),
    ).toBeVisible()
    await search.fill('JC')
    await expect(
      page.getByRole('option', { name: 'JC Group', exact: true }),
    ).toHaveCount(0)
    await search.fill('DFI')
    await search.press('ArrowDown')
    await writeFile(
      resolve(artifacts, 'picker-state.txt'),
      await page.locator('body').ariaSnapshot(),
    )
    await page.getByRole('option', { name: 'DFI Retail Group', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Clear group', exact: true }),
    ).toBeVisible()
    await page.screenshot({ path: resolve(artifacts, 'parent-selected.png') })
    await page.getByRole('button', { name: 'Clear group', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Clear group', exact: true }),
    ).toHaveCount(0)
  }
  // Exercise draft interactions without recording a fictional corporate affiliation.
  await page.reload()
  await expect(page.getByText('Parent group (optional)', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(artifacts, 'group-parent-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText('Window Too Small', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(artifacts, 'group-parent-narrow.png') })
  await writeFile(
    resolve(artifacts, 'verification.txt'),
    'Authenticated admin; optional parent field; self excluded; parent selected and cleared; reload; existing narrow-screen guard. Persistence, history and cycle rejection covered by SQLite integration tests.\n',
  )
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page.screenshot({ path: resolve(artifacts, 'failure.png') }).catch(() => {})
      await writeFile(
        resolve(artifacts, 'failure.txt'),
        (await page.locator('body').textContent()) ?? '',
      ).catch(() => {})
    }
  throw error
} finally {
  await browser.close()
}
