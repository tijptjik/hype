// NODE
import { readFile, writeFile } from 'node:fs/promises'
// BROWSER
import { chromium } from 'playwright'

// Refs #194. Verify rendered starting data, never treat navigation as move acceptance.
const [input, output] = process.argv.slice(2)
if (!input || !output)
  throw new Error(
    'Usage: bun run scripts/locations/verify-lifecycle-browser.ts audit.json browser-report.json',
  )
const report = JSON.parse(await readFile(input, 'utf8')) as {
  fixturePassed: boolean
  scenarios: { code: string; title: string; links: Record<string, string> }[]
}
if (!report.fixturePassed || report.scenarios.length !== 26)
  throw new Error('Run a passing A–Z fixture audit first')
for (const scenario of report.scenarios) {
  for (const link of Object.values(scenario.links)) {
    const url = new URL(link)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]', 'hype.localhost'].includes(url.hostname)
    )
      throw new Error('Browser acceptance is local-only')
  }
}
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
  args: ['--disable-web-security'],
})
let page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
const results: {
  code: string
  role: string
  status: number | undefined
  url: string
}[] = []
const errors: string[] = []
page.on('pageerror', error => errors.push(error.message))
let failure: string | null = null
try {
  for (const scenario of report.scenarios) {
    const role = ['H', 'I', 'J', 'K', 'L', 'M', 'W', 'R'].includes(scenario.code)
      ? 'building'
      : 'shop'
    await page.close()
    page = await browser.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const response = await page.goto(scenario.links[role])
    await page
      .getByRole('heading', { name: 'Buildings, premises and occupants' })
      .waitFor({ timeout: 30000 })
    const region = page.getByRole('region', { name: 'Location relationships' })
    await region.getByText('Address choices', { exact: true }).waitFor()
    if (response?.status() !== 200)
      throw new Error(`${scenario.code}: Location did not return 200`)
    results.push({
      code: scenario.code,
      role,
      status: response.status(),
      url: page.url(),
    })

    await page.close()
    page = await browser.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const feature = await page.goto(scenario.links.feature)
    await page
      .getByText(`${scenario.code} · ${scenario.title}`, { exact: true })
      .first()
      .waitFor({ timeout: 30000 })
    if (!['A', 'X'].includes(scenario.code))
      await page
        .getByText('Accepted placement', { exact: true })
        .waitFor({ timeout: 30000 })
    if (feature?.status() !== 200)
      throw new Error(`${scenario.code}: Feature did not return 200`)
    results.push({
      code: scenario.code,
      role: 'feature',
      status: feature.status(),
      url: page.url(),
    })
    console.info(`Verified ${scenario.code}: Location and Feature`)
  }
  // Accepted physical placement and retained history must be discoverable from containers.
  for (const [code, role, view] of [
    ['W', 'building', 'placed'],
    ['X', 'shop', 'past'],
  ] as const) {
    const scenario = report.scenarios.find(row => row.code === code)!
    await page.close()
    page = await browser.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const response = await page.goto(scenario.links[role])
    const section = page.locator('[data-location-linked-features]')
    await section.getByRole('combobox').selectOption(view)
    await section
      .locator(`a[href="/admin/features/lifecycle-demo-${code.toLowerCase()}-feature"]`)
      .waitFor({ timeout: 30000 })
    results.push({ code, role: view, status: response?.status(), url: page.url() })
    console.info(`Verified ${code}: ${view} Feature lookup`)
  }
  if (errors.length) throw new Error('Browser page errors were recorded')
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
  throw error
} finally {
  await writeFile(
    output,
    JSON.stringify(
      {
        results,
        errors,
        failure,
        workflowAcceptance:
          'Navigation and accepted-reference display only; no relocation decision executed.',
      },
      null,
      2,
    ) + '\n',
  )
  await browser.close()
}
