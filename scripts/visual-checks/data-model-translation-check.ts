import { DEFAULT_FEATURE_TYPES } from '../../src/lib/features/intents'
import { mkdir } from 'node:fs/promises'
await mkdir(
  process.env.DEV_RUNNER_ARTIFACTS ?? 'output/playwright/hub-translation-review',
  { recursive: true },
)
import { chromium } from '@playwright/test'
for (const type of [chromium]) {
  if (!process.env.DEV_RUNNER_CHROME_CLASS || !process.env.PLAYWRIGHT_BASE_URL)
    throw new Error('Run through dev-remote chrome with managed visible launch options')
  const browser = await type.launch({
    headless: false,
    channel: 'chrome',
    args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
  })
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => {
        errors.push(error.stack ?? error.message)
        console.error(error.stack ?? error.message)
      })
      const baseURL = process.env.PLAYWRIGHT_BASE_URL!
      const adminResponse = await page.goto(new URL('/admin', baseURL).href, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      })
      if (!adminResponse?.ok() || !new URL(page.url()).pathname.startsWith('/admin'))
        throw Error('Admin access failed')
      await page
        .locator('main:visible, [role=main]:visible, button:visible')
        .first()
        .waitFor({ timeout: 120000 })
      const sessionResponse = await page.request.get(
        new URL('/api/auth/get-session', baseURL).href,
      )
      const session = await sessionResponse.json()
      if (session?.user?.id !== 'hype-local-agent-admin')
        throw Error('Local admin identity not available')
      await page.route('**/src/lib/api/featureIntents.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `const types=${JSON.stringify(DEFAULT_FEATURE_TYPES.slice(0, 2).map(type => ({ ...type, labels: { en: type.label, 'zh-Hant': '', 'zh-Hans': '' } })))}; export async function getFeatureIntentSettings(){return {types,inheritedTypes:types,definition:types,namingRules:{},version:1,fingerprint:'1',lineage:[]}}; export async function getFeatureNameFieldsProject(){return 'project'}; export async function getFeatureNameProperties(){return []}; export async function getFeatureNamingTemplates(){return []}; export async function publishFeatureNamingTemplate(){return {}}`,
        }),
      )
      await page.route('**/src/lib/api/translation.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: "export async function translateContentField({source,target,text}) { await new Promise(r=>setTimeout(r,100)); return {status:'translated',text:target+' '+text} }",
        }),
      )
      await page.route('**/__hub-state.html*', r =>
        r.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/dataModelTranslationCheck.ts"></script></body></html>',
        }),
      )
      page.setDefaultTimeout(60000)
      await page.goto(
        `${process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4193'}/__hub-state.html?hub=1&fallback=1`,
        {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        },
      )
      const remove = page.getByRole('button', { name: 'Remove Type', exact: true })
      await remove.waitFor({ timeout: 20000 }).catch(async error => {
        console.error(await page.locator('body').innerText())
        throw Error(errors.join('\n') || String(error))
      })
      const custom = page.getByRole('switch', { name: 'Custom', exact: true })
      const [trashBox, customBox] = await Promise.all([
        remove.boundingBox(),
        custom.boundingBox(),
      ])
      if (!trashBox || !customBox || trashBox.x <= customBox.x)
        throw Error('Trash is not after the other header controls')
      if ((await remove.innerText()).trim()) throw Error('Remove Type is not icon-only')
      if (
        (await remove.locator('svg').evaluate(e => e.getBoundingClientRect().width)) !==
        20
      )
        throw Error('Trash icon is not size 5')
      await page.getByRole('button', { name: 'Save record' }).click()
      const missingSections = page.locator(
        '[data-feature-type-section][data-missing-translations=true]',
      )
      await missingSections.first().waitFor()
      if ((await missingSections.count()) !== 2)
        throw Error('Missing type sections are not marked')
      for (const section of await missingSections.all()) {
        if (
          (await section.locator('[data-type-body]').getAttribute('aria-hidden')) !==
          'false'
        )
          throw Error('Missing translations remain collapsed')
        const color = await section
          .locator(':scope > header h3')
          .evaluate(node => getComputedStyle(node).color)
        if (!color.includes('0.75'))
          throw Error(`Missing title is not subtly red: ${color}`)
      }

      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      if ((await page.locator('[data-missing-translation=true]').count()) !== 4)
        throw Error('Missing names in collapsed types or hidden languages not included')
      await dialog
        .getByRole('button', { name: 'Translate from English', exact: true })
        .click()
      await dialog.getByRole('button', { name: 'Accept all and continue' }).waitFor()
      await dialog.getByRole('button', { name: 'Accept all and continue' }).click()
      await page.waitForFunction(
        () =>
          document.querySelector('[data-model-fixture]')?.getAttribute('data-saved') ===
          '1',
      )
      if (await missingSections.count())
        throw Error('Resolved section titles remain marked')
      const draft = JSON.parse(
        (await page.locator('[data-model-fixture]').getAttribute('data-draft')) ?? '{}',
      )
      if (
        !draft.definition.every(
          type => type.labels?.['zh-Hant'] && type.labels?.['zh-Hans'],
        )
      )
        throw Error('Accepted type names not saved in draft')
      await page.screenshot({
        path: `${process.env.DEV_RUNNER_ARTIFACTS}/model-${width}.png`,
      })
      console.log(
        width,
        'Data Model review includes collapsed types and saves accepted names',
      )
      if (errors.length) throw Error(errors.join('\n'))
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
