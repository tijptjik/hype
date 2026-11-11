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
          body: `let attempts = 0; export async function getFeatureIntentOptions(input){
            const attempt = ++attempts;
            document.querySelector('main').setAttribute('data-policy-calls', String(attempt));
            await new Promise(resolve => setTimeout(resolve, location.search.includes('race') && input.layerId === 'layer' ? 600 : 150));
            if (location.search.includes('fail-policy') && attempt === 1) throw new Error('Unavailable');
            return ${JSON.stringify(page.url().includes('single-all') ? [{ ...DEFAULT_FEATURE_TYPES[0], targetContexts: ['building_part'] }] : page.url().includes('single') ? DEFAULT_FEATURE_TYPES.slice(0, 1) : DEFAULT_FEATURE_TYPES)}}`,
        }),
      )
      await page.goto(`${base}/__feature-setup.html`)
      await page.getByRole('status', { name: 'Loading available layers' }).waitFor()
      await page.waitForTimeout(220)
      const pendingCard = await page
        .getByRole('status', { name: 'Loading available layers' })
        .locator('[aria-hidden] > div')
        .first()
        .boundingBox()
      const pendingPanel = await page
        .locator('[data-setup-content] > div > div')
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
        .locator('[data-setup-content] > div > div')
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
      const contained = await progress
        .locator('button')
        .evaluateAll(buttons =>
          buttons.every(button => button.scrollWidth <= button.clientWidth),
        )
      if (!contained) throw Error('Progress label overflows its step')
      await progress
        .getByRole('button', { name: /What map are you adding to/ })
        .waitFor()
      if (
        !(await progress
          .getByRole('button', { name: /What are you adding/ })
          .isDisabled())
      )
        throw Error('New draft unexpectedly answered the map question')
      const centered = await page.locator('[data-setup-content]').evaluate(el => {
        const content = el.getBoundingClientRect()
        const surface = el.parentElement?.getBoundingClientRect()
        if (!surface) return false
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
      if (!progressBox || !questionBox || progressBox.y >= questionBox.y)
        throw Error('Progress must sit above the question inside the shared surface')
      if ((await progress.getByRole('button').count()) !== 4)
        throw Error('Missing fourth location step')
      const search = page.getByRole('searchbox')
      const panel = page.locator('[data-setup-content] > div > div').first()
      const surface = await panel.evaluate(el => getComputedStyle(el).backgroundColor)
      if (surface === 'rgba(0, 0, 0, 0)' || surface === 'transparent')
        throw Error('Setup surface is transparent')
      const focusCard = page
        .getByRole('region', { name: 'Recent layers' })
        .getByRole('button')
        .first()
      await search.focus()
      // Firefox also makes the horizontal scroll container a keyboard stop.
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.keyboard.press('Tab')
        if (await focusCard.evaluate(node => node === document.activeElement)) break
      }
      const focusStyle = await focusCard.evaluate(node => {
        const style = getComputedStyle(node)
        return {
          visible: node.matches(':focus-visible'),
          shadow: style.boxShadow,
          outline: style.outlineStyle,
        }
      })
      if (
        !focusStyle.visible ||
        !focusStyle.shadow.includes('inset') ||
        focusStyle.outline !== 'none'
      )
        throw Error(`Card keyboard focus is not inset: ${JSON.stringify(focusStyle)}`)
      await page.screenshot({
        path: `output/playwright/feature-setup/${name}-${width}-focus.png`,
      })
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
      if (locationProgress?.y !== 0 || locationProgress.width !== width)
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
      if ((await page.locator('main').getAttribute('data-visited-steps')) !== '0,2')
        throw Error('Determined type stage was briefly entered')
      if ((await progress.getByRole('button', { name: /Object/ }).count()) !== 1)
        throw Error('Single type was not automatically selected')
      await page.goto(`${base}/__feature-setup.html?single-all`)
      await page.getByText('Searching for building_part', { exact: true }).waitFor()
      if ((await page.locator('main').getAttribute('data-visited-steps')) !== '0,3')
        throw Error('Determined setup stages were briefly entered')
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
      if ((await page.locator('main').getAttribute('data-visited-steps')) !== '0,3')
        throw Error('Linked setup briefly entered an automatic stage')
      if ((await page.locator('main').getAttribute('data-search-count')) !== '1')
        throw Error('Linked single-option flow started location search more than once')
      console.log(
        `${name} ${width}: linked layer skips determined type and location stages`,
      )
      for (const [scope, subtitle] of [
        ['organisation', 'Search projects and layers belonging to Cultural Foundation'],
        ['project', 'Search layers belonging to Independent Bookstores'],
      ]) {
        await page.goto(`${base}/__feature-setup.html?${scope}`)
        await page.getByText(subtitle, { exact: true }).waitFor()
        await page.screenshot({
          path: `output/playwright/feature-setup/${name}-${width}-${scope}.png`,
        })
        // A cached search still animates the outer card instead of snapping its height.
        await page.waitForTimeout(250)
        await search.fill('no-matching-layer')
        await page.waitForFunction(() =>
          document
            .querySelector('[data-setup-content]')
            ?.getAnimations()
            .some(
              animation =>
                animation instanceof CSSTransition &&
                animation.transitionProperty === 'height',
            ),
        )
        await page.waitForTimeout(250)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await search.fill('')
        await page.waitForTimeout(50)
        if (
          await page
            .locator('[data-setup-content]')
            .evaluate(node => node.getAnimations().length)
        )
          throw Error('Card transition ignored reduced motion')
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        if (
          await page
            .getByRole('button', { name: 'All organisations and projects' })
            .count()
        )
          throw Error('Removed scope-reset link returned')
      }
      if (width === 1440) {
        await page.goto(`${base}/__feature-setup.html?fail-policy`)
        const firstLayer = page
          .getByRole('region', { name: 'Recent layers' })
          .getByRole('button')
          .first()
        await firstLayer.click()
        if (
          !(await page
            .getByRole('heading', { name: 'What map are you adding to?' })
            .isVisible())
        )
          throw Error('Left the map picker before policy resolution')
        await page.getByRole('alert').waitFor()
        if ((await page.locator('main').getAttribute('data-visited-steps')) !== '0')
          throw Error('Failed policy request advanced setup')
        await page.getByRole('button', { name: /retry|try again/i }).click()
        await page.getByRole('button', { name: /Object An individual item/ }).waitFor()
        if ((await page.locator('main').getAttribute('data-policy-calls')) !== '2')
          throw Error('Mounted chooser reloaded resolved options')

        await page.goto(`${base}/__feature-setup.html?race`)
        const choices = page
          .getByRole('region', { name: 'Recent layers' })
          .getByRole('button')
        await choices.nth(0).click()
        await choices.nth(1).click()
        await page.getByRole('button', { name: /Object An individual item/ }).waitFor()
        await page.waitForTimeout(650)
        if (
          (await progress.getByRole('button').first().getAttribute('aria-label')) !==
          'Permanently Closed'
        )
          throw Error('Stale policy response replaced the latest layer')
        if ((await page.locator('main').getAttribute('data-policy-calls')) !== '2')
          throw Error('Type chooser fetched already resolved options')

        await page.route('**/__setup-logo.svg', route =>
          route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#155e75"/><circle cx="20" cy="20" r="10" fill="white"/></svg>',
          }),
        )
        await page.goto(`${base}/__feature-setup.html?logo-organisation`)
        await page.waitForFunction(
          () =>
            Array.from(document.querySelectorAll('button img')).filter(
              img => img instanceof HTMLImageElement && img.naturalWidth > 0,
            ).length === 2,
        )
        await page.screenshot({
          path: `output/playwright/feature-setup/${name}-organisation-icons.png`,
        })
        await page.unroute('**/__setup-logo.svg')
        await page.route('**/__setup-logo.svg', route => route.abort())
        await page.goto(`${base}/__feature-setup.html?logo`)
        await page.getByRole('region', { name: 'Recent layers' }).waitFor()
        await page.waitForFunction(
          () => document.querySelectorAll('button img').length === 0,
        )
        if (
          (await page
            .getByRole('region', { name: 'Recent layers' })
            .locator('button > svg')
            .count()) !== 2
        )
          throw Error('Broken organization images lost their layer fallback')
        console.log(
          `${name}: policy retry, stale responses, one fetch per choice, organization images and fallback passed`,
        )
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
