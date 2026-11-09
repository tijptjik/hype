import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'

const base = process.env.FEATURE_CHECK_URL ?? 'http://localhost:5175'
const directory = 'output/playwright/new-feature-review'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({
    ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}),
  })
  try {
    for (const width of [1536, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => {
        errors.push(error.message)
        console.log('Page error:', error.message)
      })
      page.on('response', response => {
        if (response.status() >= 500)
          console.log('HTTP error:', response.status(), response.url())
      })
      page.on('console', message => {
        if (message.type() === 'error') console.log('Console error:', message.text())
      })
      await page.route('**/__new-feature-review.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/newFeatureReviewCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/featureRevisions.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `
          export async function getFeatureGalleryRevisionEditor() {
            return { enabled: true, comparisonRevisionId: 'fixture', locales: ['en', 'zh-Hant'],
              gallery: { order: ['first', 'second'], entries: Object.fromEntries(['first', 'second'].map(id => [id, { caption: { en: 'Photo caption', 'zh-Hant': '相片說明' }, alt: {} }])) } };
          }
          ${['getFeatureRevisionWorkspace', 'getFeaturePublicationReview', 'saveFeatureTranslationDraft', 'submitFeatureTranslationDraft', 'publishFeatureTranslationRevision', 'decideFeatureTranslationRevision', 'getFeatureFormRevisionReview', 'publishFeatureFormRevision', 'saveFeatureGalleryRevision', 'getFeaturePrivateReview'].map(name => `export async function ${name}() { return { enabled: false }; }`).join('\n')}
        `,
        }),
      )
      await page.route('**/review-fixture/**', route => {
        if (
          !route.request().url().includes('first') &&
          !route.request().url().includes('second')
        )
          return route.continue()
        return route.fulfill({
          contentType: 'image/svg+xml',
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="${route.request().url().includes('first') ? '#557766' : '#887755'}"/></svg>`,
        })
      })
      await page.route('https://tiles.saanseoi.hk/**', route =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            tilejson: '3.0.0',
            tiles: ['https://review-map.invalid/{z}/{x}/{y}.pbf'],
            minzoom: 0,
            maxzoom: 14,
          }),
        }),
      )
      await page.route('https://review-map.invalid/**', route =>
        route.fulfill({ status: 204, body: '' }),
      )
      await page.goto(`${base}/__new-feature-review.html`)
      await page
        .getByText('Rotary ReHabAid Centre for Children', { exact: true })
        .waitFor({ timeout: 45000 })
        .catch(async error => {
          await page.screenshot({ path: `${directory}/failure.png`, fullPage: true })
          throw error
        })
      await page.getByText('5–7 Sha Wan Drive, Sandy Bay', { exact: true }).waitFor()
      if (await page.getByText('Accepting publishes', { exact: false }).count())
        throw Error('Removed explanation remains')
      const thumbnails = page.locator('[data-gallery-thumb-id] button[aria-pressed]')
      await thumbnails.nth(1).hover()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-gallery-thumb-index="1"] button[aria-pressed]')
            ?.getAttribute('aria-pressed') === 'true',
      )
      await page.waitForFunction(() =>
        Array.from(document.images).some(
          img =>
            img.src.includes('/review-fixture/second') &&
            img.complete &&
            img.naturalWidth > 0,
        ),
      )
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll('img')).some(
          img =>
            img instanceof HTMLImageElement &&
            img.src.includes('/review-fixture/second') &&
            !img.closest('[data-gallery-thumb-id]') &&
            img.getBoundingClientRect().width > 100 &&
            img.complete &&
            img.naturalWidth > 0,
        ),
      )
      const activePhoto = page.locator(
        '[data-gallery-thumb-index="1"] button[aria-pressed]',
      )
      if ((await activePhoto.getAttribute('aria-pressed')) !== 'true')
        throw Error('Inline photo selection failed')
      await page.getByRole('combobox').click()
      await page.getByRole('option', { name: 'Other', exact: true }).click()
      await page.getByRole('combobox').filter({ hasText: 'Other' }).waitFor()
      const headings = await page.locator('h3').evaluateAll(nodes =>
        nodes.map(node => ({
          text: node.textContent,
          y: node.getBoundingClientRect().y,
        })),
      )
      if (width > 900 && new Set(headings.slice(0, 2).map(item => item.y)).size !== 1)
        throw Error('Profile columns are misaligned')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('Horizontal overflow')
      await page.locator('[data-form-surface]').evaluate(node => {
        node.scrollTop = 0
      })
      if (width < 900) {
        const panes = await page.locator('.bits-feature-visual__image').boundingBox()
        if (!panes || panes.height > 430)
          throw Error('Stacked image pane has excess space')
      }
      await page.screenshot({
        path: `${directory}/${name}-${width}.png`,
        fullPage: true,
      })
      if (width < 900) {
        await page
          .getByText('5–7 Sha Wan Drive, Sandy Bay', { exact: true })
          .scrollIntoViewIfNeeded()
        await page.screenshot({
          path: `${directory}/${name}-${width}-details.png`,
          fullPage: true,
        })
      }
      console.log(
        JSON.stringify({
          name,
          width,
          headings,
          errors,
          buttons: await page.getByRole('button').evaluateAll(nodes =>
            nodes.map(node => ({
              label: node.getAttribute('aria-label'),
              text: node.textContent,
            })),
          ),
        }),
      )
      if (errors.length) throw Error(errors.join('\n'))
      const splitter = page.locator(
        '[role="separator"][aria-orientation="vertical"][aria-label="Resize map and image section"]',
      )
      if (width > 900) {
        await splitter.focus()
        await splitter.press('ArrowRight')
        if ((await splitter.getAttribute('aria-valuenow')) !== '55')
          throw Error('Keyboard split resize failed')
        const body = await page.locator('.bits-feature-visual__body').boundingBox()
        const handle = await splitter.boundingBox()
        if (!body || !handle) throw Error('Missing split geometry')
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
        await page.mouse.down()
        await page.mouse.move(body.x + body.width * 0.3, handle.y + handle.height / 2, {
          steps: 12,
        })
        await page.mouse.up()
        const share = Number(await splitter.getAttribute('aria-valuenow'))
        if (Math.abs(share - 30) > 1)
          throw Error('Pointer split resize failed: ' + share)
        const bounds = await page.evaluate(() => {
          const widthOf = (selector: string) =>
            document.querySelector(selector)!.getBoundingClientRect().width
          return {
            map: widthOf('.bits-feature-visual__map'),
            image: widthOf('.bits-feature-visual__image'),
            overview: widthOf('[aria-label="Location context map"]'),
            detail: widthOf('[aria-label="Detailed location map"]'),
            track: document
              .querySelector('[aria-label="Gallery thumbnails"]')!
              .parentElement!.parentElement!.getBoundingClientRect().width,
          }
        })
        if (
          Math.abs(bounds.map / (bounds.map + bounds.image) - 0.3) > 0.02 ||
          Math.abs(bounds.overview - bounds.map) > 2 ||
          Math.abs(bounds.detail - bounds.map) > 2 ||
          Math.abs(bounds.track - bounds.image) > 2
        )
          throw Error('Pane contents did not follow split: ' + JSON.stringify(bounds))
        if ((await activePhoto.getAttribute('aria-pressed')) !== 'true')
          throw Error('Resizing changed image selection')
        await page.screenshot({
          path: `${directory}/${name}-split.png`,
          fullPage: true,
        })
        await splitter.press('Home')
        if ((await splitter.getAttribute('aria-valuenow')) !== '20')
          throw Error('Minimum split failed')
        await splitter.press('End')
        if ((await splitter.getAttribute('aria-valuenow')) !== '80')
          throw Error('Maximum split failed')
        await splitter.dblclick()
        if ((await splitter.getAttribute('aria-valuenow')) !== '50')
          throw Error('Reset split failed')
      } else if (await splitter.isVisible())
        throw Error('Side-by-side splitter must be hidden in stacked layout')
      const intent = page
        .getByRole('button', { name: 'Change image intent', exact: true })
        .first()
      await intent.click()
      await page.getByRole('button', { name: 'Featured', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      const overview = await page
        .getByRole('region', { name: 'Location context map' })
        .boundingBox()
      const strip = await page
        .getByRole('region', { name: 'Gallery thumbnails' })
        .locator('../..')
        .boundingBox()
      if (
        !overview ||
        !strip ||
        Math.abs(overview.height - 128) > 1 ||
        Math.abs(overview.height - strip.height) > 1
      )
        throw Error('Context map must match the thumbnail strip height')
      const detail = await page
        .getByRole('region', { name: 'Detailed location map' })
        .boundingBox()
      if (!detail || overview.y + overview.height > detail.y + 1)
        throw Error('Context map must sit above the detail map')
      if (width > 900 && Math.abs(overview.y - strip.y) > 1)
        throw Error('Context map and thumbnails must align')
      const panePadding = await page
        .locator('.bits-feature-visual__map, .bits-feature-visual__image')
        .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).padding))
      if (panePadding.some(padding => padding !== '0px'))
        throw Error('Unexpected visual pane gutter')
      const inset = await page
        .locator('[data-form-surface]')
        .evaluate(node => getComputedStyle(node).padding)
      if (inset !== '0px') throw Error('Unexpected task panel gutter: ' + inset)
      const contextMap = page.getByRole('region', { name: 'Location context map' })
      if (await contextMap.getByRole('button', { name: 'Open fullscreen map' }).count())
        throw Error('Context map must not show maximize control')
      const detailMap = page.getByRole('region', { name: 'Detailed location map' })
      const openMap = detailMap.getByRole('button', { name: 'Open fullscreen map' })
      await openMap.click()
      await page.waitForFunction(() => {
        const map = document.querySelector('[aria-label="Detailed location map"]')
        return map && Math.abs(map.getBoundingClientRect().height - innerHeight) < 2
      })
      await page.keyboard.press('Escape')
      await openMap.waitFor()
      await openMap.focus()
      await openMap.press('Enter')
      await detailMap.getByRole('button', { name: 'Exit fullscreen map' }).click()
      await openMap.waitFor()
      await page.evaluate(async () => {
        await Promise.allSettled(
          document.getAnimations().map(animation => animation.finished),
        )
      })
      await page.locator('[data-form-surface]').evaluate(node => {
        node.scrollTop = 0
      })
      await page.locator('[data-task-header]').scrollIntoViewIfNeeded()
      const language = await page
        .getByRole('button', { name: 'Multilingual', exact: true })
        .boundingBox()
      const reject = await page
        .getByRole('button', { name: 'Reject', exact: true })
        .boundingBox()
      const separator = await page
        .locator('[data-task-header] [role="separator"]')
        .boundingBox()
      if (
        !language ||
        !reject ||
        !separator ||
        language.y >=
          (await page
            .getByRole('region', { name: 'Location context map' })
            .boundingBox())!.y ||
        language.x >= reject.x ||
        separator.x < language.x + language.width ||
        separator.x >= reject.x
      )
        throw Error(
          'Separator must sit between language control and Reject: ' +
            JSON.stringify({ language, reject, separator }),
        )
      const hiddenContentDot = page.getByRole('img', {
        name: 'Hidden multilingual content',
      })
      await hiddenContentDot.waitFor()
      await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
      await hiddenContentDot.waitFor({ state: 'detached' })
      await page.locator('[data-task-header] [data-locale="zh-Hant"]').click()
      await hiddenContentDot.waitFor()
      await page.locator('[data-task-header] [data-locale="zh-Hant"]').click()
      await hiddenContentDot.waitFor({ state: 'detached' })
      // The fixture's Simplified Chinese fields are empty and must not raise the indicator.
      await page.locator('[data-task-header] [data-locale="zh-Hans"]').click()
      await hiddenContentDot.waitFor({ state: 'detached' })
      await page.locator('[data-task-header] [data-locale="zh-Hans"]').click()

      await page.getByText('兒童復康中心', { exact: true }).waitFor()
      if (width > 900) {
        const languages = page.locator('[data-task-header] [data-locale-scroll]')
        await page.waitForTimeout(250)
        const clipped = await languages.evaluate(
          node => node.scrollWidth > node.clientWidth + 1,
        )
        if (clipped) throw Error('Header clips the three submitted language chips')
      }
      await page.getByRole('button', { name: 'Edit image text', exact: true }).click()
      const captionDialog = page.getByRole('dialog')
      const captionLanguage = captionDialog.getByRole('button', {
        name: 'Multilingual',
        exact: true,
      })
      const taskLanguage = page
        .locator('[data-task-header]')
        .getByRole('button', { name: 'Multilingual', exact: true })
      await captionLanguage.waitFor()
      if ((await captionLanguage.getAttribute('aria-expanded')) !== 'true')
        throw Error('Caption must inherit task multilingual state')
      await captionLanguage.click()
      if ((await taskLanguage.getAttribute('aria-expanded')) !== 'false')
        throw Error('Caption collapse must update task')
      await page.keyboard.press('Escape')
      await taskLanguage.click()
      await page.getByRole('button', { name: 'Edit image text', exact: true }).click()
      await captionLanguage.waitFor()
      if ((await captionLanguage.getAttribute('aria-expanded')) !== 'true')
        throw Error('Reopened caption must inherit updated task state')
      await page.keyboard.press('Escape')
      const track = await page
        .getByRole('region', { name: 'Gallery thumbnails' })
        .boundingBox()
      const toolbar = await page
        .getByRole('button', { name: 'Edit image text', exact: true })
        .boundingBox()
      if (!track || !toolbar || track.y + track.height > toolbar.y)
        throw Error('Thumbnail track must sit above the image toolbar')
      const overlay = await page
        .getByRole('button', { name: 'Edit image text', exact: true })
        .evaluate(node => {
          const chrome = node.closest('.pointer-events-none')
          const viewer = chrome?.parentElement
          const bounds = viewer?.getBoundingClientRect()
          const controls = node.getBoundingClientRect()
          return {
            position: chrome ? getComputedStyle(chrome).position : '',
            inside:
              !!bounds && controls.y >= bounds.y && controls.bottom <= bounds.bottom,
          }
        })
      if (overlay.position !== 'absolute' || !overlay.inside)
        throw Error('Toolbar must overlay the full-height image viewer')
      const camera = page.getByRole('button', {
        name: 'Open image metadata',
        exact: true,
      })
      const solidCamera = await camera.evaluate(node => {
        const probe = document.createElement('span')
        probe.style.backgroundColor = 'var(--color-panel)'
        node.appendChild(probe)
        const expected = getComputedStyle(probe).backgroundColor
        probe.remove()
        return (
          getComputedStyle(node).backgroundColor === expected &&
          getComputedStyle(node).opacity === '1'
        )
      })
      if (!solidCamera)
        throw Error('Camera background must match the opaque toolbar panel')
      await page.screenshot({ path: `${directory}/${name}-${width}-toolbar.png` })
      await page.goto(`${base}/__new-feature-review.html?single`)
      await page
        .getByText('Rotary ReHabAid Centre for Children', { exact: true })
        .waitFor()
      if (await page.locator('[data-gallery-thumb-id]').count())
        throw Error('Single image must not show a thumbnail track')
      await page
        .getByRole('button', { name: 'Change image intent', exact: true })
        .waitFor()
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
