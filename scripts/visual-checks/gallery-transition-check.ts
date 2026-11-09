// BROWSER CHECKS
import { browserCases } from './lib/browser-cases'
// NODE
import assert from 'node:assert/strict'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://localhost:5175'
for await (const { name, browser } of browserCases()) {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://images.test/**', route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="${route.request().url().includes('wide') ? '#126c72' : '#a24836'}"/></svg>`,
    }),
  )
  await page.route('**/__gallery-transition.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/imagePresentationCheck.ts"></script></body></html>',
    }),
  )
  await page.goto(`${origin}/__gallery-transition.html`)
  await page.waitForFunction(() => {
    const scenes = document.querySelectorAll('[data-testid="stage"] .viewer-scene')
    return (
      scenes.length === 1 && !scenes[0].getAttribute('style')?.includes('transition:')
    )
  })
  // Observe the incoming layer from its first mount through settlement, including any brief removal.
  await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="stage"]')!
    const state = { image: null as Element | null, removed: false }
    Object.assign(window, { galleryTransitionCheck: state })
    new MutationObserver(records => {
      for (const record of records) {
        for (const removed of record.removedNodes) {
          if (state.image && (removed === state.image || removed.contains(state.image)))
            state.removed = true
        }
      }
      state.image ??= stage.querySelector('.viewer-scene img[src*="wide"]')
    }).observe(stage, { childList: true, subtree: true })
  })
  await page.getByRole('button', { name: 'Wide image', exact: true }).click()
  await page.waitForFunction(() => {
    const scenes = document.querySelectorAll('[data-testid="stage"] .viewer-scene')
    return (
      scenes.length === 1 &&
      scenes[0].querySelector('img[src*="wide"]') &&
      !scenes[0].getAttribute('style')?.includes('transition:')
    )
  })
  const result = await page.evaluate(() => {
    const state = (
      window as unknown as {
        galleryTransitionCheck: { image: Element | null; removed: boolean }
      }
    ).galleryTransitionCheck
    return {
      observed: Boolean(state.image),
      removed: state.removed,
      connected: state.image?.isConnected,
    }
  })
  assert.deepEqual(result, { observed: true, removed: false, connected: true })
  assert.deepEqual(errors, [])
  console.log(name, result)
}
