// BROWSER
import { chromium } from 'playwright'

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
})
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/__paging-check.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<script>globalThis.__sveltekit_dev={env:{}}</script><div id="app"></div><script type="module" src="/src/tests/fixtures/resourcePagingScrollCheck.ts"></script>',
    }),
  )
  await page.goto(
    `${process.env.SCROLL_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'}/__paging-check.html`,
  )
  const viewport = page.locator('svelte-virtual-list-viewport')
  await viewport.waitFor()
  await page.waitForTimeout(300)
  await viewport.hover({ position: { x: 400, y: 250 } })
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(150)
  const rowOffset = await viewport.evaluate(element => element.scrollTop)
  if (rowOffset <= 0) throw new Error('Wheel input over rows did not scroll')

  // Exercise the real browser wheel default on both overlay targets.
  for (const selector of ['.v-track', '.v-thumb']) {
    const before = await viewport.evaluate(element => element.scrollTop)
    await page.locator(selector).hover()
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(150)
    const after = await viewport.evaluate(element => element.scrollTop)
    if (after <= before) throw new Error(`Wheel input stalled over ${selector}`)
  }

  // Keep the response pending while the user scrolls into the reserved loading rows.
  await page.locator('.v-track').hover()
  await page.mouse.wheel(0, 10000)
  await page.waitForTimeout(200)
  const pending = await viewport.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return {
      top: element.scrollTop,
      height: element.scrollHeight,
      client: element.clientHeight,
      skeletons: [
        ...element.querySelectorAll('[role="status"][aria-busy="true"]'),
      ].filter(row => {
        const rect = row.getBoundingClientRect()
        return rect.top < bounds.bottom && rect.bottom > bounds.top
      }).length,
    }
  })
  if (pending.skeletons !== 3) throw new Error('Loading rows were not reachable')
  if ((await page.locator('[data-requests]').textContent()) !== '1') {
    throw new Error('Pending pagination fired more than once')
  }
  await page.screenshot({ path: 'output/playwright/resource-paging-pending.png' })
  await page.locator('[data-append]').click()
  await page.waitForTimeout(150)
  const appended = await viewport.evaluate(element => ({
    top: element.scrollTop,
    height: element.scrollHeight,
  }))
  if (appended.top !== pending.top || appended.height <= pending.height) {
    throw new Error(
      'Appending a page shifted the reading position or failed to extend the list',
    )
  }
  await page.locator('.v-track').hover()
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(150)
  const continued = await viewport.evaluate(element => element.scrollTop)
  if (continued <= appended.top)
    throw new Error('Scrolling did not continue after loading')
  console.log(JSON.stringify({ rowOffset, pending, appended, continued, errors }))
  if (errors.length) throw new Error('Browser errors')
} finally {
  await browser.close()
}
