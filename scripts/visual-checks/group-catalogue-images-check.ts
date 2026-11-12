// NODE
import { readFile, writeFile, mkdir } from 'node:fs/promises'
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
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`${origin}/admin/catalogue?kind=group`, { timeout: 120_000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toBe('/admin/catalogue')
  const receipts = []
  for (const entry of entries) {
    await page.goto(`${origin}/admin/catalogue?id=${encodeURIComponent(entry.id)}`, {
      timeout: 120_000,
    })
    const logo = page.getByAltText('Catalogue logo', { exact: true })
    await expect(logo).toBeVisible({ timeout: 60_000 })
    await logo.scrollIntoViewIfNeeded()
    const src = await logo.getAttribute('src')
    if (!src) throw new Error(`Missing logo: ${entry.code}`)
    const result = await page.evaluate(
      async ({ src, code }) => {
        const pixels = async (url: string): Promise<Uint8ClampedArray> => {
          const image = new Image()
          image.src = url
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 512
          const context = canvas.getContext('2d')
          if (!context) throw new Error('Canvas unavailable')
          context.drawImage(image, 0, 0, 512, 512)
          return context.getImageData(0, 0, 512, 512).data
        }
        const actual = await pixels(src)
        const expected = await pixels(`/groups/breadline/${code}.svg`)
        let changed = 0,
          maxChannelDelta = 0,
          opaque = 0
        for (let i = 0; i < actual.length; i++) {
          if (actual[i] !== expected[i]) changed++
          maxChannelDelta = Math.max(maxChannelDelta, Math.abs(actual[i] - expected[i]))
          if (i % 4 === 3 && actual[i]) opaque++
        }
        return { changedChannels: changed, maxChannelDelta, visiblePixels: opaque }
      },
      { src, code: entry.code },
    )
    expect(result.visiblePixels).toBeGreaterThan(1000)
    // PNG encode/decode may round a few edge channels; reject any meaningful artwork change.
    expect(result.maxChannelDelta, entry.code).toBeLessThanOrEqual(2)
    expect(result.changedChannels, entry.code).toBeLessThan(1049)
    receipts.push({ ...entry, src, ...result })
  }
  await writeFile(
    resolve(artifacts, 'group-catalogue-images.json'),
    JSON.stringify(receipts, null, 2),
  )
  await page.goto(`${origin}/admin/catalogue?kind=group`, { timeout: 120_000 })
  const kindPicker = page.getByRole('combobox', { name: 'Kind', exact: true })
  if (await kindPicker.count()) await kindPicker.selectOption('group')
  await expect(
    page.getByRole('button', { name: 'Convenience Retail Asia', exact: true }),
  ).toBeVisible({ timeout: 60_000 })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.screenshot({
      path: resolve(artifacts, `groups-${width}.png`),
      fullPage: true,
    })
  }
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages())
      await page
        .screenshot({ path: resolve(artifacts, 'images-failure.png') })
        .catch(() => {})
  throw error
} finally {
  await browser.close()
}
