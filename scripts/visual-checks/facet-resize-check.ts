// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const origin = process.argv[2] ?? 'http://127.0.0.1:4173'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__facet-resize.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/facetResizeCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__facet-resize.html`)
    await page.locator('[data-facet-id="0"] [data-facet-scroll-clearance]').waitFor()
    await page.waitForTimeout(300)
    const longContentClearance = await page
      .locator('[data-facet-id="0"]')
      .evaluate(element => {
        element.scrollTop = element.scrollHeight
        const lastSection = element.querySelector('[data-last-section]')
        if (!lastSection) throw new Error('Missing last facet section')
        return (
          element.getBoundingClientRect().bottom -
          lastSection.getBoundingClientRect().bottom
        )
      })
    assert.ok(
      longContentClearance >= 319,
      `Long sibling sections must end before the trailing clearance: ${longContentClearance}`,
    )
    // Count style writes from intrinsic-height probing, including invisible facets.
    await page.evaluate(() => {
      const counts = [0, 0]
      Object.assign(window, { facetStyleWrites: counts })
      for (const index of [0, 1]) {
        const body = document.querySelector(
          `[data-facet-id="${index}"] .bits-main__section-body`,
        )
        if (!body) throw new Error(`Missing facet ${index} body`)
        new MutationObserver(records => {
          counts[index] += records.length
        }).observe(body, { attributes: true, attributeFilter: ['style'] })
      }
    })
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.getByRole('button', { name: 'Toggle sidebar' }).click()
      await page.waitForTimeout(750)
    }
    const writes = await page.evaluate(
      () => (window as unknown as { facetStyleWrites: number[] }).facetStyleWrites,
    )
    assert.equal(writes[1], 0, 'Inactive facets must not probe content height')
    assert.ok(
      writes[0] < 40,
      `Resize must settle before probing content: ${writes[0]} writes`,
    )
    await page.getByRole('button', { name: 'Switch facet' }).click()
    const active = page.locator('[data-facet-id="1"]')
    await active.locator('[data-facet-scroll-clearance]').waitFor()
    await page.getByRole('button', { name: 'Toggle content' }).click()
    await page.waitForTimeout(350)
    const geometry = await active.evaluate(element => {
      element.scrollTop = element.scrollHeight
      const body = element.querySelector('.bits-main__section-body')
      if (!body) throw new Error('Missing active facet body')
      return {
        scrollHeight: element.scrollHeight,
        height: element.clientHeight,
        clearance:
          element.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom,
      }
    })
    assert.ok(
      geometry.scrollHeight <= geometry.height + 321,
      'Collapsed content must release stale height',
    )
    assert.ok(
      geometry.clearance >= 319,
      'Content must retain its trailing scroll clearance',
    )
    // A same-size content update must not discard the scroll travel added by the facet.
    const stableScroll = await active.evaluate(async element => {
      const before = element.scrollTop
      const body = element.querySelector('.bits-main__section-body')
      if (!body) throw new Error('Missing active facet body')
      const marker = document.createComment('same-size content update')
      body.append(marker)
      const samples: number[] = []
      const started = performance.now()
      while (performance.now() - started < 250) {
        await new Promise(requestAnimationFrame)
        samples.push(element.scrollTop)
      }
      marker.remove()
      return { before, samples }
    })
    assert.ok(stableScroll.before > 0, 'Exercise the trailing scroll range')
    assert.ok(
      stableScroll.samples.every(top => Math.abs(top - stableScroll.before) <= 1),
      `Height probing moved the viewport: ${JSON.stringify(stableScroll)}`,
    )
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ browser: name, writes, geometry }))
  } finally {
    await browser.close()
  }
}
