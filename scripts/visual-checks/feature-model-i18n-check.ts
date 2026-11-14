// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Managed runner supplies these variables outside Turborepo.
import { DEFAULT_FEATURE_TYPES } from '../../src/lib/features/intents'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  for (const [locale, title, kind, intro] of [
    ['en', 'New Feature Flow', 'Feature kind', 'Configure what happens'],
    ['zh-hans', '新建地图项目流程', '地图项目类型', '配置添加地图项'],
    ['zh-hant', '新增地圖項目流程', '地圖項目類型', '設定新增地圖項目'],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    })
    await context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale, url: base }])
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(base)
    const session = await (
      await page.request.get(`${base}/api/auth/get-session`)
    ).json()
    assert.equal(session?.user?.id, 'hype-local-agent-admin')
    const response = await page.goto(`${base}/admin`)
    assert(response?.ok())
    assert(new URL(page.url()).pathname.startsWith('/admin'))
    await page.route('**/src/lib/api/featureIntents.remote.*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `const types=${JSON.stringify(DEFAULT_FEATURE_TYPES.slice(0, 2))}; export async function getFeatureIntentSettings(){return {types,inheritedTypes:types,definition:types,namingRules:{},version:1,fingerprint:'fixture',lineage:[]}}; export async function getFeatureNameFieldsProject(){return 'project'}; export async function getFeatureNameProperties(){return []}; export async function getFeatureNamingExamples(){return []}; export async function getFeatureNamingTemplates(){return []}; export async function publishFeatureNamingTemplate(){return {}}; export async function previewFeatureNamingDefault(){return {rows:[]}}`,
      }),
    )
    await page.route('**/__feature-model-i18n.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: `<html lang="${locale}" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/dataModelTranslationCheck.ts"></script></body></html>`,
      }),
    )
    await context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale, url: base }])
    await page.goto(`${base}/__feature-model-i18n.html`)
    const settings = page.locator('[data-feature-type-settings]')
    await settings.locator('[data-type-editor]').first().waitFor({ timeout: 30000 })
    await settings.getByRole('button', { name: title, exact: true }).waitFor()
    await page.screenshot({ path: `${output}/initial-${locale}.png` })
    assert(((await settings.textContent()) ?? '').includes(kind))
    if (locale !== 'en') {
      for (const english of [
        'Multilingual',
        'New Feature Flow',
        'Feature types and their location rules',
        'Stable identifier',
        'Feature kind',
        'Location behavior',
        'Where can features be located?',
      ]) {
        assert(
          !((await settings.textContent()) ?? '').includes(english),
          `${locale}: ${english}`,
        )
      }
    }
    await settings.getByRole('button', { name: title, exact: true }).click()
    const help = page.locator('[data-feature-intent-help="model"]')
    await help.waitFor()
    assert(((await help.textContent()) ?? '').includes(intro))
    await page.waitForTimeout(350)
    await page.screenshot({ path: `${output}/data-model-${locale}.png` })
    await page.keyboard.press('Escape')
    assert.deepEqual(errors, [])
    console.log(`Verified New Feature Flow and help in ${locale}`)
    await context.close()
  }
} finally {
  await browser.close()
}
