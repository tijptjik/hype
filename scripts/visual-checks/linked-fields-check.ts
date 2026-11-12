import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
const origin = process.argv[2] ?? 'http://127.0.0.1:4175'
await mkdir('/tmp/hype-linked-fields', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__linked-fields.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/linkedFieldsCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__linked-fields.html`)
      const toggle = page.getByRole('button', { name: 'Linked sections', exact: true })
      await toggle.waitFor()
      if (await page.locator('[data-linked-field]').count())
        throw new Error('Controls visible outside editing mode')
      await page.getByRole('heading', { name: 'Communications', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Add website', exact: true }).click()
      await page
        .getByRole('textbox', { name: 'Websites 1', exact: true })
        .fill('https://example.com')
      await page.getByRole('button', { name: 'Reset brands', exact: true }).click()
      if (
        JSON.parse((await page.locator('[data-brand-edit]').textContent()) ?? '{}')
          .choice?.mode !== 'inherit'
      )
        throw new Error('Brand reset did not stage inheritance')
      await page
        .getByRole('heading', { name: 'Mobility access', exact: true })
        .waitFor()
      if (
        await page
          .getByRole('button', { name: 'Save shared accessibility', exact: true })
          .count()
      )
        throw new Error('Mobility still saves separately')
      const stepFree = page.locator('button[aria-label="Step-free entrance"]').last()
      await stepFree.click()
      await page.getByRole('option', { name: 'Yes', exact: true }).click()
      if (
        JSON.parse((await page.locator('[data-profile-values]').textContent()) ?? '{}')
          .mobility?.stepFreeEntrance !== 'yes'
      )
        throw new Error('Mobility did not stage in the parent form')
      await toggle.click()
      const communications = page.locator('[data-linked-field="phoneNumber"]')
      if ((await communications.getAttribute('data-linked-mode')) !== 'mixed')
        throw new Error('Legacy mixed section is not identified')
      if (
        await page
          .locator('[data-linked-field="websites"], [data-linked-field="socials"]')
          .count()
      )
        throw new Error('Individual contact controls remain')
      await communications.click()
      const internalModes = JSON.parse(
        (await page.locator('[data-modes]').textContent()) ?? '{}',
      )
      if (
        ['phoneNumber', 'websites', 'socials'].some(
          field => internalModes[field] !== 'internal',
        )
      )
        throw new Error('Communications did not switch together')
      await communications.click()
      const communityModes = JSON.parse(
        (await page.locator('[data-modes]').textContent()) ?? '{}',
      )
      if (
        ['phoneNumber', 'websites', 'socials'].some(
          field => communityModes[field] !== 'community',
        )
      )
        throw new Error('Communications did not rejoin together')
      const names = page.locator('[data-linked-field="names"]')
      await names.click()
      if ((await names.getAttribute('data-linked-mode')) !== 'internal')
        throw new Error('Name assignment did not change')
      if (!(await names.getAttribute('aria-label'))?.includes('not a privacy setting'))
        throw new Error('Internal meaning missing')
      await page.getByRole('button', { name: 'Internal', exact: true }).click()
      if (await page.locator('[data-draft-location-name]').isVisible())
        throw new Error('Internal names not filtered')
      if (
        !(await page
          .locator('[data-address-group="buildingNumberExpression"]')
          .isVisible())
      )
        throw new Error('Community address filtered')
      await page.getByRole('button', { name: 'Internal', exact: true }).click()
      await page.getByRole('button', { name: 'Community', exact: true }).click()
      if (
        await page
          .locator('[data-address-group="buildingNumberExpression"]')
          .isVisible()
      )
        throw new Error('Community address not filtered')
      await toggle.click()
      if (
        !(await page
          .locator('[data-address-group="buildingNumberExpression"]')
          .isVisible())
      )
        throw new Error('Mode exit did not restore address')
      if (
        !(await page.locator('[data-draft-location-name]').textContent())?.includes(
          'Sample establishment',
        )
      )
        throw new Error('Filtering lost input')
      await toggle.click()
      await page.getByRole('button', { name: 'Community', exact: true }).click()
      await page.getByRole('button', { name: 'Toggle manual', exact: true }).click()
      if (!(await names.isDisabled())) throw new Error('Manual Location can contribute')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error('Horizontal overflow')
      await page.screenshot({
        path: `/tmp/hype-linked-fields/${name}-${width}.png`,
        fullPage: true,
      })
      if (errors.length) throw new Error(errors.join('\n'))
      console.log(
        `${name} ${width}: mode, assignment, independent filters, draft retention, manual guard and layout passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
