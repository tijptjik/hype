import { chromium, firefox } from 'playwright'
for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [320, 390, 900, 1440]) {
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
      const switchCard = org.locator('[data-language-settings-grid] > div').last()
      const originalSwitchHeight = (await switchCard.boundingBox())!.height
      for (const language of ['Japanese', 'Portuguese', 'German', 'French', 'Italian', 'Punjabi', 'Burmese', 'Khmer', 'Lao']) {
        await org.getByRole('button', { name: '+ Add language' }).click()
        await page.getByRole('combobox', { name: 'Search languages' }).fill(language)
        await page.getByRole('combobox', { name: 'Search languages' }).press('Enter')
      }
      await page.evaluate(() => document.fonts.ready)
      if (Math.abs((await switchCard.boundingBox())!.height - originalSwitchHeight) > 1) throw new Error('Switch card stretched with languages')
      for (const [tag, family, text] of [['pa', 'Gurmukhi', 'ਪੰਜਾਬੀ'], ['my', 'Myanmar', 'မြန်မာဘာသာ'], ['km', 'Khmer', 'ភាសាខ្មែរ'], ['lo', 'Lao', 'ລາວ']]) {
        const font = await org.locator(`[data-locale="${tag}"] [lang]`).evaluate(element => getComputedStyle(element).fontFamily)
        if (!font.includes(family) || !await page.evaluate(({ family, text }) => document.fonts.check(`16px "Noto Sans ${family}"`, text), { family, text })) throw new Error(`Missing chip font for ${tag}`)
      }
      const layout = await org.locator('[data-language-settings-grid]').evaluate(element => [...element.children].map(child => ({ x: child.getBoundingClientRect().x, y: child.getBoundingClientRect().y })))
      if (width === 1440 ? layout[0].y !== layout[1].y || layout[0].x === layout[1].x : layout[0].x !== layout[1].x || layout[0].y === layout[1].y) throw new Error('Language cards did not wrap at the expected width')
      await page.waitForTimeout(250)
      await page.screenshot({ path: `output/playwright/${name}-${width}-multilingual-settings.png`, fullPage: true })
      await project.getByRole('button', { name: 'Reset to defaults' }).click()
      if (await project.getByRole('switch', { name: content }).getAttribute('aria-checked') !== 'true') throw new Error('Project reset failed')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Settings overflow')
      const help = page.getByRole('region', { name: 'Visibility' }).getByRole('button', { name: 'Location visibility', exact: true })
      // Place the anchor at the viewport corner to exercise collision padding directly.
      await help.evaluate(element => { element.style.position = 'fixed'; element.style.top = '0'; element.style.right = '0' })
      await help.click()
      const tooltip = page.getByRole('tooltip')
      await tooltip.waitFor()
      if (await tooltip.getByRole('listitem').count() !== 2) throw new Error('Visibility help is not structured as bullets')
      const fills: string[] = []
      for (const theme of ['breadline-light', 'breadline-dark']) {
        await page.locator('html').evaluate((element, theme) => element.setAttribute('data-theme', theme), theme)
        await page.waitForTimeout(200)
        const box = await tooltip.boundingBox()
        if (!box || box.x < 15 || box.y < 15 || box.x + box.width > width - 15 || box.y + box.height > 985) throw new Error('Tooltip violates viewport inset')
        fills.push(await tooltip.evaluate(element => getComputedStyle(element).backgroundColor))
        await page.screenshot({ path: `output/playwright/${name}-${width}-${theme}-visibility-help.png` })
      }
      if (fills[0] === fills[1]) throw new Error('Tooltip did not follow theme')
      await page.close()
      console.log(`${name} ${width}: independent switches, inheritance, false override and reset passed`)
    }
  } finally { await browser.close() }
}
