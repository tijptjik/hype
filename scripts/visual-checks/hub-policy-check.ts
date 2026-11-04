// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox, type Page } from 'playwright'

/** Check the sticky field controls sit directly below the responsive multilingual bar.
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
      assert(
        Math.abs(toolbar.y - scroll.y) < 1,
        'Multilingual toolbar should remain sticky',
      )
      await checkStickyHeader(page, 'privacyPolicy')
      await checkStickyLocale(page, 'privacyPolicy', 'en')
      if (width >= 768) {
        await checkStickyHeader(page, 'termsOfService')
        await checkStickyLocale(page, 'termsOfService', 'en')
      }
      await page.screenshot({
        path: `${directory}/${name}-${width}-sticky-controls.png`,
      })
      await multilingual.click()
      assert.equal(await multilingual.getAttribute('aria-expanded'), 'false')
      await checkStickyHeader(page, 'privacyPolicy')
      await checkStickyLocale(page, 'privacyPolicy', 'en')
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
      const englishBadge = await privacy
        .locator('[data-profile-locale-header="en"]')
        .boundingBox()
      const chineseBadge = await privacy
        .locator('[data-profile-locale-header="zh-Hant"]')
        .boundingBox()
      assert(englishBadge && chineseBadge)
      assert(
        englishBadge.y + englishBadge.height <= chineseBadge.y,
        'Previous locale badge must release before the next language sticks',
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
        await checkStickyLocale(page, 'termsOfService', 'en')
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
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        'Policy layout must not overflow the viewport',
      )
      await page.screenshot({ path: `${directory}/${name}-${width}-sticky.png` })
      assert.deepEqual(errors, [])
      await page.close()
      console.log(
        `${name} ${width}: policy columns, markdown, shared multilingual state, editing and sticky headings/locales passed`,
      )
    }
  } finally {
    await browser.close()
  }
}
