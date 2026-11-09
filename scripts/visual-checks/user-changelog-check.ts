// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// BROWSER CHECKS
import { browserCases } from './lib/browser-cases'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const directory = 'output/playwright/user-changelog'
await mkdir(directory, { recursive: true })
const entries = ['hub', 'organisation', 'project', 'layer', 'feature'].map(
  (resourceType, index) => ({
    key: `entry-${index}`,
    resourceType,
    resourceId: `resource-${index}`,
    name: `${resourceType} with a sufficiently long descriptive name`,
    category: 'profile',
    createdAt: '2026-11-06T12:00:00.000Z',
    actorId: 'editor',
    actorName: 'Editor',
    actorUsername: 'editor',
    actorDisplayUsername: 'Editor',
    origin: 'user',
    reason: null,
    initial: false,
    baseline: false,
    unpublished: false,
    redacted: false,
    changes: [
      {
        path: ['record', 'code'],
        before: { present: true, value: 'old' },
        after: { present: true, value: 'new' },
      },
    ],
  }),
)
const result = {
  entries,
  nextCursor: null,
  unavailable: [],
  owner: { id: 'editor', name: 'Editor' },
  checkpoint: { lastCheckedAt: null, checkedThrough: new Date().toISOString() },
  filterOptions: {
    actors: [{ id: 'editor', origin: 'user', label: '@Editor' }],
    period: null,
  },
}
for await (const { name, browser } of browserCases()) {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('requestfailed', request =>
      errors.push(request.url() + ': ' + request.failure()?.errorText),
    )
    await page.route('**/src/lib/api/userChangelog.remote.ts*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `export const getUserChangelog = input => { if(input.userId !== 'editor') throw Error('wrong subject'); return Promise.resolve(${JSON.stringify(result)}); };`,
      }),
    )
    await page.route('**/__user-changelog.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/userChangelogCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__user-changelog.html`)
    const first = page.locator('details[data-change-key="entry-0"]')
    await first.waitFor().catch(async error => {
      console.log(
        JSON.stringify({
          errors,
          body: (await page.locator('body').innerText()).slice(0, 1500),
        }),
      )
      throw error
    })
    await first.locator('summary').click()
    assert.equal(await first.getAttribute('open'), '')
    assert.ok(
      await page
        .getByText(
          "This user's recorded changes to resources you manage · newest first",
        )
        .count(),
    )
    const dimensions = await page.evaluate(() => ({
      full: document.documentElement.scrollWidth,
      viewport: innerWidth,
      list:
        document.querySelector('svelte-virtual-list-viewport')?.getBoundingClientRect()
          .height ?? 0,
    }))
    assert.ok(dimensions.full <= dimensions.viewport + 1)
    assert.ok(dimensions.list > 200)
    assert.deepEqual(errors, [])
    await page.screenshot({
      path: `${directory}/${name}-${width}.png`,
      fullPage: true,
    })
    await page.close()
    console.log(
      `${name} ${width}: user feed, disclosure, bounded scroll and layout passed`,
    )
  }
}
