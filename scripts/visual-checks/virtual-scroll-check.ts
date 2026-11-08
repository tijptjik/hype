import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/__scroll-check.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/virtualScrollCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('http://127.0.0.1:4173/__scroll-check.html')
  const viewport = page.locator('svelte-virtual-list-viewport')
  await viewport.waitFor()
  await page.waitForTimeout(300)
  const before = await viewport.evaluate(e => e.scrollHeight)
  const retained = await viewport.evaluate(async e => {
    e.scrollTop = 78
    e.dispatchEvent(new Event('scroll'))
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
    return Boolean(e.querySelector('[data-row="1"]'))
  })
  if (!retained) throw Error('Previously rendered rows were replaced while scrolling')
  // Keep moving beyond the entire overscan window without waiting for the idle timer.
  const ordinary = await viewport.evaluate(async e => {
    const samples = []
    for (let step = 1; step <= 30; step++) {
      e.scrollTop = step * 100
      e.dispatchEvent(new Event('scroll'))
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      )
      samples.push({
        offset: e.scrollTop,
        skeletons: e.querySelectorAll('[data-skeleton]').length,
      })
    }
    return samples
  })
  if (ordinary.some(sample => sample.skeletons > 0))
    throw Error('Ordinary scrolling showed skeletons')
  const samples = await viewport.evaluate(async e => {
    const samples = []
    for (const offset of [78000, 156000, 390000, 78000, 0]) {
      e.scrollTop = offset
      e.dispatchEvent(new Event('scroll'))
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      )
      samples.push({
        offset: e.scrollTop,
        height: e.scrollHeight,
        skeletons: e.querySelectorAll('[data-skeleton]').length,
        rows: e.querySelectorAll('svelte-virtual-list-row').length,
      })
    }
    return samples
  })
  if (
    samples.some(s => s.height !== before || s.rows > 30) ||
    !samples.some(s => s.skeletons > 0)
  )
    throw Error(JSON.stringify({ before, samples }))
  await page.waitForTimeout(250)
  if (await page.locator('[data-skeleton]').count())
    throw Error('Skeletons did not resolve')
  await page.screenshot({ path: 'output/playwright/virtual-scroll-settled.png' })
  await viewport.hover()
  await page.mouse.wheel(0, 1000)
  await page.waitForTimeout(80)
  const wheelOffset = await viewport.evaluate(e => e.scrollTop)
  if (wheelOffset <= 0) throw Error('Wheel did not scroll')
  await viewport.evaluate(e => (e.scrollTop = e.scrollHeight))
  await page.waitForTimeout(250)
  const bottom = await viewport.evaluate(e => ({
    offset: e.scrollTop,
    height: e.scrollHeight,
    client: e.clientHeight,
  }))
  if (bottom.height - bottom.client !== bottom.offset) throw Error('Bottom unstable')
  console.log(
    JSON.stringify({ before, ordinary, samples, wheelOffset, bottom, errors }),
  )
  if (errors.length) throw Error('Browser errors')
} finally {
  await browser.close()
}
