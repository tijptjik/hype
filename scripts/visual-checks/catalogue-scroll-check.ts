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
const page = await browser.newPage({ viewport: { width: 1440, height: 600 } })
page.setDefaultTimeout(60_000)
const results: object[] = []

/**
 * Exercises wheel scrolling inside the catalogue and verifies the header stays fixed.
 * @param name Screenshot and evidence label.
 * @returns Nothing after checking actual scroll movement and bottom reachability.
 */
async function checkScroll(name: string): Promise<void> {
  const main = page.locator('[data-route-live] [data-responsive-main]')
  await expect(main).toBeVisible()
  await expect
    .poll(() => main.evaluate(el => Boolean(el.closest('[inert]'))))
    .toBe(false)
  await expect
    .poll(() => main.evaluate(el => getComputedStyle(el).overflowY))
    .toBe('auto')
  await expect
    .poll(() => main.evaluate(el => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(100)
  await main.evaluate(el => {
    el.scrollTop = 0
  })
  const header = page.getByRole('banner')
  const before = await header.boundingBox()
  const box = await main.boundingBox()
  if (!box || !before) throw new Error('Missing layout bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 500)
  await expect.poll(() => main.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  await page.mouse.wheel(0, 100_000)
  await expect
    .poll(() =>
      main.evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop)),
    )
    .toBeLessThan(2)
  expect((await header.boundingBox())?.y).toBe(before.y)
  results.push({
    name,
    ...(await main.evaluate(el => ({
      top: el.scrollTop,
      height: el.clientHeight,
      content: el.scrollHeight,
    }))),
  })
  await page.screenshot({ path: resolve(artifacts, `${name}.png`) })
}

try {
  await page.goto(`${origin}/admin`, { timeout: 120_000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  await expect(page).toHaveURL(/\/admin/)
  for (const width of [1440, 1200]) {
    await page.setViewportSize({ width, height: 600 })
    await page.goto(`${origin}/admin/catalogue`, { timeout: 120_000 })
    await expect(page.getByText('7-Eleven', { exact: true }).first()).toBeVisible()
    await checkScroll(`brands-cards-${width}`)
    await page.getByRole('button', { name: 'Show rows', exact: true }).click()
    await checkScroll(`brands-rows-${width}`)
    await page.goto(`${origin}/admin/catalog/brand/maxims`, { timeout: 120_000 })
    await expect(page.getByRole('region', { name: 'Names', exact: true })).toBeVisible()
    await checkScroll(`brand-detail-${width}`)
    await page.goto(`${origin}/admin/catalog/group/dfi`, { timeout: 120_000 })
    await expect(page.getByRole('region', { name: 'Names', exact: true })).toBeVisible()
    await checkScroll(`group-detail-${width}`)
  }
  await writeFile(
    resolve(artifacts, 'scroll-results.json'),
    JSON.stringify(results, null, 2),
  )
  console.log(JSON.stringify(results))
} catch (error) {
  await page.screenshot({ path: resolve(artifacts, 'failure.png') })
  console.log(
    await page.locator('[data-responsive-main]').evaluateAll(elements =>
      elements.map(el => ({
        classes: el.className,
        overflow: getComputedStyle(el).overflowY,
        height: el.clientHeight,
        content: el.scrollHeight,
        inert: Boolean(el.closest('[inert]')),
      })),
    ),
  )
  throw error
} finally {
  await browser.close()
}
