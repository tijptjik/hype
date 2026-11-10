// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// NODE
import { mkdir } from 'node:fs/promises'
const origin = process.argv[2] ?? 'http://127.0.0.1:4173'
await mkdir('output/playwright/location-taxonomy', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__location-taxonomy.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="hype-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/locationTaxonomyCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__location-taxonomy.html`)
    const output = page.locator('[data-taxonomy]')
    await output.waitFor()
    if (
      (await output.textContent()) !== '{"kind":"operational","class":"establishment"}'
    )
      throw new Error('Incorrect initial operational taxonomy')
    await page.getByRole('combobox').nth(1).click()
    const options = await page.getByRole('option').allTextContents()
    if (
      options.length !== 2 ||
      !options.some(option => option.includes('Establishment'))
    )
      throw new Error(`Unsupported operational choices: ${options}`)
    await page.keyboard.press('Escape')
    for (const [family, label, kind, category] of [
      ['Built place', 'Building part', 'built', 'building_part'],
      ['Built place', 'Thoroughfare', 'built', 'thoroughfare'],
      ['Geographic feature', 'Water feature', 'geographic', 'water_feature'],
      ['Operational', 'Establishment', 'operational', 'establishment'],
      ['Operational', 'Service point', 'operational', 'service_point'],
      ['Address', 'Premises', 'address', 'premises_address'],
      ['Address', 'Cadastral', 'address', 'cadastral_address'],
      ['Address', 'Linear reference', 'address', 'linear_reference'],
    ]) {
      await page.getByRole('combobox').first().click()
      await page.getByRole('option', { name: family, exact: true }).click()
      await page.getByRole('combobox').nth(1).click()
      await page.getByRole('option', { name: label, exact: true }).click()
      if ((await output.textContent()) !== JSON.stringify({ kind, class: category }))
        throw new Error(`Selection failed: ${family}/${label}`)
    }
    await page.screenshot({
      path: `output/playwright/location-taxonomy/${name}-mobile.png`,
    })
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error('Mobile overflow')
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: 'Address', exact: true }).click()
    if ((await page.getByRole('combobox').count()) !== 2)
      throw new Error('Address class selector is missing')
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(
      JSON.stringify({
        browser: name,
        canonicalSelections: true,
        operationalClasses: options.length,
        mobileOverflow: false,
      }),
    )
  } finally {
    await browser.close()
  }
}
