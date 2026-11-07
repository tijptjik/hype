import assert from 'node:assert/strict'
import { chromium, firefox, webkit } from 'playwright'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
  ...(process.env.HYPE_CHECK_WEBKIT ? [['webkit', webkit] as const] : []),
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 2400 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__omnibar-search-check.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/omnibarSearchCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__omnibar-search-check.html`)
    await page.getByRole('button', { name: /Neon feature 0/ }).waitFor()
    // Wait for the entry transition and ResizeObserver allocation before measuring.
    await page.waitForTimeout(400)
    const visibleTypes = () =>
      page
        .locator('[data-omni-section]:visible')
        .evaluateAll(elements =>
          elements.map(el => el.getAttribute('data-omni-section')),
        )
    assert.deepEqual(await visibleTypes(), [
      'feature',
      'neighbourhood',
      'layer',
      'project',
      'organisation',
      'walk',
    ])
    assert.equal(await page.locator('[data-omni-entry]:visible').count(), 15)

    // Find a constrained budget that admits walks but excludes lower-priority divisions.
    let walksWinBudget = false
    for (const height of [1400, 1200, 1000, 800]) {
      await page.setViewportSize({ width: 375, height })
      await page.waitForTimeout(100)
      const types = await visibleTypes()
      if (types.includes('walk') && !types.includes('neighbourhood')) {
        assert.equal(types.at(-1), 'walk')
        walksWinBudget = true
        break
      }
    }
    assert.ok(walksWinBudget, 'Walks must receive space before divisions')

    await page.setViewportSize({ width: 375, height: 800 })
    await page.waitForTimeout(100)
    const tallCount = await page.locator('[data-omni-entry]:visible').count()
    const beforeLayoutHeight = await page.evaluate(() => innerHeight)
    // Simulate a phone keyboard changing only visual viewport height, preserving layout height.
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, 'height', {
        configurable: true,
        value: 320,
      })
      window.visualViewport!.dispatchEvent(new Event('resize'))
    })
    await page.waitForTimeout(100)
    assert.equal(await page.evaluate(() => innerHeight), beforeLayoutHeight)
    const keyboardCount = await page.locator('[data-omni-entry]:visible').count()
    assert.ok(keyboardCount > 0 && keyboardCount < tallCount)
    assert.deepEqual(await visibleTypes(), ['feature'])
    const keyboardTray = await page.locator('[data-omni-tray]').boundingBox()
    assert.ok(keyboardTray && keyboardTray.height <= 320 * 0.6 + 1)
    assert.ok(keyboardTray.y + keyboardTray.height <= 320 - 16 + 1)
    await page.screenshot({ path: `/tmp/omnibar-budget-keyboard-${name}.png` })

    await page.evaluate(() => {
      delete (window.visualViewport as unknown as { height?: number }).height
      window.visualViewport!.dispatchEvent(new Event('resize'))
    })
    await page.waitForTimeout(100)
    assert.equal(await page.locator('[data-omni-entry]:visible').count(), tallCount)

    // Width changes remeasure wrapping, rather than retaining an outdated per-row estimate.
    await page.setViewportSize({ width: 320, height: 480 })
    await page.waitForTimeout(100)
    const narrowCount = await page.locator('[data-omni-entry]:visible').count()
    await page.getByRole('button', { name: 'Labels', exact: true }).click()
    await page.waitForTimeout(100)
    assert.ok((await page.locator('[data-omni-entry]:visible').count()) >= narrowCount)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    )

    // Explicit expansion keeps all requested rows reachable in the bounded scroller.
    await page.getByRole('button', { name: 'Features', exact: true }).click()
    await page.waitForTimeout(100)
    assert.equal(await page.locator('[data-omni-entry]:visible').count(), 15)
    assert.ok(
      await page
        .locator('[data-omni-scroll]')
        .evaluate(el => el.scrollHeight > el.clientHeight),
    )
    const expandedTray = await page.locator('[data-omni-tray]').boundingBox()
    assert.ok(expandedTray && expandedTray.height <= 480 * 0.6 + 1)

    await page.setViewportSize({ width: 375, height: 800 })
    for (const type of ['project', 'layer', 'organisation']) {
      await page.getByRole('button', { name: `${type} only`, exact: true }).click()
      await page.waitForTimeout(100)
      assert.equal(
        await page.getByRole('button', { name: new RegExp(`Neon ${type}`) }).count(),
        2,
      )
      const row = page.getByRole('button', { name: new RegExp(`Neon ${type} 0`) })
      await row.click()
      assert.equal(await page.locator('output').textContent(), `activate:${type}-0`)
      const control = page.getByRole('button', {
        name: `${type === 'layer' ? 'Isolate' : 'Filter'} ${type} 0`,
      })
      await control.focus()
      await page.keyboard.press('Enter')
      assert.equal(await page.locator('output').textContent(), `control:${type}-0`)
      assert.equal(await row.evaluate(el => el.scrollWidth <= el.clientWidth), true)
    }
    assert.deepEqual(errors, [])
    console.log(
      `${name}: priority quotas, measured row budget, visual viewport keyboard shrink/recovery, narrow layout, expansion and independent controls passed`,
    )
  } finally {
    await browser.close()
  }
}
