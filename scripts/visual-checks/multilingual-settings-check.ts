import { chromium, firefox } from 'playwright'
for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [390, 900, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      await page.route('**/__multilingual-settings.html', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/multilingualSettingsCheck.ts"></script></body></html>' }))
      await page.goto('http://127.0.0.1:4173/__multilingual-settings.html')
      const org = page.getByRole('region', { name: 'Organisation', exact: true })
      const project = page.getByRole('region', { name: 'Project', exact: true })
      const content = 'Always show multilingual values for content'
      const addresses = 'Always show multilingual values for addresses'
      const beforeToggle = await org.getByRole('switch', { name: content }).boundingBox()
      await org.getByRole('switch', { name: content }).click()
      await page.waitForTimeout(220)
      const afterToggle = await org.getByRole('switch', { name: content }).boundingBox()
      if (beforeToggle?.x !== afterToggle?.x || beforeToggle?.y !== afterToggle?.y) throw new Error('Reset control moved the switch')
      if (await project.getByRole('switch', { name: content }).getAttribute('aria-checked') !== 'true') throw new Error('Project did not inherit content setting')
      await project.getByRole('switch', { name: content }).click()
      if (await project.getByRole('switch', { name: content }).getAttribute('aria-checked') !== 'false') throw new Error('Project false override failed')
      await org.getByRole('switch', { name: addresses }).click()
      if (await project.getByRole('switch', { name: addresses }).getAttribute('aria-checked') !== 'true') throw new Error('Address setting did not inherit independently')
      const layout = await org.locator('[data-language-settings-grid]').evaluate(element => [...element.children].map(child => ({ x: child.getBoundingClientRect().x, y: child.getBoundingClientRect().y })))
      if (width === 1440 ? layout[0].y !== layout[1].y || layout[0].x === layout[1].x : layout[0].x !== layout[1].x || layout[0].y === layout[1].y) throw new Error('Language cards did not wrap at the expected width')
      await page.waitForTimeout(250)
      await page.screenshot({ path: `output/playwright/${name}-${width}-multilingual-settings.png`, fullPage: true })
      await project.getByRole('button', { name: 'Reset to defaults' }).click()
      if (await project.getByRole('switch', { name: content }).getAttribute('aria-checked') !== 'true') throw new Error('Project reset failed')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Settings overflow')
      const help = page.getByRole('region', { name: 'Visibility' }).getByRole('button', { name: 'Location visibility', exact: true })
      await help.click()
      const tooltip = page.getByRole('tooltip')
      await tooltip.waitFor()
      if (await tooltip.getByRole('listitem').count() !== 2) throw new Error('Visibility help is not structured as bullets')
      await page.screenshot({ path: `output/playwright/${name}-${width}-visibility-help.png`, fullPage: true })
      await page.close()
      console.log(`${name} ${width}: independent switches, inheritance, false override and reset passed`)
    }
  } finally { await browser.close() }
}
