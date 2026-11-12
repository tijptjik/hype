// NODE
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port PORT chrome')
await mkdir(artifacts, { recursive: true })
// Stable local catalogue identities and their accepted asset codes.
const entries = JSON.parse(
  await readFile('scripts/visual-checks/fixtures/breadline-groups.json', 'utf8'),
) as { code: string; id: string; name: string }[]
expect(entries).toHaveLength(7)
// Explicit codes opt into replacing attached artwork; the default remains non-destructive.
const replaceCodes = new Set(process.argv.slice(2))
for (const code of replaceCodes) {
  if (!entries.some(entry => entry.code === code))
    throw new Error(`Unknown group code: ${code}`)
}
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
const receipts: {
  code: string
  id: string
  logo: string
  uploaded: boolean
  previousLogo?: string | null
}[] = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`${origin}/admin/catalogue?id=bl-group-maxims-group`, {
    timeout: 120_000,
  })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  for (const entry of entries) {
    await page.goto(`${origin}/admin/catalogue?id=${encodeURIComponent(entry.id)}`, {
      timeout: 120_000,
    })
    const nameGroup = page.getByRole('group', { name: 'Name · en', exact: true })
    const nameInput = page.getByRole('textbox', { name: 'Name · en', exact: true })
    await expect(nameGroup.or(nameInput)).toBeVisible({ timeout: 120_000 })
    if (await nameGroup.count()) await expect(nameGroup).toHaveText(entry.name)
    else await expect(nameInput).toHaveValue(entry.name)
    const id = entry.id
    if (!id) throw new Error(`Missing identity ID: ${entry.code}`)
    const logo = page.getByAltText('Catalogue logo', { exact: true })
    const existing = (await logo.count()) ? await logo.getAttribute('src') : null
    if (existing && !replaceCodes.has(entry.code)) {
      receipts.push({ code: entry.code, id, logo: existing, uploaded: false })
      continue
    }
    const edit = page.getByRole('button', { name: 'Edit', exact: true })
    if (await edit.count()) await edit.click()
    // Rasterize the checked-in SVG treatment to the existing bounded PNG upload format.
    const data = await page.evaluate(async code => {
      const image = new Image()
      image.src = `/groups/breadline/${code}.svg`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 512
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      context.drawImage(image, 0, 0, 512, 512)
      return canvas.toDataURL('image/png').split(',')[1]
    }, entry.code)
    await page.locator('input[type=file]').setInputFiles({
      name: `${entry.code}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(data, 'base64'),
    })
    await expect(logo).toBeVisible({ timeout: 30_000 })
    const code = page.locator('#catalogue-code')
    if (!(await code.inputValue())) await code.fill(entry.code)
    await page.getByRole('button', { name: /^(Save|Save catalogue record)$/ }).click()
    await expect(
      edit.or(page.getByText('Catalogue saved', { exact: true })),
    ).toBeVisible({
      timeout: 120_000,
    })
    const src = await logo.getAttribute('src')
    if (!src) throw new Error(`Missing uploaded logo: ${entry.code}`)
    await page.reload()
    await expect(logo).toHaveAttribute('src', src, { timeout: 30_000 })
    expect((await page.request.get(`${origin}${src}`)).ok()).toBe(true)
    receipts.push({
      code: entry.code,
      id,
      logo: src,
      uploaded: true,
      previousLogo: existing,
    })
    await writeFile(
      resolve(artifacts, 'group-logo-receipts.json'),
      JSON.stringify(receipts, null, 2),
    )
  }
  await page.goto(`${origin}/admin/catalogue?kind=group`)
  const kindPicker = page.getByRole('combobox', { name: 'Kind', exact: true })
  if (await kindPicker.count()) await kindPicker.selectOption('group')
  await expect(
    page.getByRole('button', { name: 'Convenience Retail Asia', exact: true }),
  ).toBeVisible({ timeout: 120_000 })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.screenshot({
      path: resolve(artifacts, `groups-${width}.png`),
      fullPage: true,
    })
  }
  await page.screenshot({ path: resolve(artifacts, 'groups-with-logos.png') })
  await writeFile(
    resolve(artifacts, 'group-logo-receipts.json'),
    JSON.stringify(receipts, null, 2),
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
