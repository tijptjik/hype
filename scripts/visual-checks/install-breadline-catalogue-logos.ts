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
// The reviewed donor migration is the source of identity-to-asset associations.
const migration = await readFile(
  'migrations/pending/breadline-donor-identity/curate.sql',
  'utf8',
)
const entries = [
  ...migration.matchAll(/\('([^']+)','[^']+','brand','((?:[^']|'')+)'\)/g),
].map(match => ({
  code: match[1],
  name: JSON.parse(match[2].replaceAll("''", "'")).i18n.en.name as string,
}))
expect(entries).toHaveLength(14)
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
const receipts: { code: string; id: string; logo: string; uploaded: boolean }[] = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`${origin}/admin`, { timeout: 120_000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  for (const entry of entries) {
    await page.goto(`${origin}/admin/catalogue`, { timeout: 120_000 })
    await page
      .getByRole('button', { name: entry.name, exact: true })
      .click({ timeout: 120_000 })
    await expect(
      page.getByRole('group', { name: 'Name · en', exact: true }),
    ).toHaveText(entry.name)
    const id = new URL(page.url()).searchParams.get('id')!
    const logo = page.getByAltText('Catalogue logo', { exact: true })
    const existing = (await logo.count()) ? await logo.getAttribute('src') : null
    if (existing) {
      receipts.push({ code: entry.code, id, logo: existing, uploaded: false })
      continue
    }
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    // Rasterize the checked-in SVG treatment to the existing bounded PNG upload format.
    const data = await page.evaluate(async code => {
      const image = new Image()
      image.src = `/brands/breadline/${code}.svg`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 512
      canvas.getContext('2d')!.drawImage(image, 0, 0, 512, 512)
      return canvas.toDataURL('image/png').split(',')[1]
    }, entry.code)
    await page.getByLabel('Upload logo', { exact: true }).setInputFiles({
      name: `${entry.code}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(data, 'base64'),
    })
    await expect(logo).toBeVisible({ timeout: 30_000 })
    const code = page.locator('#catalogue-code')
    if (!(await code.inputValue())) await code.fill(entry.code)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Catalogue saved', { exact: true })).toBeVisible({
      timeout: 120_000,
    })
    const src = (await logo.getAttribute('src'))!
    expect((await page.request.get(`${origin}${src}`)).ok()).toBe(true)
    receipts.push({ code: entry.code, id, logo: src, uploaded: true })
    await writeFile(
      resolve(artifacts, 'catalogue-logo-receipts.json'),
      JSON.stringify(receipts, null, 2),
    )
  }
  await page.goto(`${origin}/admin/catalogue`)
  await expect(page.getByRole('button', { name: 'Arome', exact: true })).toBeVisible({
    timeout: 120_000,
  })
  await page.screenshot({ path: resolve(artifacts, 'catalogue-with-logos.png') })
  await writeFile(
    resolve(artifacts, 'catalogue-logo-receipts.json'),
    JSON.stringify(receipts, null, 2),
  )
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page.screenshot({ path: resolve(artifacts, 'failure.png') }).catch(() => {})
      await writeFile(
        resolve(artifacts, 'failure.txt'),
        await page.locator('body').innerText(),
      ).catch(() => {})
    }
  throw error
} finally {
  await browser.close()
}
