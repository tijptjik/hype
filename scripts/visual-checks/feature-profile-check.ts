// NODE
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const directory = 'output/playwright/feature-profile'
await mkdir(directory, { recursive: true })
const reports: unknown[] = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [320, 390, 1440]) {
      console.log(`Checking ${name} at ${width}px`)
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: width === 1440 ? 'no-preference' : 'reduce',
      })
      page.setDefaultTimeout(15000)
      const errors: string[] = []
      page.on('pageerror', error => {
        errors.push(error.message)
        console.error(error.message)
      })
      await page.route('**/__feature-profile.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/featureProfileCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__feature-profile.html')
      const display = page.getByRole('button', { name: 'description en', exact: true })
      await display.waitFor()
      if (
        await page
          .getByRole('button', { name: 'Translate empty values from English' })
          .isVisible()
      )
        throw new Error('Translation controls visible outside multilingual mode')
      await page.getByRole('button', { name: 'Multilingual' }).click()
      await page.locator('[data-locale="ja"]').click()
      const bar = page.locator(
        '[data-profile-field="description"] [data-i18n-source-bar]',
      )
      await page.getByRole('button', { name: 'Toggle editing' }).click()
      if (width === 1440) {
        await page.waitForFunction(
          () =>
            document
              .querySelector(
                '[data-profile-field="description"] [data-i18n-source-bar]',
              )!
              .getAnimations().length > 0,
        )
      }
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-profile-field="description"] [data-i18n-source-bar]')!
            .getBoundingClientRect().height < 1,
      )
      await page.getByRole('button', { name: 'Toggle editing' }).click()
      if (width === 1440) {
        await page.waitForFunction(
          () =>
            document
              .querySelector(
                '[data-profile-field="description"] [data-i18n-source-bar]',
              )!
              .getAnimations().length > 0,
        )
      }
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-profile-field="description"] [data-i18n-source-bar]')!
            .getBoundingClientRect().height > 20,
      )
      if ((await bar.getAttribute('aria-hidden')) !== 'false')
        throw new Error('Translation sources did not open on edit')
      // Exercise the actual single-line title as well as the rich description.
      const titleDisplay = page.getByRole('button', { name: 'title en', exact: true })
      await titleDisplay.click()
      const titleInput = page.getByRole('textbox', { name: 'title en', exact: true })
      await titleInput.fill('Wonderful')
      await titleInput.press('Enter')
      await page.waitForTimeout(220)
      const titleBefore = await titleDisplay.evaluate(element => {
        const rect = element.getBoundingClientRect()
        const css = getComputedStyle(element)
        return {
          x: rect.x + parseFloat(css.paddingLeft) + parseFloat(css.borderLeftWidth),
          y: rect.y + parseFloat(css.paddingTop) + parseFloat(css.borderTopWidth),
        }
      })
      const headerBefore = await page
        .locator('[data-profile-field="title"] h3')
        .boundingBox()
      await titleDisplay.press('Enter')
      const titleAfter = await titleInput.evaluate(element => {
        const rect = element.getBoundingClientRect()
        const css = getComputedStyle(element)
        const padding = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom)
        const border =
          parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth)
        return {
          x: rect.x + parseFloat(css.paddingLeft) + parseFloat(css.borderLeftWidth),
          y:
            rect.y +
            parseFloat(css.paddingTop) +
            parseFloat(css.borderTopWidth) +
            Math.max(
              0,
              (rect.height - padding - border - parseFloat(css.lineHeight)) / 2,
            ),
        }
      })
      const headerAfter = await page
        .locator('[data-profile-field="title"] h3')
        .boundingBox()
      if (
        Math.abs(titleBefore.x - titleAfter.x) > 0.5 ||
        Math.abs(titleBefore.y - titleAfter.y) > 0.5
      )
        throw new Error(
          `Title text moved: ${JSON.stringify({ titleBefore, titleAfter })}`,
        )
      if (headerBefore?.x !== headerAfter?.x || headerBefore?.y !== headerAfter?.y)
        throw new Error('Opening a field scrolled the form')
      await titleInput.press('Enter')
      await titleDisplay.hover()
      await page.getByRole('button', { name: 'Clear title en', exact: true }).click()
      if ((await titleDisplay.innerText()) !== '—')
        throw new Error('Clear did not empty the chosen title')
      await page.waitForTimeout(220)
      const displayX = await display.evaluate(
        element =>
          element.getBoundingClientRect().x +
          parseFloat(getComputedStyle(element).paddingLeft) +
          parseFloat(getComputedStyle(element).borderLeftWidth),
      )
      await display.focus()
      await display.press('Tab')
      await page.keyboard.press('Shift+Tab')
      const focusStyle = await display.evaluate(element => ({
        focused: document.activeElement === element,
        offset: getComputedStyle(element).outlineOffset,
      }))
      if (!focusStyle.focused || parseFloat(focusStyle.offset) >= 0)
        throw new Error('Keyboard focus is missing or clipped outside the row')
      await page.screenshot({
        path: `${directory}/${name}-${width}-focus.png`,
        fullPage: true,
      })
      await page
        .locator('html')
        .evaluate(element => element.setAttribute('data-theme', 'breadline-dark'))
      await page.screenshot({
        path: `${directory}/${name}-${width}-focus-dark.png`,
        fullPage: true,
      })
      await page
        .locator('html')
        .evaluate(element => element.setAttribute('data-theme', 'breadline-light'))
      await display.press('Enter')
      const input = page.getByRole('textbox', { name: 'description en', exact: true })
      await input.waitFor()
      if (
        (await input.evaluate(
          element =>
            getComputedStyle(element.closest('.bits-form__control-wrap')!).boxShadow,
        )) !== 'none'
      )
        throw new Error('Active field has a focus shadow')
      const inputX = await input.evaluate(
        element =>
          element.getBoundingClientRect().x +
          parseFloat(getComputedStyle(element).paddingLeft) +
          parseFloat(getComputedStyle(element).borderLeftWidth),
      )
      if (Math.abs(displayX - inputX) > 1)
        throw new Error(`Text shifted ${inputX - displayX}px on edit`)
      await input.fill('<p>Changed</p>')
      await input.press('Escape')
      await display.waitFor()
      if (!(await display.locator('strong').count()))
        throw new Error('Escape lost rich markup')
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute('role') === 'button' &&
          document.activeElement?.getAttribute('aria-label') === 'description en',
      )
      // Collapsed Japanese still receives the empty-field bulk fill.
      await page
        .getByRole('button', { name: 'Translate empty values from English' })
        .click()
      await page.waitForFunction(
        () =>
          JSON.parse(
            document
              .querySelector('[data-profile-state]')!
              .getAttribute('data-profile-state')!,
          ).values.ja?.descriptionGen === true,
      )
      await page.locator('[data-locale="ja"]').click()
      await page.locator('[data-locale="ja"]').press('Alt+ArrowLeft')
      await page.locator('[data-locale="ja"]').press('Alt+ArrowLeft')
      await page.locator('[data-locale="ja"]').press('Alt+ArrowLeft')
      await page.getByRole('button', { name: 'Checkpoint draft' }).click()
      await page.locator('[data-locale="ja"]').press('Alt+ArrowRight')
      await page.getByRole('button', { name: 'Recover draft' }).click()
      await page.getByRole('button', { name: 'Multilingual' }).click()
      await page.getByRole('button', { name: 'description ja', exact: true }).waitFor()
      if (await display.isVisible())
        throw new Error('User locale was pinned on collapse')
      await page.getByRole('button', { name: 'Multilingual' }).click()
      await page.waitForTimeout(220)
      // Verify the library's floating clone, insertion preview, and finalized order.
      for (const [source, target] of [
        ['en', 'ja'],
        ['ja', 'en'],
      ]) {
        const handle = page.locator(`[data-locale-handle="${source}"]`)
        const origin = await handle.boundingBox()
        const destination = await page
          .locator(`[data-locale-handle="${target}"]`)
          .boundingBox()
        if (!origin || !destination) throw new Error('Missing drag geometry')
        await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2)
        await page.mouse.down()
        await page.mouse.move(
          origin.x + origin.width / 2 + 8,
          origin.y + origin.height / 2,
          { steps: 3 },
        )
        await page.locator('#dnd-action-dragged-el').waitFor()
        await page.mouse.move(
          destination.x + destination.width / 2,
          destination.y + destination.height / 2,
          { steps: 15 },
        )
        await page.waitForTimeout(200)
        if (source === 'en')
          await page.screenshot({ path: `${directory}/${name}-drag-clone.png` })
        await page.mouse.up()
        await page.locator('#dnd-action-dragged-el').waitFor({ state: 'detached' })
        await page.waitForFunction(
          first =>
            JSON.parse(
              document
                .querySelector('[data-profile-state]')!
                .getAttribute('data-profile-state')!,
            ).localeState.selectedLocales[0] === first,
          source,
        )
      }
      if (name === 'chromium' && width === 390) {
        const session = await page.context().newCDPSession(page)
        const source = (await page.locator('[data-locale-handle="en"]').boundingBox())!
        const target = (await page.locator('[data-locale-handle="ja"]').boundingBox())!
        const x = source.x + source.width / 2,
          y = source.y + source.height / 2
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        })
        await page.waitForTimeout(150)
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x + 8, y }],
        })
        await page.locator('#dnd-action-dragged-el').waitFor()
        for (let step = 1; step <= 12; step++) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
              {
                x: x + ((target.x + target.width / 2 - x) * step) / 12,
                y: y + ((target.y + target.height / 2 - y) * step) / 12,
              },
            ],
          })
          await page.waitForTimeout(20)
        }
        await page.waitForTimeout(200)
        await page.screenshot({ path: `${directory}/chromium-touch-clone.png` })
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        })
        await page.locator('#dnd-action-dragged-el').waitFor({ state: 'detached' })
        await page.waitForFunction(
          () =>
            JSON.parse(
              document
                .querySelector('[data-profile-state]')!
                .getAttribute('data-profile-state')!,
            ).localeState.selectedLocales[0] === 'en',
        )
        await page.locator('[data-locale="ja"]').press('Alt+ArrowLeft')
        await session.detach()
      }
      const prefixes = await page
        .locator('[data-profile-field="title"] [data-profile-locale]')
        .evaluateAll(rows =>
          Object.fromEntries(
            rows.map(row => [
              row.getAttribute('data-profile-locale'),
              row.querySelector('[data-inline-locale-row] > span')?.textContent ?? '',
            ]),
          ),
        )
      if (
        prefixes.ja !== '' ||
        prefixes.en !== 'En' ||
        prefixes['zh-Hant'] !== '繁中' ||
        prefixes['zh-Hans'] !== '简中'
      )
        throw new Error(`Incorrect reordered prefixes: ${JSON.stringify(prefixes)}`)
      await page.screenshot({
        path: `${directory}/${name}-${width}-editable.png`,
        fullPage: true,
      })
      await page.getByRole('button', { name: 'Use Location name' }).click()
      if (await page.getByRole('button', { name: 'title ja', exact: true }).count())
        throw new Error('Inherited title editable')
      await page.getByText('富怡コート', { exact: true }).waitFor()
      await page.screenshot({
        path: `${directory}/${name}-${width}-inherited.png`,
        fullPage: true,
      })
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      )
      if (scrollWidth > width)
        throw new Error(`Horizontal overflow ${scrollWidth} at ${width}`)
      if (errors.length) throw new Error(errors.join('\n'))
      reports.push({ browser: name, width, scrollWidth, displayX, inputX, errors })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
await writeFile(`${directory}/report.json`, JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports, null, 2))
