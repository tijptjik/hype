import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { DEFAULT_FEATURE_TYPES } from '../../src/lib/features/intents'
const base = process.argv[2] ?? 'http://127.0.0.1:5175'
await mkdir('output/playwright/feature-setup', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 1120, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__feature-setup.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/featureSetupCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/featureIntents.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `export async function getFeatureIntentOptions(){return ${JSON.stringify(page.url().includes('single-all') ? [{ ...DEFAULT_FEATURE_TYPES[0], targetContexts: ['building_part'] }] : page.url().includes('single') ? DEFAULT_FEATURE_TYPES.slice(0, 1) : DEFAULT_FEATURE_TYPES)}}`,
        }),
      )
      await page.goto(`${base}/__feature-setup.html`)
      await page.getByRole('status', { name: 'Loading available layers' }).waitFor()
      const pendingCard = await page
        .getByRole('status', { name: 'Loading available layers' })
        .locator('[aria-hidden] > div')
        .first()
        .boundingBox()
      const pendingPanel = await page
        .locator('[data-setup-content] > div')
        .first()
        .boundingBox()
      if (await page.getByText('Loading available layers…').count())
        throw Error('Textual loader returned')
      await page
        .getByRole('button', { name: /CMEF.*Independent Bookstores.*Open bookstores/ })
        .first()
        .waitFor()
      const readyCard = await page
        .getByRole('region', { name: 'Recent layers' })
        .getByRole('button')
        .first()
        .boundingBox()
      const readyPanel = await page
        .locator('[data-setup-content] > div')
        .first()
        .boundingBox()
      for (const [before, after] of [
        [pendingCard, readyCard],
        [pendingPanel, readyPanel],
      ]) {
        if (
          !before ||
          !after ||
          (['x', 'y', 'width', 'height'] as const).some(
            key => Math.abs(before[key] - after[key]) > 1,
          )
        )
          throw Error(`Loading geometry changed: ${JSON.stringify({ before, after })}`)
      }
      const progress = page.getByRole('list', { name: 'Setup progress' })
      const singleLine = await progress
        .locator('button > span:last-child')
        .evaluateAll(labels =>
          labels.every(
            label =>
              label.getBoundingClientRect().height <=
              parseFloat(getComputedStyle(label).lineHeight) + 1,
          ),
        )
      if (!singleLine) throw Error('Setup question wrapped')
      await progress
        .getByRole('button', { name: /What map are you adding to/ })
        .waitFor()
      if (
        !(await progress
          .getByRole('button', { name: /What are you adding/ })
          .isDisabled())
      )
        throw Error('Preloaded draft answered the map question')
      const centered = await page.locator('[data-setup-content]').evaluate(el => {
        const content = el.getBoundingClientRect()
        const surface = el.parentElement!.getBoundingClientRect()
        return (
          Math.abs(
            (content.top + content.bottom) / 2 - (surface.top + surface.bottom) / 2,
          ) < 2 &&
          Math.abs(
            (content.left + content.right) / 2 - (surface.left + surface.right) / 2,
          ) < 2
        )
      })
      if (!centered) throw Error('Onboarding content is not centered')
      const progressBox = await progress.boundingBox()
      const questionBox = await page
        .getByRole('heading', { name: 'What map are you adding to?' })
        .boundingBox()
      if (!progressBox || !questionBox || progressBox.y <= questionBox.y)
        throw Error('Progress must sit below the question card')
      if ((await progress.getByRole('button').count()) !== 4)
        throw Error('Missing fourth location step')
      const search = page.getByRole('searchbox')
      const panel = page.locator('[data-setup-content] > div').first()
      const surface = await panel.evaluate(el => getComputedStyle(el).backgroundColor)
      if (surface === 'rgba(0, 0, 0, 0)' || surface === 'transparent')
        throw Error('Setup surface is transparent')
      await page.screenshot({
        path: `output/playwright/feature-setup/${name}-${width}-layers.png`,
      })
      await page
        .locator('html')
        .evaluate(el => el.setAttribute('data-theme', 'hype-dark'))
      await page.screenshot({
        path: `output/playwright/feature-setup/${name}-${width}-dark.png`,
      })
      await page
        .locator('html')
        .evaluate(el => el.setAttribute('data-theme', 'breadline-light'))
      await search.fill('Open')
      await page.getByRole('button', { name: /Open bookstores/ }).waitFor()
      await search.fill('Open book')
      if (!(await page.getByRole('button', { name: /Open bookstores/ }).isVisible()))
        throw Error('Narrowing removed matching cached results')
      await search.fill('Cultural Foundation')
      await page.getByRole('button', { name: 'CMEF Organisation' }).click()
      await page
        .getByRole('heading', { name: 'Independent Bookstores', exact: true })
        .waitFor()
      await page
        .getByRole('button', { name: /CMEF.*Independent Bookstores.*Open bookstores/ })
        .first()
        .click()
      await page.getByRole('button', { name: /Object An individual item/ }).click()
      await page.getByRole('button', { name: /Building part Shop space/ }).waitFor()
      await page.screenshot({
        path: `output/playwright/feature-setup/${name}-${width}-target.png`,
      })
      await page.getByRole('button', { name: /Building part Shop space/ }).click()
      await page.waitForFunction(() => {
        const bar = document
          .querySelector('[aria-label="Setup progress"]')
          ?.getBoundingClientRect()
        return bar?.y === 0 && bar.width === innerWidth
      })
      const stepCenters = await progress.locator('button').evaluateAll(buttons =>
        buttons.map(button => {
          const r = button.getBoundingClientRect()
          return r.y + r.height / 2
        }),
      )
      if (Math.max(...stepCenters) - Math.min(...stepCenters) > 1)
        throw Error('Setup steps not vertically centered')
      const locationProgress = await progress.boundingBox()
      if (
        !locationProgress ||
        locationProgress.y !== 0 ||
        locationProgress.width !== width
      )
        throw Error('Location step progress is not flush and full width')
      await page.getByText('Searching for building_part', { exact: true }).waitFor()
      await page.getByRole('button', { name: /Open bookstores/, exact: false }).click()
      await search.fill('Independent')
      if ((await page.locator('main').getAttribute('data-load-count')) !== '1')
        throw Error('Search or drill-down reloaded the catalogue')
      await page.getByRole('button', { name: /Permanently Closed/ }).click()
      await page.getByRole('button', { name: /Place A destination/ }).click()
      await page.getByRole('button', { name: /Building part Shop space/ }).waitFor()
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('Setup overflow')
      if (errors.length) throw Error(errors.join('\n'))
      console.log(
        `${name} ${width}: layer hierarchy, search, steps and target handoff passed`,
      )
      await page.goto(`${base}/__feature-setup.html?single`)
      await page
        .getByRole('button', { name: /CMEF.*Independent Bookstores.*Open bookstores/ })
        .first()
        .click()
      await page.getByRole('button', { name: /Building part Shop space/ }).waitFor()
      if ((await progress.getByRole('button', { name: /Object/ }).count()) !== 1)
        throw Error('Single type was not automatically selected')
      await page.goto(`${base}/__feature-setup.html?single-all`)
      await page.getByText('Searching for building_part', { exact: true }).waitFor()
      if (await progress.getByRole('button', { name: /Open bookstores/ }).isDisabled())
        throw Error('Single map was not automatically selected')
      console.log(`${name} ${width}: single-option stages automatically advance`)
      const target = await page.locator('[data-search-target]').elementHandle()
      const searchCount = await page.locator('main').getAttribute('data-search-count')
      await progress.getByRole('button').nth(2).click()
      await progress.getByRole('button').nth(3).click()
      if (!(await target?.evaluate(node => node.isConnected)))
        throw Error('Determined location step remounted the search widgets')
      if (
        (await page.locator('main').getAttribute('data-search-count')) !== searchCount
      )
        throw Error('Determined location step restarted the active search')
      console.log(`${name} ${width}: determined target retains the active search`)
      // Linked layers can resolve their sole type before catalogue loading finishes.
      await page.goto(`${base}/__feature-setup.html?linked-single`)
      await page.getByRole('button', { name: /Building part Shop space/ }).waitFor()
      await page.goto(`${base}/__feature-setup.html?linked-single-all`)
      await page.getByText('Searching for building_part', { exact: true }).waitFor()
      if ((await page.locator('main').getAttribute('data-search-count')) !== '1')
        throw Error('Linked single-option flow started location search more than once')
      console.log(
        `${name} ${width}: linked layer skips determined type and location stages`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
