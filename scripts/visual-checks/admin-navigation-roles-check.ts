// NODE
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox, type BrowserContext } from 'playwright'
import { loginLocalTestAccount } from './lib/local-test-login'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://hype.localhost'
const password = process.env.HYPE_TEST_PASSWORD
if (!password) throw new Error('Set HYPE_TEST_PASSWORD for the local test accounts')
if (!['hype.localhost', 'localhost', '127.0.0.1'].includes(new URL(origin).hostname)) {
  throw new Error('This check only supports local development origins')
}
const output = 'output/playwright/admin-navigation-roles'
await mkdir(output, { recursive: true })
const accounts = [
  'owner@organisation.com',
  'member@organisation.com',
  'owner@project.com',
  'maintainer@project.com',
  'member@project.com',
  'user@organisation.com',
]
const results: Array<Record<string, unknown>> = []
const sessions = new Map<string, Awaited<ReturnType<BrowserContext['storageState']>>>()
for (const [engineName, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  if (process.env.HYPE_TEST_BROWSER && process.env.HYPE_TEST_BROWSER !== engineName)
    continue
  const browser = await engine.launch({ headless: true })
  try {
    for (const email of accounts) {
      if (process.env.HYPE_TEST_ACCOUNT && process.env.HYPE_TEST_ACCOUNT !== email)
        continue
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        storageState: sessions.get(email),
      })
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      const checks: string[] = []
      try {
        if (!sessions.has(email)) {
          assert.equal(
            await loginLocalTestAccount(context, origin, email, password),
            200,
            `Sign-in failed for ${email}`,
          )
          sessions.set(email, await context.storageState())
        }
        checks.push('credential sign-in')
        const document = await page.goto(`${origin}/admin/projects`)
        assert.ok(
          document && document.status() < 400,
          `Project list HTTP ${document?.status()}`,
        )
        if (email === 'user@organisation.com') {
          await page.waitForURL(url => !url.pathname.startsWith('/admin'), {
            timeout: 20000,
          })
          checks.push('project list denied')
          await page.goto(`${origin}/admin/projects/hkghostsigns`)
          await page.waitForURL(url => !url.pathname.startsWith('/admin'), {
            timeout: 20000,
          })
          checks.push('direct project detail denied')
        } else {
          const card = page
            .locator('main')
            .first()
            .getByText('HK Ghost Signs', { exact: true })
            .first()
          await card.waitFor()
          checks.push('project list loaded')
          const search = page
            .locator('header input[placeholder="Filter resources"]')
            .first()
          const baselineText = await page.locator('main').first().innerText()
          await search.fill('Ghost')
          await card.waitFor()
          await page.waitForTimeout(600)
          assert.notEqual(await page.locator('main').first().innerText(), baselineText)
          checks.push('project list search filters rows')
          await search.fill('')
          await page.waitForTimeout(600)
          await card.waitFor()
          await card.click()
          await page.waitForURL('**/admin/projects/hkghostsigns')
          await page
            .locator('header')
            .getByRole('button', { name: 'Layers', exact: true })
            .first()
            .waitFor()
          checks.push('list to project detail')
          await page.goBack()
          await page.waitForURL('**/admin/projects')
          await card.waitFor()
          await page.goForward()
          await page.waitForURL('**/admin/projects/hkghostsigns')
          await page
            .locator('header')
            .getByRole('button', { name: 'Layers', exact: true })
            .first()
            .click()
          await page.waitForURL('**#layers')
          checks.push('Back/Forward and layer facet')
          if (
            [
              'owner@organisation.com',
              'owner@project.com',
              'maintainer@project.com',
            ].includes(email)
          ) {
            await page
              .getByRole('button', { name: 'Edit', exact: true })
              .first()
              .click()
            await page.waitForFunction(() =>
              Array.from(document.forms).some(form =>
                Array.from(new FormData(form).keys()).some(key =>
                  key.startsWith('data.organisationId'),
                ),
              ),
            )
            const parents = await page
              .locator('form')
              .evaluateAll(forms =>
                forms.flatMap(form =>
                  Array.from(new FormData(form).entries()).filter(([key]) =>
                    key.startsWith('data.organisationId'),
                  ),
                ),
              )
            assert.equal(parents.length, 1)
            assert.equal(parents[0][1], '4Jsk5LngvFZq')
            checks.push('editable form submits parent identity exactly once')
          }
        }
        assert.deepEqual(errors, [], 'Uncaught browser errors')
        results.push({ engine: engineName, email, status: 'passed', checks })
      } catch (error) {
        await page
          .screenshot({
            path: `${output}/${engineName}-${email.replaceAll('@', '-')}.png`,
          })
          .catch(() => {})
        results.push({
          engine: engineName,
          email,
          status: 'failed',
          checks,
          error: String(error),
          errors,
        })
      } finally {
        console.log(JSON.stringify(results.at(-1)))
        await writeFile(
          `${output}/results-${process.env.HYPE_TEST_BROWSER ?? 'all'}.json`,
          JSON.stringify(results, null, 2),
        )
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
}
if (results.some(result => result.status === 'failed')) process.exitCode = 1
