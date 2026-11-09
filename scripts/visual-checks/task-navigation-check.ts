import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { browserCases } from './lib/browser-cases'
await mkdir('output/playwright/task-navigation', { recursive: true })
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://localhost:5175'
for await (const { name, browser } of browserCases()) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', error => {
    errors.push(error.message)
    console.error(error.message)
  })
  await page.route('**/__task-navigation.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/taskNavigationCheck.ts"></script></body></html>',
    }),
  )
  // Exercise the real route with an indefinitely pending query and controlled route params.
  await page.route('**/src/routes/admin/tasks/**/+page.svelte*', async route => {
    const response = await route.fetch()
    const body = (await response.text()).replace(
      /import \{ page \} from [^;]+;/,
      'import { route as page } from "/src/tests/fixtures/taskNavigationQuery.svelte.ts";',
    )
    await route.fulfill({ response, body })
  })
  await page.route(
    '**/src/tests/fixtures/components/TaskNavigationFixture.svelte*',
    async route => {
      const response = await route.fetch()
      const body = (await response.text()).replace(
        /taskNavigationQuery\.svelte\.ts\?t=\d+/g,
        'taskNavigationQuery.svelte.ts',
      )
      await route.fulfill({ response, body })
    },
  )
  await page.route('**/src/lib/api/tasks.remote.*', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body:
        'export { getTask } from "/src/tests/fixtures/taskNavigationQuery.svelte.ts";\n' +
        [
          'getTasks',
          'reviewTask',
          'reassignTaskLayer',
          'beginMissingReportDraft',
          'beginNewFeatureDraft',
          'beginNewPhotosDraft',
          'finalizeTaskDraft',
          'submitMissingReport',
          'submitNewFeature',
          'submitNewPhotos',
        ]
          .map(
            name =>
              `export async function ${name}(){throw Error("Unexpected mutation/query: ${name}")}`,
          )
          .join('\n'),
    }),
  )
  await page.goto(`${origin}/__task-navigation.html`, {
    waitUntil: 'domcontentloaded',
  })
  await page.getByText('Task queue', { exact: true }).waitFor()
  const latency = await page
    .getByRole('button', { name: 'Open task', exact: true })
    .evaluate(
      button =>
        new Promise<number>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(Error('Task shell did not render')),
            5000,
          )
          const start = performance.now()
          const observer = new MutationObserver(() => {
            if (document.querySelector('[data-task-loading="newPhoto"]')) {
              observer.disconnect()
              clearTimeout(timeout)
              requestAnimationFrame(() => resolve(performance.now() - start))
            }
          })
          observer.observe(document.body, { subtree: true, childList: true })
          ;(button as HTMLButtonElement).click()
        }),
    )
  assert(latency < 200, `${name}: shell took ${latency} ms`)
  assert.equal(await page.getByText('Task queue', { exact: true }).count(), 0)
  await page.screenshot({ path: `output/playwright/task-navigation/${name}.png` })
  await page.getByRole('button', { name: 'Next task', exact: true }).click()
  await page.locator('[data-task-loading="reportedMissing"]').waitFor()
  await page.getByRole('button', { name: 'Finish old query', exact: true }).click()
  assert.equal(await page.locator('[data-task-loading="reportedMissing"]').count(), 1)
  await page.getByRole('button', { name: 'Fail query', exact: true }).click()
  await page.getByRole('alert').waitFor()
  await page.getByRole('alert').getByRole('button').click()
  await page.locator('[data-task-loading="reportedMissing"]').waitFor()
  await page.getByRole('button', { name: 'Finish current query', exact: true }).click()
  await page.locator('[data-task-loading]').waitFor({ state: 'detached' })
  assert.deepEqual(errors, [])
  console.log(
    `${name}: real task route shell painted in ${Math.round(latency)} ms with query unresolved; task switch, stale completion, failure, retry and empty response passed`,
  )
}
