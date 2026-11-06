// NODE
import { strict as assert } from 'node:assert'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const baseUrl = process.env.CHANGELOG_CHECK_URL ?? 'http://127.0.0.1:4173'
const html =
  '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceChangelogCheck.ts"></script></body></html>'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__changelog-toggle.html*', route =>
        route.fulfill({ contentType: 'text/html', body: html }),
      )
      await page.goto(`${baseUrl}/__changelog-toggle.html`)
      const first = page.locator('details[data-change-key="first-0"]')
      const summary = first.locator(':scope > summary')
      await first.waitFor()
      // Native toggle events are deferred: body content and retained state must update with activation.
      const rapid = await first.evaluate(async element => {
        const row = element as HTMLDetailsElement
        const summary = row.querySelector('summary')!
        for (let index = 0; index < 20; index++) {
          summary.click()
          await Promise.resolve()
          if (!row.open || row.children.length !== 2)
            return `open/body mismatch at ${index}`
          summary.click()
          await Promise.resolve()
          if (row.open || row.children.length !== 1)
            return `collapse/body mismatch at ${index}`
        }
        return null
      })
      assert.equal(
        rapid,
        null,
        `${name} ${width}: activation must update disclosure and content together`,
      )
      for (let index = 0; index < 8; index++) {
        await summary.click({ position: { x: 8, y: 8 } })
        assert.equal(await first.getAttribute('open'), '')
        await summary.click({ position: { x: 8, y: 8 } })
        assert.equal(await first.getAttribute('open'), null)
        await page.waitForTimeout(30)
        assert.equal(
          await first.getAttribute('open'),
          null,
          'A delayed toggle reopened the row',
        )
      }
      await summary.focus()
      await page.keyboard.press('Enter')
      assert.equal(await first.getAttribute('open'), '')
      const actor = summary.getByRole('link', { name: '@Example.Editor', exact: true })
      await actor.evaluate(element =>
        element.addEventListener('click', event => event.preventDefault(), {
          once: true,
        }),
      )
      await actor.click()
      assert.equal(
        await first.getAttribute('open'),
        '',
        'Actor link changed disclosure state',
      )
      await summary.focus()
      await page.keyboard.press('Space')
      assert.equal(await first.getAttribute('open'), null)
      await summary.click({ position: { x: 8, y: 8 } })
      const viewport = page.locator('svelte-virtual-list-viewport')
      for (let attempt = 0; attempt < 12 && (await first.count()); attempt++) {
        await viewport.evaluate(element => {
          element.scrollTop += 600
        })
        await page.waitForTimeout(80)
      }
      assert.equal(await first.count(), 0, 'Test did not recycle the expanded row')
      await viewport.evaluate(element => {
        element.scrollTop = 0
      })
      await first.waitFor()
      assert.equal(await first.getAttribute('open'), '', 'Recycling lost expansion')
      await summary.click({ position: { x: 8, y: 8 } })
      await page.waitForTimeout(150)
      assert.equal(
        await first.getAttribute('open'),
        null,
        'Recycled row did not collapse',
      )
      await viewport.evaluate(element => {
        element.scrollTop = element.scrollHeight / 2
      })
      await page.waitForTimeout(150)
      await viewport.evaluate(element => {
        element.scrollTop = 0
      })
      await first.waitFor()
      assert.equal(
        await first.getAttribute('open'),
        null,
        'Recycling restored stale expansion',
      )
      assert.deepEqual(errors, [])
      console.log(
        `${name} ${width}: rapid activation, repeated collapse, keyboard, actor links and virtual recycling passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
