// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox, type Page } from 'playwright'

/** Check the sticky field controls sit directly below the responsive Policies header.
 * @param page Policy fixture page. @param field Policy field being scrolled.
 * @returns Resolves once browser layout reflects the current toolbar height.
 */
async function checkStickyHeader(page: Page, field: string): Promise<void> {
  await page.waitForFunction(field => {
    const header = document.querySelector(
      `[data-profile-field="${field}"] [data-profile-field-header]`,
    )
    const toolbar = document.querySelector('[data-profile-locale-toolbar]')
    if (!header || !toolbar) return false
    return (
      Math.abs(
        header.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom,
      ) < 1
    )
  }, field)
}

/** Check the current language badge sticks beneath its policy's translation header.
 * @param page Policy fixture page. @param field Policy field. @param locale Current language.
 * @returns Resolves when the badge follows the measured field-header height.
 */
async function checkStickyLocale(
  page: Page,
  field: string,
  locale: string,
): Promise<void> {
  await page.waitForFunction(
    ({ field, locale }) => {
      const section = document.querySelector(`[data-profile-field="${field}"]`)
      const header = section?.querySelector('[data-profile-field-header]')
      const badge = section?.querySelector(`[data-profile-locale-header="${locale}"]`)
      if (!header || !badge) return false
      return (
        Math.abs(
          badge.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
        ) < 1
      )
    },
    { field, locale },
  )
}

/** Check later languages retain the same left gutter as the Profile description.
 * @param page Policy fixture page. @param field Policy field. @param locale Translated language.
 * @returns Resolves after checking the badge and text-column geometry.
 */
async function checkLocaleGutter(
  page: Page,
  field: string,
  locale: string,
): Promise<void> {
  const section = page.locator(`[data-profile-field="${field}"]`)
  const badge = await section
    .locator(`[data-profile-locale-header="${locale}"]`)
    .boundingBox()
  const translated = await section
    .locator(`[data-profile-locale="${locale}"] [data-inline-locale-row]`)
    .boundingBox()
  const primary = await section
    .locator('[data-profile-locale="en"] [data-inline-locale-row]')
    .boundingBox()
  assert(badge && translated && primary)
  assert(
    badge.x + badge.width <= translated.x,
    'Locale badge must stay in the left gutter',
  )
  assert(
    Math.abs(translated.x - primary.x - 48) < 1,
    'Translated policies must retain the 48px indentation',
  )
}

/** Confirm filled policies explain the no-op without changing content or shifting the header.
 * @param page Policy fixture page. @param field Policy field with all languages populated.
 * @returns Resolves after mouse and keyboard activation show the shared hint.
 */
async function checkFilledHint(page: Page, field: string): Promise<void> {
  const section = page.locator(`[data-profile-field="${field}"]`)
  const source = section.getByRole('button', {
    name: 'Translate empty values from English',
    exact: true,
  })
  const state = page.locator('[data-descriptor-state]')
  const before = await state.getAttribute('data-descriptor-state')
  const hint = page.locator('[role="tooltip"][data-state="open"]').filter({
    hasText:
      'All fields have values - Clear them in the languages you want to translate to',
  })
  await source.scrollIntoViewIfNeeded()
  const header = await section.locator('[data-profile-field-header]').boundingBox()
  await source.click()
  await hint.waitFor()
  assert.equal(await state.getAttribute('data-descriptor-state'), before)
  assert.deepEqual(
    await section.locator('[data-profile-field-header]').boundingBox(),
    header,
  )
  await page.keyboard.press('Escape')
  await hint.waitFor({ state: 'hidden' })
  await source.focus()
  await source.press('Enter')
  await hint.waitFor()
  await page.keyboard.press('Escape')
  await hint.waitFor({ state: 'hidden' })
}

