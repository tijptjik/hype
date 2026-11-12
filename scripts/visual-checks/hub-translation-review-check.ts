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
      const pageErrors: string[] = []
      page.on('pageerror', error => {
        pageErrors.push(error.stack ?? error.message)
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
      await page.route('**/__hub-state.html*', r =>
        r.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/translationReviewCheck.ts"></script></body></html>',
        }),
      )
      page.setDefaultTimeout(60000)
      await page.goto(
        `${process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4193'}/__hub-state.html?hub=1`,
        {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        },
      )
      await page.getByRole('button', { name: 'Save record' }).click()
      console.log(type.name(), width, 'opened review')
      const dialog = page.getByRole('dialog')
      const source = dialog.getByRole('button', { name: 'Translate from English' })
      await source.waitFor()
      if ((await source.locator('svg').count()) !== 1)
        throw Error('Translation icon missing')
      if (
        (await source.evaluate(e => getComputedStyle(e).backgroundColor)) !==
        'rgba(0, 0, 0, 0)'
      )
        throw Error('Source background not clear')
      await page.screenshot({
        animations: 'disabled',
        path: `${process.env.DEV_RUNNER_ARTIFACTS ?? 'output/playwright/hub-translation-review'}/choices-${type.name()}-${width}.png`,
      })
      await source.click()
      await dialog
        .getByRole('status')
        .filter({ hasText: /[01]\s*\/\s*2/ })
        .waitFor()
      await dialog.getByRole('button', { name: 'Accept all and continue' }).waitFor()
      await source.waitFor({ state: 'detached' })
      await dialog.getByRole('button', { name: 'Close translation review' }).click()
      await page.screenshot({
        animations: 'disabled',
        path: `${process.env.DEV_RUNNER_ARTIFACTS ?? 'output/playwright/hub-translation-review'}/proposals-${type.name()}-${width}.png`,
      })
      const proposal = page.locator('[data-translation-suggestion]').first()
      await proposal.getByRole('button', { name: 'Reject translation' }).click()
      await page.getByRole('button', { name: 'Save record' }).click()
      if ((await page.locator('[data-translation-suggestion]').count()) !== 1)
        throw Error('Dismissed suggestion did not restore original field')
      await source.waitFor()
      await source.click()
      await dialog.getByRole('button', { name: 'Accept all and continue' }).waitFor()
      await dialog.getByRole('button', { name: 'Close translation review' }).click()
      await proposal.getByRole('button', { name: /suggestion/i }).click()
      if (await proposal.getByRole('button', { name: 'Accept Translation' }).count())
        throw Error('Acceptance remains during editing')
      await proposal.getByRole('textbox').fill('Human edited')
      await page.getByRole('button', { name: 'Save record' }).click()
      await page.waitForFunction(
        () =>
          JSON.parse(
            document
              .querySelector('[data-review-fixture]')
              ?.getAttribute('data-values') ?? '{}',
          ).zhHant.title === 'Human edited',
      )
      await dialog.getByRole('button', { name: 'Translate from English' }).click()
      await dialog.getByRole('button', { name: 'Accept all and continue' }).waitFor()
      await dialog.getByRole('button', { name: 'Close translation review' }).click()
      const description = page.locator('[data-translation-suggestion]:visible').first()
      await description.getByRole('button', { name: /suggestion/i }).click()
      const editor = description.locator('.ProseMirror[contenteditable=true]')
      await editor.waitFor({ timeout: 15000 }).catch(async error => {
        console.error(await description.innerHTML())
        console.error(
          await page.locator('[data-review-fixture]').getAttribute('data-values'),
        )
        throw error
      })
      await editor.fill('Edited Markdown description')
      const caret = await editor
        .locator('p')
        .first()
        .evaluate(e => getComputedStyle(e).caretColor)
      if (caret === 'transparent' || caret === 'rgba(0, 0, 0, 0)')
        throw Error('Paragraph caret remains transparent')
      await page.getByRole('button', { name: 'Save record' }).click()
      await page.waitForFunction(
        () =>
          JSON.parse(
            document
              .querySelector('[data-review-fixture]')
              ?.getAttribute('data-values') ?? '{}',
          ).zhHant.description?.trim() === 'Edited Markdown description',
      )
      // With every field filled, Save accepts remaining suggestions without another prompt.
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-review-fixture]')
            ?.getAttribute('data-saved') === '1',
      )
      console.log(
        type.name(),
        width,
        'states, rejection, implicit edit acceptance, Markdown and skip passed',
      )

      await page.route('**/src/lib/api/translation.remote.ts*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `export async function translateContentField(input) { return { status: 'translated', text: 'Suggested option', source: input.source, target: input.target, automatic: { value: 'Suggested option', sourceLocale: input.source, sourceText: input.text, sourceHash: 'a'.repeat(64), receipt: 'b'.repeat(64), provider: 'fixture', model: null, generatedAt: '2026-11-12T00:00:00Z' } } }`,
        }),
      )
      for (const [path, entry] of [
        ['__hub-fields.html', 'fieldTranslationReviewCheck'],
        ['__advanced.html', 'advancedLayoutCheck'],
      ]) {
        await page.route(`**/${path}*`, route =>
          route.fulfill({
            contentType: 'text/html',
            body: `<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/${entry}.ts"></script></body></html>`,
          }),
        )
      }
      const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4193'
      await page.goto(`${origin}/__hub-fields.html?hub=1`, {
        waitUntil: 'domcontentloaded',
      })
      await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
      await page
        .getByRole('button', { name: 'Clear Option 1 zh-Hant', exact: true })
        .click()
      await page.getByRole('button', { name: 'Save record' }).click()
      await dialog.waitFor()
      if (
        (await page.locator('body').innerText()).includes(
          'AI suggestions remain unpublished',
        )
      )
        throw Error('Legacy tab banner remains')
      await dialog.getByRole('button', { name: 'Translate from English' }).click()
      await dialog.getByRole('button', { name: 'Accept all and continue' }).waitFor()
      await dialog.getByRole('button', { name: 'Close translation review' }).click()
      const option = page.locator('[data-dnd-item]').first()
      const suggestedOption = option.locator('[data-translation-suggestion]').filter({
        has: page.getByRole('button', { name: 'Option 1 zh-Hant', exact: true }),
      })
      await suggestedOption.getByRole('button', { name: 'Reject translation' }).click()
      await suggestedOption.waitFor({ state: 'detached' })
      await page.getByRole('button', { name: 'Save record' }).click()
      await dialog.getByRole('button', { name: 'Translate from English' }).click()
      await dialog.getByRole('button', { name: 'Accept all and continue' }).waitFor()
      await dialog.getByRole('button', { name: 'Close translation review' }).click()
      await option
        .getByRole('button', { name: 'Accept Translation', exact: true })
        .first()
        .click()
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector('output')?.getAttribute('data-property-state') ??
              '{}',
          ).properties[0].values[0].i18n.zhHant.value === 'Suggested option',
      )
      await page.goto(`${origin}/__advanced.html`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: 'Toggle editing' }).click()
      const once = page.getByRole('switch', {
        name: 'Ask about missing translations only once',
      })
      await once.click()
      if ((await once.getAttribute('aria-checked')) !== 'true')
        throw Error('Organisation setting did not change')
      await page.screenshot({
        animations: 'disabled',
        path: `${process.env.DEV_RUNNER_ARTIFACTS ?? 'output/playwright/hub-translation-review'}/organisation-advanced-${width}.png`,
      })
      console.log(
        type.name(),
        width,
        'explicit Fields review, option rejection/acceptance and Advanced setting passed',
      )
      if (pageErrors.length) throw Error(pageErrors.join('\n'))
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
