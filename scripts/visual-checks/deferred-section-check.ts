// PLAYWRIGHT
import { chromium } from 'playwright'
// NODE
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
})
try {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let requested = false
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  await page.route('**/deferredSectionPayload*', async route => {
    requested = true
    await gate
    await route.continue()
  })
  await page.route('**/__deferred-section.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en"><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/deferredSectionCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('http://127.0.0.1:4173/__deferred-section.html')
  const toggle = page.getByRole('button', { name: 'Toggle section' })
  await toggle.waitFor()
  if (requested) throw new Error('Closed section fetched its chunk')
  await toggle.click()
  await page.getByRole('button', { name: /try again/i }).click()
  await page.getByRole('status').waitFor()
  await toggle.click()
  const loaded = page.waitForResponse(response =>
    response.url().includes('deferredSectionPayload'),
  )
  release()
  await loaded
  if (await page.getByText('Deferred section ready').count())
    throw new Error('Closed section rendered an obsolete completion')
  await toggle.click()
  await page.getByText('Deferred section ready').waitFor()
  if (!requested || errors.length)
    throw new Error(errors.join('\n') || 'Chunk never loaded')
  await mkdir('output/playwright', { recursive: true })
  await page.screenshot({ path: 'output/playwright/deferred-section.png' })
  console.log(
    JSON.stringify({
      closedSectionDoesNotFetch: true,
      retry: true,
      navigationWhilePending: true,
      ignoresUnmountedCompletion: true,
      reopened: true,
    }),
  )
} finally {
  await browser.close()
}
