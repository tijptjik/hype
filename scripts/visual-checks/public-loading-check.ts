// PLAYWRIGHT
import { chromium } from 'playwright'
// FILESYSTEM
import { mkdir, writeFile } from 'node:fs/promises'

const browser = await chromium.launch({ args: ['--disable-web-security'] })
try {
  const width = Number(process.env.PUBLIC_LOADING_WIDTH ?? 1280)
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  await page.addInitScript(() => performance.setResourceTimingBufferSize(10000))
  const errors: string[] = []
  const requests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => requests.push(new URL(request.url()).pathname))
  await page.goto(process.env.PUBLIC_LOADING_URL ?? 'http://hype.localhost', {
    waitUntil: 'domcontentloaded',
  })
  await page
    .getByRole('button', { name: 'Starred', exact: true })
    .waitFor({ timeout: 60000 })
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 60000 })
  const deferred = [
    'StarsPanel',
    'FiltersPanel',
    'HubPanel',
    'NavigationPanel',
    'ResourcePanel',
  ]
  const eager = requests.filter(path =>
    deferred.some(name => path.endsWith(`/${name}.svelte`)),
  )
  if (eager.length) throw new Error(`Closed panels imported: ${eager.join(', ')}`)
  const savedQueries = requests.filter(path =>
    /getSavedFeatureSuccessors|getWishlist|getVisited/.test(path),
  )
  if (savedQueries.length)
    throw new Error(`Closed saved-place panel queried: ${savedQueries.join(', ')}`)
  const startup = {
    requests: requests.length,
    remoteRequests: requests.filter(path => path.startsWith('/_app/remote/')),
    eagerPanels: eager,
  }
  const opened: string[] = []
  for (const [label, component] of [
    ['Starred', 'StarsPanel'],
    ['Filters', 'FiltersPanel'],
    ['Maps', 'ResourcePanel'],
  ] as const) {
    console.log(`Opening ${label}`)
    await page.getByRole('button', { name: label, exact: true }).click()
    await page.waitForFunction(
      name =>
        performance
          .getEntriesByType('resource')
          .some(entry => new URL(entry.name).pathname.endsWith(`/${name}.svelte`)),
      component,
    )
    await page.waitForTimeout(500)
    opened.push(component)
    await page.keyboard.press('Escape')
  }
  await page.getByRole('button', { name: 'Starred', exact: true }).click()
  if (requests.filter(path => path.endsWith('/StarsPanel.svelte')).length !== 1)
    throw new Error('Reopening imported Stars again')
  await mkdir('output/playwright', { recursive: true })
  await page.screenshot({ path: `output/playwright/public-loading-${width}.png` })
  if (errors.length) throw new Error(errors.join('\n'))
  const result = { startup, opened, reopenedWithoutImport: true, errors }
  await writeFile(
    `output/playwright/public-loading-${width}.json`,
    JSON.stringify(result, null, 2),
  )
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
