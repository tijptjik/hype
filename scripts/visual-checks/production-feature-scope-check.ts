// NODE
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
// PLAYWRIGHT
import { chromium } from '@playwright/test'
// SERIALIZATION
import { createRequire } from 'node:module'
const kitRequire = createRequire(import.meta.resolve('@sveltejs/kit/package.json'))
const { parse } = await import(kitRequire.resolve('devalue'))

const output = process.env.DEV_RUNNER_ARTIFACTS
if (!output || !process.env.DEV_RUNNER_CHROME_CLASS)
  throw new Error('Run through dev-remote chrome')
const credentials = JSON.parse(
  readFileSync(`${homedir()}/.cache/hype-agentic-check/credentials.json`, 'utf8'),
)
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
const results: object[] = []
try {
  const loginContext = await browser.newContext()
  const login = await loginContext.request.post(
    'https://hype.hk/api/auth/sign-in/username',
    {
      data: { username: credentials.username, password: credentials.password },
      headers: { Origin: 'https://hype.hk' },
    },
  )
  assert.equal(login.status(), 200)
  assert.equal((await login.json()).user.id, credentials.id)
  const storageState = await loginContext.storageState()
  await loginContext.close()
  for (const scenario of [
    { name: 'bare', pins: [], expected: 1586, scope: {} },
    {
      name: 'organisation',
      pins: ['HKFoodWorks'],
      expected: 330,
      scope: { organisationId: '2u4orWMxRNbz' },
    },
    {
      name: 'project',
      pins: ['Breadline'],
      expected: 330,
      scope: { projectId: 'UMsz5DHb29Lx' },
    },
    {
      name: 'layer',
      pins: ['Donors'],
      expected: 311,
      scope: { layerId: '1msQMcuqfHrP' },
    },
    {
      name: 'organisation-project-layer',
      pins: ['HKFoodWorks', 'Breadline', 'Donors'],
      expected: 311,
      scope: {
        organisationId: '2u4orWMxRNbz',
        projectId: 'UMsz5DHb29Lx',
        layerId: '1msQMcuqfHrP',
      },
    },
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      storageState,
    })
    const page = await context.newPage()
    try {
      const response = await page.goto('https://hype.hk/admin/organisations', {
        timeout: 120000,
      })
      assert(response?.ok())
      assert.equal(new URL(page.url()).pathname, '/admin/organisations')
      const session = await (
        await page.request.get('https://hype.hk/api/auth/get-session')
      ).json()
      assert.equal(session.user.id, credentials.id)
      await page
        .getByRole('button', { name: 'Pin HKFoodWorks', exact: true })
        .waitFor({ timeout: 90000 })
      for (const name of scenario.pins) {
        await page.getByRole('button', { name: `Pin ${name}`, exact: true }).click()
        await page
          .getByRole('button', { name: `Unpin ${name}`, exact: true })
          .waitFor({ timeout: 30000 })
      }
      // Select scope on another page before navigation starts the Features query.
      let resolveLoaded: (value: unknown) => void
      let rejectLoaded: (error: unknown) => void
      const loaded = new Promise<any>((resolve, reject) => {
        resolveLoaded = resolve
        rejectLoaded = reject
      })
      // Capture the real response before Chrome discards the large list body.
      await page.route('**/getFeatures?*', async route => {
        try {
          const response = await route.fetch({ timeout: 120000 })
          const body = await response.body()
          await route.fulfill({ response, body })
          resolveLoaded(JSON.parse(body.toString()))
        } catch (error) {
          rejectLoaded(error)
          await route.abort()
        }
      })
      console.log('Selected scope', scenario.name)
      await page.getByRole('link', { name: 'Features', exact: true }).click()
      await page.waitForURL('**/admin/features**')
      const envelope = await loaded
      console.log('Received Features response for', scenario.name)
      assert.equal(envelope.type, 'result', JSON.stringify(envelope))
      const data = parse(envelope.data)._
      assert.equal(data.data.length, scenario.expected)
      assert.equal(data.totalCount, scenario.expected)
      assert.equal(data.hasMore, false)
      assert.equal(
        new Set(data.data.map((row: { id: string }) => row.id)).size,
        scenario.expected,
      )
      for (const row of data.data)
        for (const [key, id] of Object.entries(scenario.scope))
          assert.equal(row[key], id)
      await page
        .locator('[data-entity-index], article.bits-index-card')
        .first()
        .waitFor({ timeout: 120000 })
      assert.equal(
        await page
          .getByRole('alert')
          .filter({ hasText: 'Could not load Features' })
          .count(),
        0,
      )
      await page.screenshot({ path: `${output}/features-${scenario.name}.png` })
      const result = {
        scenario: scenario.name,
        count: data.data.length,
        renderedRows: await page
          .locator('[data-entity-index], article.bits-index-card')
          .count(),
        pass: true,
      }
      results.push(result)
      console.log(JSON.stringify(result))
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-${scenario.name}.png` })
      writeFileSync(
        `${output}/failure-${scenario.name}.txt`,
        await page.locator('body').innerText(),
      )
      throw error
    } finally {
      await context.close()
    }
  }
} finally {
  writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2))
  await browser.close()
}
