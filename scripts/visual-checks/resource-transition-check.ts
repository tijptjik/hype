// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// NODE
import assert from 'node:assert/strict'

// biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone manual check, not a cached Turbo task.
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:5175'
for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [390, 1000]) {
      for (const reducedMotion of ['no-preference', 'reduce'] as const) {
        const page = await browser.newPage({
          viewport: { width, height: 800 },
          reducedMotion,
        })
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.route('**/__resource-transition.html', route =>
          route.fulfill({
            contentType: 'text/html',
            body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceTransitionCheck.ts"></script></body></html>',
          }),
        )
        await page.goto(`${origin}/__resource-transition.html`)
        const live = page.locator('[data-route-live]').last()
        const snapshot = page.locator('[data-route-snapshot]')
        await live.locator('[aria-busy="true"]').waitFor()
        assert.equal(
          await live.evaluate(e => getComputedStyle(e).opacity),
          '1',
          'Initial skeleton must remain visible',
        )
        await page.getByRole('button', { name: 'Resolve records' }).click()
        await live.locator('svelte-virtual-list-row').first().waitFor()
        await page.waitForTimeout(350)
        for (const rapid of [false, false, false, true]) {
          await live.locator('svelte-virtual-list-viewport').evaluate(element => {
            element.scrollTop = 156
            element.dispatchEvent(new Event('scroll'))
          })
          await page.waitForTimeout(100)
          const oldText = await live.textContent()
          await page.getByRole('button', { name: 'Next resource' }).click()
          if (rapid) await page.getByRole('button', { name: 'Next resource' }).click()
          await page.waitForTimeout(350)
          assert.equal(
            await live.evaluate(e => getComputedStyle(e).opacity),
            '0',
            'Pending destination must stay hidden',
          )
          assert.equal(
            await live.getAttribute('inert'),
            '',
            'Pending controls must be inert',
          )
          assert.equal(
            await snapshot.evaluate(e => getComputedStyle(e).opacity),
            '1',
            'Keep outgoing records opaque until ready',
          )
          assert.equal(
            await snapshot.textContent(),
            oldText,
            'Retain the last ready records across rapid navigation',
          )
          const oldBox = await snapshot
            .locator('svelte-virtual-list-viewport')
            .boundingBox()
          assert(oldBox && oldBox.height === 600)
          assert.equal(
            await snapshot
              .locator('svelte-virtual-list-viewport')
              .evaluate(element => element.scrollTop),
            156,
            'Retain outgoing scroll position',
          )
          const frames = await page.evaluate(async () => {
            const button = [...document.querySelectorAll('button')].find(
              e => e.textContent?.trim() === 'Resolve records',
            )
            if (!button) throw new Error('Missing resolve button')
            button.click()
            const results: { opacity: number; height: number; top: number }[] = []
            const start = performance.now()
            while (performance.now() - start < 400) {
              await new Promise(requestAnimationFrame)
              const layers = [
                ...document.querySelectorAll<HTMLElement>('[data-route-live]'),
              ]
              const layer = layers.at(-1)
              if (!layer) throw new Error('Missing current route')
              const viewport = layer.querySelector('svelte-virtual-list-viewport')
              if (!viewport) continue
              const { height, top } = viewport.getBoundingClientRect()
              results.push({
                height,
                top,
                opacity: Number(getComputedStyle(layer).opacity),
              })
            }
            return results
          })
          assert(frames.length > 0)
          assert(
            frames.every(frame => frame.height === 600 && frame.top === oldBox.y),
            'Ready records must overlap the old viewport',
          )
          if (reducedMotion === 'no-preference')
            assert(
              frames.some(frame => frame.opacity > 0 && frame.opacity < 1),
              'Ready records should fade in',
            )
          assert.equal(
            await snapshot.locator('svelte-virtual-list-viewport').count(),
            0,
            'Snapshot must be cleaned up',
          )
          assert.equal(await live.evaluate(e => getComputedStyle(e).opacity), '1')
        }
        const earlyFrames = await page.evaluate(async () => {
          const button = [...document.querySelectorAll('button')].find(
            e => e.textContent?.trim() === 'Next staggered resource',
          )
          if (!button) throw new Error('Missing staggered navigation')
          button.click()
          const frames: { live: number; snapshot: number }[] = []
          const start = performance.now()
          while (performance.now() - start < 250) {
            await new Promise(requestAnimationFrame)
            const live = [...document.querySelectorAll('[data-route-live]')].at(-1)
            const snapshot = document.querySelector('[data-route-snapshot]')
            if (!live || !snapshot) throw new Error('Missing layers')
            frames.push({
              live: Number(getComputedStyle(live).opacity),
              snapshot: Number(getComputedStyle(snapshot).opacity),
            })
          }
          return frames
        })
        assert(
          earlyFrames.every(frame => frame.live === 0 && frame.snapshot === 1),
          'Skeleton flashed during the page/URL handoff',
        )
        await page.getByRole('button', { name: 'Resolve records' }).click()
        await page.waitForTimeout(350)
        await page.getByRole('button', { name: 'Next cached resource' }).click()
        await page.waitForTimeout(350)
        assert.equal(
          await live.evaluate(e => getComputedStyle(e).opacity),
          '1',
          'Cached results must reveal without a loading wait',
        )
        assert.equal(await snapshot.locator('svelte-virtual-list-viewport').count(), 0)
        await page.getByRole('button', { name: 'Next resource' }).click()
        await page.getByRole('button', { name: 'Resolve empty' }).click()
        await page.waitForTimeout(350)
        assert.equal(
          await snapshot.locator('svelte-virtual-list-viewport').count(),
          0,
          'Empty results must also release the old view',
        )
        assert.equal(await live.evaluate(e => getComputedStyle(e).opacity), '1')
        assert.deepEqual(errors, [])
        console.log(
          engine.name(),
          width,
          reducedMotion,
          'initial skeleton, delayed readiness, crossfade, rapid navigation and empty results passed',
        )
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
}
