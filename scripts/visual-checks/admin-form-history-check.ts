// NODE
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox, type BrowserContext } from 'playwright'
import { loginLocalTestAccount } from './lib/local-test-login'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://hype.localhost'
const password = process.env.HYPE_TEST_PASSWORD
const featureId = process.env.HYPE_TEST_FEATURE_ID ?? '-3GMi1z5j5UL'
if (!password) throw new Error('Set HYPE_TEST_PASSWORD')
if (!['hype.localhost', 'localhost', '127.0.0.1'].includes(new URL(origin).hostname))
  throw new Error('Local origins only')
const output = 'output/playwright/admin-form-history'
await mkdir(output, { recursive: true })
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
    for (const email of [
      'owner@organisation.com',
      'owner@project.com',
      'maintainer@project.com',
    ]) {
      if (process.env.HYPE_TEST_ACCOUNT && process.env.HYPE_TEST_ACCOUNT !== email)
        continue
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        storageState: sessions.get(email),
      })
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      page.on('dialog', dialog => dialog.accept())
      const checks: string[] = []
      try {
        if (!sessions.has(email)) {
          assert.equal(
            await loginLocalTestAccount(context, origin, email, password),
            200,
          )
          sessions.set(email, await context.storageState())
        }
        const document = await page.goto(`${origin}/admin/features/${featureId}`)
        assert.ok(
          document && document.status() < 400,
          `Feature detail HTTP ${document?.status()}`,
        )
        await page
          .locator('header')
          .getByRole('button', { name: 'Edit', exact: true })
          .first()
          .click()
        const field = page.locator('textarea[name^="data.i18n.en.description/"]')
        await field.waitFor({ state: 'attached' })
        await page.waitForFunction(() =>
          Boolean(
            document.querySelector<HTMLTextAreaElement>(
              'textarea[name^="data.i18n.en.description/"]',
            )?.value,
          ),
        )
        const original = await field.inputValue()
        const edit = page
          .locator('header')
          .getByRole('button', { name: 'Edit', exact: true })
          .first()
        if (await edit.isVisible()) await edit.click()
        await page.waitForTimeout(1000)
        if (!(await field.isVisible())) {
          const description = page
            .getByRole('button', { name: 'Description · English', exact: true })
            .first()
          await description.focus()
          await description.press('Enter')
        }
        const draft = `${original} navigation test`
        await field.fill(draft)
        checks.push('unsaved description edited')
        await page.getByText('HK Ghost Signs', { exact: true }).first().click()
        await page.waitForURL(url => url.pathname === '/admin/projects/hkghostsigns')
        await page.goBack()
        await page.waitForURL(url => url.pathname === `/admin/features/${featureId}`)
        await page.waitForFunction(
          ({ expected }) =>
            document.querySelector<HTMLTextAreaElement>(
              'textarea[name^="data.i18n.en.description/"]',
            )?.value === expected,
          { expected: draft },
        )
        assert.equal(await field.inputValue(), draft)
        checks.push('Back restores unsaved description')
        await page.goForward()
        await page.waitForURL(url => url.pathname === '/admin/projects/hkghostsigns')
        await page.goBack()
        await page.waitForFunction(
          ({ expected }) =>
            document.querySelector<HTMLTextAreaElement>(
              'textarea[name^="data.i18n.en.description/"]',
            )?.value === expected,
          { expected: draft },
        )
        checks.push('repeated Back/Forward preserves draft')
        await page
          .locator('header')
          .getByRole('button', { name: 'Reset', exact: true })
          .first()
          .click()
        await page.waitForFunction(
          ({ expected }) =>
            document.querySelector<HTMLTextAreaElement>(
              'textarea[name^="data.i18n.en.description/"]',
            )?.value === expected,
          { expected: original },
        )
        await page.getByText('HK Ghost Signs', { exact: true }).first().click()
        await page.waitForURL(url => url.pathname === '/admin/projects/hkghostsigns')
        await page.goBack()
        await page.waitForFunction(
          ({ expected }) =>
            document.querySelector<HTMLTextAreaElement>(
              'textarea[name^="data.i18n.en.description/"]',
            )?.value === expected,
          { expected: original },
        )
        assert.equal(await field.inputValue(), original)
        checks.push('Reset invalidates historical draft')
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
          url: page.url(),
          visibleText: (await page.locator('body').innerText()).slice(-1800),
        })
      } finally {
        console.log(JSON.stringify(results.at(-1)))
        await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
}
if (results.some(result => result.status === 'failed')) process.exitCode = 1
