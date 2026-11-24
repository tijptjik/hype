// NODE
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
// PLAYWRIGHT
import { chromium } from '@playwright/test'

/** Verify public production donor, station and artwork routes using managed visible Chrome.
 * @returns Receipt and screenshots in the managed artifact directory.
 * @remarks Arguments are a JSON array of public route paths and expected visible labels.
 */
async function main(): Promise<void> {
  const output = process.env.DEV_RUNNER_ARTIFACTS
  const browserClass = process.env.DEV_RUNNER_CHROME_CLASS
  if (!output || !browserClass) throw new Error('Use the managed Chrome runner')
  const cases = JSON.parse(process.argv[2] || '[]') as Array<{
    kind: string
    path: string
    label: string
  }>
  if (
    !cases.length ||
    cases.some(row => !row.path.startsWith('/') || row.path.startsWith('//'))
  )
    throw new Error('Explicit public route cases required')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--ozone-platform=x11', `--class=${browserClass}`],
  })
  const results: unknown[] = []
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    })
    const page = await context.newPage()
    for (const [index, row] of cases.entries()) {
      const errors: string[] = []
      const requests: string[] = []
      const failedResponse = (response: import('@playwright/test').Response) => {
        if (response.status() >= 400)
          requests.push(`${response.status()} ${response.url().split('?')[0]}`)
      }
      page.on('response', failedResponse)
      const capture = (error: Error) => errors.push(error.message)
      page.on('pageerror', capture)
      try {
        const response = await page.goto('https://hype.hk' + row.path, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        })
        if (!response?.ok()) throw new Error('HTTP ' + response?.status())
        if (row.kind === 'artwork') {
          if (!response.headers()['content-type']?.startsWith('image/'))
            throw new Error('Artwork response is not an image')
          await page
            .locator('img,svg')
            .first()
            .waitFor({ state: 'visible', timeout: 60000 })
        } else {
          await page
            .getByText(row.label, { exact: false })
            .first()
            .waitFor({ state: 'visible', timeout: 60000 })
        }
        await page.waitForTimeout(row.kind === 'station' ? 15000 : 3000)
        const body = await page.locator('body').innerText()
        if (
          /Maintenance in progress|Internal Error|error loading|failed to load/i.test(
            body,
          )
        )
          throw new Error('Application error page')
        if (row.kind === 'station' && !(await page.locator('canvas').count()))
          throw new Error('Station map canvas did not render')
        await page.screenshot({
          path: join(output, `${index}-${row.kind}.png`),
          fullPage: true,
        })
        results.push({
          ...row,
          status: response.status(),
          url: page.url(),
          errors,
          requests,
          passed: errors.length === 0,
        })
      } catch (error) {
        results.push({ ...row, passed: false, error: String(error), errors, requests })
        await page
          .screenshot({
            path: join(output, `${index}-${row.kind}-failed.png`),
            fullPage: true,
          })
          .catch(() => {})
      } finally {
        page.off('pageerror', capture)
        page.off('response', failedResponse)
      }
    }
    await context.close()
  } finally {
    await browser.close()
    await writeFile(
      join(output, 'curation-production.json'),
      JSON.stringify(results, null, 2) + '\n',
    )
  }
  console.log(JSON.stringify(results))
  if (results.some(row => !(row as { passed: boolean }).passed)) process.exitCode = 1
}
await main()
