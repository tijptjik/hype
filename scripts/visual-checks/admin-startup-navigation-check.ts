// NODE
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox, type BrowserContext } from 'playwright'
import { loginLocalTestAccount } from './lib/local-test-login'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://hype.localhost'
const password = process.env.HYPE_TEST_PASSWORD
if (!password) throw new Error('Set HYPE_TEST_PASSWORD for the local test account')
const output = 'output/playwright/admin-startup-navigation'
await mkdir(output, { recursive: true })
let session: Awaited<ReturnType<BrowserContext['storageState']>> | undefined
const evidence: unknown[] = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  if (process.env.HYPE_TEST_BROWSER && process.env.HYPE_TEST_BROWSER !== name) continue
  const browser = await engine.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      storageState: session,
    })
    if (!session) {
      assert.equal(
        await loginLocalTestAccount(
          context,
          origin,
          'owner@organisation.com',
          password,
        ),
        200,
      )
      session = await context.storageState()
    }
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    const errors: string[] = []
    let stage = 'profile'
    page.on('response', response => {
      if (response.status() >= 400 && response.url().includes('/_app/remote/'))
        console.log(
          JSON.stringify({
            browser: name,
            stage,
            status: response.status(),
            endpoint: new URL(response.url()).pathname,
          }),
        )
    })
    const anonymousRequests: string[] = []
    const eagerModules: string[] = []
    page.on('pageerror', error => errors.push(`${stage}: ${error.message}`))
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.pathname.includes('/getResourcePage')) {
        const payload = Buffer.from(
          url.searchParams.get('payload') ?? '',
          'base64url',
        ).toString()
        if (payload.includes('anonymous::')) anonymousRequests.push(url.pathname)
      }
      if (/\/(AdminResourceHistory|ScopedFeatureIndex)\.svelte/.test(url.pathname))
        eagerModules.push(url.pathname)
    })
    const history = page
      .locator('main')
      .getByText('Changes to this project · newest first', { exact: true })
    const header = page.locator('header')
    await page.goto(`${origin}/admin/projects/hkghostsigns`)
    await header.getByRole('button', { name: 'History', exact: true }).first().waitFor()
    assert.deepEqual(eagerModules, [], 'Profile must not fetch deferred sections')
    assert.deepEqual(anonymousRequests, [], 'Sidebar must await authenticated scope')

    await page.waitForLoadState('networkidle')
    stage = 'bookmark'
    // A cold bookmark must survive both initial hydration and hard refresh.
    await page.goto(`${origin}/admin/projects/hkghostsigns#updates`)
    await history.waitFor()
    await page.waitForLoadState('networkidle')
    await page.reload()
    await history.waitFor()
    assert.equal(new URL(page.url()).hash, '#updates')
    await page.waitForLoadState('networkidle')
    await page.reload()
    await history.waitFor()

    stage = 'retry'
    // A real failed history request must offer a recoverable retry.
    await header.getByRole('button', { name: 'Profile', exact: true }).first().click()
    let requests = 0
    await page.route('**/getAdminResourceHistory?*', route => {
      requests++
      return requests === 1 ? route.abort('failed') : route.continue()
    })
    await header.getByRole('button', { name: 'History', exact: true }).first().click()
    const retry = page.locator('main').getByRole('button', { name: /retry|try again/i })
    await retry.waitFor()
    await retry.click()
    await retry.waitFor({ state: 'detached' })
    await history.waitFor()
    assert.equal(requests, 2)
    await page.unroute('**/getAdminResourceHistory?*')

    stage = 'delayed'
    // A completion after leaving History must not remount the obsolete section.
    await header.getByRole('button', { name: 'Profile', exact: true }).first().click()
    let release!: () => void
    let arrived!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const pending = new Promise<void>(resolve => {
      arrived = resolve
    })
    await page.route('**/getAdminResourceHistory?*', async route => {
      arrived()
      await gate
      await route.continue()
    })
    await header.getByRole('button', { name: 'History', exact: true }).first().click()
    await pending
    await header.getByRole('button', { name: 'Profile', exact: true }).first().click()
    const completed = page.waitForResponse(response =>
      response.url().includes('/getAdminResourceHistory?'),
    )
    release()
    await completed
    assert.equal(await history.isVisible(), false)
    await page.goBack()
    await history.waitFor()
    assert.deepEqual(errors, [])
    assert.deepEqual(anonymousRequests, [])
    await page.screenshot({ path: `${output}/${name}.png` })
    evidence.push({
      browser: name,
      coldHistoryBookmark: true,
      refresh: true,
      retry: true,
      staleCompletionIgnored: true,
      back: true,
      anonymousRequests: 0,
    })
    console.log(JSON.stringify(evidence.at(-1)))
  } finally {
    await browser.close()
  }
}
await writeFile(`${output}/results.json`, JSON.stringify(evidence, null, 2))
