import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'

await mkdir('output/playwright', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  if (process.argv[2] && process.argv[2] !== name) continue
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 600 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__breadcrumb-trail.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/breadcrumbTrailCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__breadcrumb-trail.html')
    const organisation = page.getByRole('button', {
      name: 'Cultural & Media Education Foundation',
      exact: true,
    })
    const project = page.getByRole('button', {
      name: 'Old and Valuable Trees',
      exact: true,
    })
    const layer = page.locator('[data-layer-label]')
    const chevron = page.locator('[data-layer-disclosure]')
    await organisation.waitFor().catch(error => {
      console.error('Page errors:', errors)
      throw error
    })
    const iconSlot = page.locator('[data-breadcrumb-icon]')
    const initialIconBox = await iconSlot.boundingBox()
    assert(initialIconBox)
    assert.equal(await iconSlot.getAttribute('data-breadcrumb-icon'), 'grid')
    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 600 })
      assert.equal(await layer.isVisible(), false)
      const menu = await page
        .getByRole('button', { name: 'Menu', exact: true })
        .boundingBox()
      assert(menu)
      for (const label of [organisation, project]) {
        assert(await label.evaluate(el => el.scrollWidth > el.clientWidth))
        await label.click()
        assert.equal(await label.getAttribute('aria-expanded'), 'true')
        assert.equal(
          await iconSlot.getAttribute('data-breadcrumb-icon'),
          label === organisation ? 'organisation' : 'project',
        )
        assert(await label.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
        const box = await label.boundingBox()
        assert(box && box.x >= 0 && box.x + box.width <= width)
        assert(box.height >= 32)
        await label.click()
        assert.equal(await label.getAttribute('aria-expanded'), 'false')
      }
      await chevron.click()
      assert.equal(await layer.isVisible(), true)
      assert.equal(await iconSlot.getAttribute('data-breadcrumb-icon'), 'layer')
      assert.equal(await chevron.getAttribute('aria-expanded'), 'true')
      assert(await layer.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
      const afterMenu = await page
        .getByRole('button', { name: 'Menu', exact: true })
        .boundingBox()
      assert.deepEqual(afterMenu, menu)
      await page
        .locator('[data-feature-breadcrumb-trail]')
        .evaluate(el =>
          Promise.all(
            el.getAnimations({ subtree: true }).map(animation => animation.finished),
          ),
        )
      assert.equal(
        await iconSlot
          .locator('[data-resource-icon="layer"]')
          .evaluate(el => getComputedStyle(el).opacity),
        '1',
      )
      assert.equal(
        await iconSlot
          .locator('[data-resource-icon="grid"]')
          .evaluate(el => getComputedStyle(el).opacity),
        '0',
      )
      await page.screenshot({
        path: `output/playwright/breadcrumb-layer-${name}-${width}.png`,
      })
      await layer.click()
      assert.equal(await layer.isVisible(), false)
      await chevron.focus()
      await page.keyboard.press('Enter')
      assert.equal(await layer.isVisible(), true)
      await page.keyboard.press('Space')
      assert.equal(await layer.isVisible(), false)
      await project.click()
      await page.getByRole('button', { name: 'Next feature' }).click()
      assert.equal(await project.getAttribute('aria-expanded'), 'false')
    }
    await page.setViewportSize({ width: 800, height: 600 })
    assert.equal(await layer.isVisible(), true)
    // Check both directions and reversal while a transition is still running.
    const trail = page.locator('[data-feature-breadcrumb-trail]')
    for (const expected of ['true', 'false', 'true']) {
      await project.evaluate(button => button.click())
      await page.evaluate(() => new Promise(requestAnimationFrame))
      assert.equal(await project.getAttribute('aria-expanded'), expected)
      assert(
        await trail.evaluate(el =>
          el
            .getAnimations({ subtree: true })
            .some(animation => animation.playState === 'running'),
        ),
      )
    }
    await trail.evaluate(el =>
      Promise.all(
        el.getAnimations({ subtree: true }).map(animation => animation.finished),
      ),
    )
    assert.equal(
      await iconSlot
        .locator('[data-resource-icon="project"]')
        .evaluate(el => getComputedStyle(el).opacity),
      '1',
    )
    assert.equal(
      await iconSlot
        .locator('[data-resource-icon="grid"]')
        .evaluate(el => getComputedStyle(el).opacity),
      '0',
    )
    const iconBox = await iconSlot.boundingBox()
    assert(
      iconBox &&
        iconBox.width === initialIconBox.width &&
        iconBox.height === initialIconBox.height,
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await project.click()
    assert.equal(await project.getAttribute('aria-expanded'), 'false')
    assert.equal(
      await trail.evaluate(el => el.getAnimations({ subtree: true }).length),
      0,
    )
    assert.equal(await iconSlot.getAttribute('data-breadcrumb-icon'), 'grid')
    assert.equal(
      await iconSlot
        .locator('[data-resource-icon="grid"]')
        .evaluate(el => getComputedStyle(el).opacity),
      '1',
    )
    assert.equal(
      await iconSlot
        .locator('[data-resource-icon="project"]')
        .evaluate(el => getComputedStyle(el).opacity),
      '0',
    )
    assert.deepEqual(errors, [])
    console.log(
      `${name}: label toggles, hidden-layer disclosure, keyboard, feature reset, viewport bounds, animated toggles, resource icons and reduced motion passed`,
    )
  } finally {
    await browser.close()
  }
}