const directory = 'output/playwright/hub-policies'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1360, 700, 390, 320]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__hub-policies.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/descriptorProfileCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__hub-policies.html')
      await page.getByRole('button', { name: 'Hub profile', exact: true }).click()
      const multilingual = page.getByRole('button', {
        name: 'Multilingual',
        exact: true,
      })
      assert.equal(await multilingual.getAttribute('aria-expanded'), 'false')
      await multilingual.click()
      await page.getByRole('button', { name: 'Policies tab', exact: true }).click()
      assert.equal(await multilingual.getAttribute('aria-expanded'), 'true')
      const policyHeader = page.locator('[data-profile-locale-toolbar] header')
      assert.equal(
        await policyHeader
          .getByRole('button', { name: 'Multilingual', exact: true })
          .count(),
        1,
      )
      assert.equal(
        await policyHeader
          .getByRole('button', { name: 'Regenerate', exact: true })
          .count(),
        1,
      )
      const privacy = page.locator('[data-profile-field="privacyPolicy"]')
      const terms = page.locator('[data-profile-field="termsOfService"]')
      await privacy.getByRole('heading', { name: 'Privacy Policy', level: 1 }).waitFor()
      assert.equal(await privacy.locator('strong').first().textContent(), 'your data')
      assert.equal(await privacy.locator('table').count(), 1)
      const privacyBox = await privacy.boundingBox()
      const termsBox = await terms.boundingBox()
      assert(privacyBox && termsBox)
      if (width >= 768) {
        assert(Math.abs(privacyBox.y - termsBox.y) < 1, 'Policies should share a row')
        assert(
          Math.abs(privacyBox.width - termsBox.width) < 1,
          'Policy columns should have equal width',
        )
      } else
        assert(
          termsBox.y >= privacyBox.y + privacyBox.height,
          'Policies should stack on narrow screens',
        )
      await multilingual.click()
      assert.equal(
        await privacy
          .locator('[data-profile-locale="zh-Hant"]')
          .getAttribute('aria-hidden'),
        'true',
      )
      await page.getByRole('button', { name: 'Profile tab', exact: true }).click()
      assert.equal(await multilingual.getAttribute('aria-expanded'), 'false')
      await page.getByRole('button', { name: 'Policies tab', exact: true }).click()
      await multilingual.click()
      await page.getByRole('button', { name: 'Profile tab', exact: true }).click()
      assert.equal(await multilingual.getAttribute('aria-expanded'), 'true')
      await page.getByRole('button', { name: 'Policies tab', exact: true }).click()
      await page.screenshot({ path: `${directory}/${name}-${width}-policies.png` })
      await page.getByRole('button', { name: 'Toggle editing', exact: true }).click()
      await page
        .getByRole('button', { name: 'Privacy Policy · English', exact: true })
        .click()
      const editor = page.getByRole('textbox', {
        name: 'Privacy Policy · English',
        exact: true,
      })
      const original = await editor.inputValue()
      await editor.fill('# Canceled policy')
      await editor.press('Escape')
      await privacy.getByRole('heading', { name: 'Privacy Policy', level: 1 }).waitFor()
      await page
        .getByRole('button', { name: 'Privacy Policy · English', exact: true })
        .click()
      assert.equal(await editor.inputValue(), original)
      const longPolicy = `${original}\n\n${Array.from({ length: 12 }, (_, index) => `## Data handling ${index + 1}\n\nYour map information stays available according to this policy.\n\n`).join('')}`
      await editor.fill(longPolicy)
      await editor.press('Tab')
      await page
        .getByRole('button', { name: 'Terms of Service · English', exact: true })
        .click()
      const termsEditor = page.getByRole('textbox', {
        name: 'Terms of Service · English',
        exact: true,
      })
      await termsEditor.fill(longPolicy.replace('Privacy Policy', 'Terms of Service'))
      await termsEditor.press('Tab')
      await page.locator('[data-fixture-scroll]').evaluate(element => {
        element.scrollTop = 350
      })
      const toolbar = await page.locator('[data-profile-locale-toolbar]').boundingBox()
      const scroll = await page.locator('[data-fixture-scroll]').boundingBox()
      assert(toolbar && scroll)
      const heading = await policyHeader.boundingBox()
      assert(
        heading && Math.abs(heading.y - scroll.y) < 1,
        'Policies header must stay pinned to the scrollport',
      )
      assert(
        Math.abs(toolbar.y - scroll.y) < 1,
        'Multilingual toolbar should remain sticky',
      )
      await checkStickyHeader(page, 'privacyPolicy')
      // Match Profile: the primary language needs no repeated badge above its document.
      assert.equal(
        await privacy.locator('[data-profile-locale-header="en"]').count(),
        0,
      )
      if (width >= 768) {
        await checkStickyHeader(page, 'termsOfService')
        assert.equal(
          await terms.locator('[data-profile-locale-header="en"]').count(),
          0,
        )
      }
      await page.screenshot({
        path: `${directory}/${name}-${width}-sticky-controls.png`,
      })
      await multilingual.click()
      assert.equal(await multilingual.getAttribute('aria-expanded'), 'false')
      await checkStickyHeader(page, 'privacyPolicy')
      assert.equal(
        await privacy.locator('[data-profile-locale-header="en"]').count(),
        0,
      )
      await multilingual.click()
      await checkStickyHeader(page, 'privacyPolicy')
      const translate = privacy.getByRole('button', {
        name: 'Translate empty values from English',
        exact: true,
      })
      await translate.click()
      await page.waitForFunction(() => {
        const state = document
          .querySelector('[data-descriptor-state]')
          ?.getAttribute('data-descriptor-state')
        return state && JSON.parse(state).data.i18n.zhHant.privacyPolicyGen === true
      })
      await checkFilledHint(page, 'privacyPolicy')
      await checkLocaleGutter(page, 'privacyPolicy', 'zh-Hant')
      // Clearing one language makes only that policy translation eligible again.
      const translatedPrivacy = privacy.locator('[data-profile-locale="zh-Hans"]')
      await translatedPrivacy
        .getByRole('button', {
          name: 'Privacy Policy · Simplified Chinese',
          exact: true,
        })
        .hover()
      await translatedPrivacy
        .getByRole('button', {
          name: 'Clear Privacy Policy · Simplified Chinese',
          exact: true,
        })
        .click()
      await translate.click()
      await page.waitForFunction(() => {
        const state = document
          .querySelector('[data-descriptor-state]')
          ?.getAttribute('data-descriptor-state')
        return state && JSON.parse(state).data.i18n.zhHans.privacyPolicyGen === true
      })
      await checkStickyHeader(page, 'privacyPolicy')
      await page.locator('[data-fixture-scroll]').evaluate(scroll => {
        const section = scroll.querySelector('[data-profile-field="privacyPolicy"]')
        const locale = section?.querySelector('[data-profile-locale="zh-Hant"]')
        const header = section?.querySelector('[data-profile-field-header]')
        if (!locale || !header) throw new Error('Missing translated policy or header')
        scroll.scrollTop +=
          locale.getBoundingClientRect().top -
          header.getBoundingClientRect().bottom +
          100
      })
      await checkStickyLocale(page, 'privacyPolicy', 'zh-Hant')
      await checkLocaleGutter(page, 'privacyPolicy', 'zh-Hant')
      const fieldHeader = await privacy
        .locator('[data-profile-field-header]')
        .boundingBox()
      const chineseBadge = await privacy
        .locator('[data-profile-locale-header="zh-Hant"]')
        .boundingBox()
      assert(fieldHeader && chineseBadge)
      assert(
        fieldHeader.y + fieldHeader.height <= chineseBadge.y,
        'Translated language badges must stick below the field heading',
      )
      await page.screenshot({ path: `${directory}/${name}-${width}-sticky-locale.png` })
      if (width < 768) {
        // Each stacked policy owns its header; the previous one releases at its section boundary.
        await page.locator('[data-fixture-scroll]').evaluate(scroll => {
          const section = scroll.querySelector('[data-profile-field="termsOfService"]')
          const toolbar = scroll.querySelector('[data-profile-locale-toolbar]')
          if (!section || !toolbar) throw new Error('Missing policy section or toolbar')
          scroll.scrollTop +=
            section.getBoundingClientRect().top -
            scroll.getBoundingClientRect().top -
            toolbar.getBoundingClientRect().height +
            100
        })
        await checkStickyHeader(page, 'termsOfService')
        assert.equal(
          await terms.locator('[data-profile-locale-header="en"]').count(),
          0,
        )
        const privacyHeader = await privacy
          .locator('[data-profile-field-header]')
          .boundingBox()
        const termsHeader = await terms
          .locator('[data-profile-field-header]')
          .boundingBox()
        assert(privacyHeader && termsHeader)
        assert(
          privacyHeader.y + privacyHeader.height <= termsHeader.y,
          'Previous policy header must release before the next one sticks',
        )
      }
      await terms
        .getByRole('button', {
          name: 'Translate empty values from English',
          exact: true,
        })
        .click()
      await page.waitForFunction(() => {
        const state = document
          .querySelector('[data-descriptor-state]')
          ?.getAttribute('data-descriptor-state')
        return state && JSON.parse(state).data.i18n.zhHant.termsOfServiceGen === true
      })
      await checkFilledHint(page, 'termsOfService')
      await checkLocaleGutter(page, 'termsOfService', 'zh-Hant')
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        'Policy layout must not overflow the viewport',
      )
      await page.screenshot({ path: `${directory}/${name}-${width}-sticky.png` })
      assert.deepEqual(errors, [])
      await page.close()
      console.log(
        `${name} ${width}: policy markdown, sticky headings/gutter locales, filled-target hints, keyboard and clear/retranslate passed`,
      )
    }
  } finally {
    await browser.close()
  }
}
