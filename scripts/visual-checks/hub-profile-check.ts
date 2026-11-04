// NODE
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const directory = 'output/playwright/hub-profile-followup'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1360, 390, 320]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__descriptor-profile.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/descriptorProfileCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__descriptor-profile.html')
      await page.getByRole('button', { name: 'Hub profile', exact: true }).click()
      await page.getByRole('button', { name: 'Toggle editing', exact: true }).click()
      await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
      await page.locator('[data-locale="zh-Hant"]').waitFor()
      if (width > 768) {
        const fullName = await page.locator('[data-profile-field="name"]').boundingBox()
        const shortName = await page
          .locator('[data-profile-field="nameShort"]')
          .boundingBox()
        const description = await page
          .locator('[data-profile-field="description"]')
          .boundingBox()
        if (
          Math.abs(fullName!.x - shortName!.x) > 1 ||
          shortName!.y < fullName!.y + fullName!.height
        )
          throw new Error('Profile names are not stacked')
        const ratio = description!.width / fullName!.width
        if (ratio < 1.9 || ratio > 2.2)
          throw new Error(`Unexpected profile column ratio ${ratio}`)
      }
      const sharing = page
        .getByRole('combobox', { name: 'Map sharing', exact: true })
        .first()
      await sharing.click()
      await page.getByRole('option', { name: 'Hub Exclusive', exact: true }).click()
      await page.waitForFunction(
        () =>
          JSON.parse(
            document
              .querySelector('[data-descriptor-state]')!
              .getAttribute('data-descriptor-state')!,
          ).selections[0].isHubExclusive === true,
      )
      await sharing.click()
      await page.getByRole('option', { name: 'List on HYPE.hk', exact: true }).click()
      const coreInclusion = page
        .getByRole('combobox', { name: 'HYPE.hk listing', exact: true })
        .first()
      await coreInclusion.click()
      await page
        .getByRole('option', { name: 'Exclude in HYPE.hk', exact: true })
        .click()
      await page.waitForFunction(
        () =>
          JSON.parse(
            document
              .querySelector('[data-descriptor-state]')!
              .getAttribute('data-descriptor-state')!,
          ).selections[0].isCoreInclusive === false,
      )
      await coreInclusion.click()
      await page
        .getByRole('option', { name: 'Include in HYPE.hk', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'About map sharing', exact: true })
        .first()
        .click()
      await page
        .getByRole('tooltip')
        .getByText('Hub Exclusive', { exact: true })
        .waitFor()
      await page.keyboard.press('Escape')
      await page.mouse.move(0, 0)
      await page.getByRole('tooltip').waitFor({ state: 'hidden' })
      await page
        .locator('.bits-form__parent-resource')
        .screenshot({ path: `${directory}/${name}-${width}-organisation-policies.png` })
      const search = page.getByPlaceholder('Search organisations...')
      if (!(await search.evaluate(element => Boolean(element.closest('header')))))
        throw new Error('Search is outside the header')
      const remove = page.getByRole('button', {
        name: 'Remove organisation',
        exact: true,
      })
      await remove.first().click()
      if ((await remove.count()) !== 1) throw new Error('Direct removal failed')
      await search.fill('new')
      await page.getByText('New partner', { exact: true }).click()
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.bits-form__parent-resource-list article')
            .length === 2,
      )
      if (await page.locator('.bits-card__body [data-tooltip]').count())
        throw new Error('Organisation name/code tooltip remains')
      const routing = page.locator('[data-inline-field="Subdomain"]')
      if (await routing.locator('.bits-form__gen-ai').count())
        throw new Error('Routing has a verification control')
      await routing.getByRole('button', { name: 'Subdomain', exact: true }).click()
      const input = routing.getByRole('textbox', { name: 'Subdomain', exact: true })
      await input.fill('temporary')
      await input.press('Escape')
      if (
        (await routing
          .getByRole('button', { name: 'Subdomain', exact: true })
          .innerText()) !== 'breadline'
      )
        throw new Error('Routing cancellation failed')
      const scroller = page.locator('[data-fixture-scroll]')
      await scroller.evaluate(element => {
        element.scrollTop = 0
      })
      await page.screenshot({
        path: `${directory}/${name}-${width}-profile.png`,
        fullPage: true,
      })
      await scroller.evaluate(element => {
        element.scrollTop = element.scrollHeight - element.clientHeight
      })
      await page.waitForFunction(() => {
        const bar = document
          .querySelector('[data-profile-locale-toolbar]')!
          .getBoundingClientRect()
        const scroll = document
          .querySelector('[data-fixture-scroll]')!
          .getBoundingClientRect()
        return Math.abs(bar.top - scroll.top) < 1
      })
      const chip = page.locator('[data-locale="zh-Hant"]')
      if (!(await chip.isVisible()))
        throw new Error('Sticky locale controls disappeared')
      await chip.click()
      await page.waitForFunction(
        () =>
          document
            .querySelector(
              '[data-profile-field="subscriptionBenefits"] [data-profile-locale="zh-Hant"]',
            )
            ?.getAttribute('aria-hidden') === 'true',
      )
      await chip.click()
      const benefits = page.locator('[data-profile-field="subscriptionBenefits"]')
      await benefits
        .getByRole('button', {
          name: 'Translate empty values from English',
          exact: true,
        })
        .click()
      await page.waitForFunction(
        () =>
          JSON.parse(
            document
              .querySelector('[data-descriptor-state]')!
              .getAttribute('data-descriptor-state')!,
          ).data.i18n.ja.subscriptionBenefitsGen === true,
      )
      await scroller.evaluate(element => {
        element.scrollTop = element.scrollHeight - element.clientHeight
      })
      if (width > 768) {
        const configuration = await page
          .locator('[data-subscription-configuration]')
          .boundingBox()
        const translated = await page
          .locator('[data-subscription-benefits]')
          .boundingBox()
        const placement = await page
          .locator('[data-subscription-placement-column]')
          .boundingBox()
        if (
          Math.abs(translated!.width - configuration!.width) > 1 ||
          Math.abs(placement!.width - configuration!.width) > 1
        )
          throw new Error('Subscription columns are not equal width')
      }
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth > innerWidth,
        section:
          document.querySelector('[data-fixture-scroll]')!.scrollWidth >
          document.querySelector('[data-fixture-scroll]')!.clientWidth,
      }))
      if (overflow.page || overflow.section)
        throw new Error(`Horizontal overflow: ${JSON.stringify(overflow)}`)
      await page.screenshot({
        path: `${directory}/${name}-${width}-subscription.png`,
        fullPage: true,
      })
      if (errors.length) throw new Error(errors.join('; '))
      console.log(
        `${name} ${width}px: sticky locales, translation, routing, add/remove and overflow passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
