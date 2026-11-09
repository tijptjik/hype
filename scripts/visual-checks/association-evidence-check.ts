import { chromium, firefox } from 'playwright'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/src/lib/api/division.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export function getAddressDivisionLabel(){return {current:null}}',
      }),
    )
    await page.route('**/__association-evidence.html*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="hype-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/associationEvidenceCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__association-evidence.html', {
      waitUntil: 'domcontentloaded',
    })
    await page.locator('[data-match-strength="70"]').waitFor()
    if (await page.getByRole('button', { name: 'Cancel', exact: true }).count())
      throw Error('Cancel remains')
    const separator = page.getByRole('separator', { name: 'Resize map' })
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('[role="separator"]')?.getAttribute('aria-valuenow'),
        ) > 250,
    )
    await page.locator('[data-association-proposal]').waitFor()
    if (await page.getByRole('button', { name: 'Edit Details', exact: true }).count())
      throw Error('Proposal offers address editing')
    await page.getByRole('button', { name: 'Use', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Change selection', exact: true }).waitFor()
    await page.screenshot({
      path: 'output/playwright/proposal-' + name + '-wide.png',
      animations: 'disabled',
    })
    const proposalHeight = Number(await separator.getAttribute('aria-valuenow'))
    await page.getByRole('button', { name: 'Change selection', exact: true }).click()
    await page.locator('[data-association-results]').waitFor()
    await page.waitForFunction(
      before =>
        Number(
          document.querySelector('[role="separator"]')?.getAttribute('aria-valuenow'),
        ) !== before,
      proposalHeight,
    )
    await page.locator('[data-association-result="theatre-building"]').click()
    await page.locator('[data-association-proposal]').waitFor()
    // A manual resize must remain authoritative while the content is unchanged.
    await separator.focus()
    await separator.press('Home')
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('[role="separator"]')?.getAttribute('aria-valuenow'),
        ) === 128,
    )
    await page.screenshot({
      path: 'output/playwright/proposal-' + name + '-manual.png',
      animations: 'disabled',
    })
    if ((await separator.getAttribute('aria-valuenow')) !== '128')
      throw Error('Manual height overwritten')

    await page.getByRole('radio', { name: 'Establishment', exact: true }).click()
    await page.locator('[data-association-result="theatre-place"]').click()
    await page.locator('[data-association-record-headers]').waitFor()
    await page.screenshot({ path: 'output/playwright/evidence-' + name + '-wide.png' })
    for (const width of [1100, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.getByRole('button', { name: 'Edit Details', exact: true }).click()
      await page.locator('[data-address-group="unit"]').first().waitFor()
      await page.screenshot({
        path: 'output/playwright/evidence-' + name + '-' + width + '-expanded.png',
        animations: 'disabled',
      })
      await page
        .getByRole('button', { name: 'Hide additional address details', exact: true })
        .click()
      await page
        .locator('[data-address-group="unit"]')
        .first()
        .waitFor({ state: 'detached' })
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('Horizontal overflow at ' + width)
      await page.screenshot({
        path: 'output/playwright/evidence-' + name + '-' + width + '.png',
      })
    }
    if (errors.length) throw Error(errors.join('\n'))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-association-proposal]').waitFor()
    await page.getByRole('button', { name: 'Use', exact: true }).waitFor()
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw Error('Proposal overflows')
    await page.screenshot({
      path: 'output/playwright/proposal-' + name + '-390.png',
      animations: 'disabled',
    })
    await page.goto(
      'http://127.0.0.1:4173/__association-evidence.html?establishment=1',
      { waitUntil: 'domcontentloaded' },
    )
    await page.locator('[data-association-proposal]').waitFor()
    const nameButton = page.getByRole('button', {
      name: 'Establishment name',
      exact: true,
    })
    if (!(await nameButton.locator('svg').count())) throw Error('Missing inline pencil')
    await page.screenshot({
      path: 'output/playwright/proposal-' + name + '-establishment.png',
      animations: 'disabled',
    })
    await nameButton.click()
    await page
      .getByRole('textbox', { name: 'Establishment name', exact: true })
      .fill('Storybook Theatre')
    await page.getByRole('button', { name: 'Use', exact: true }).click()
    const accepted = JSON.parse(
      (await page.locator('[data-accepted]').getAttribute('data-accepted'))!,
    )
    if (
      accepted.names.en !== 'Storybook Theatre' ||
      accepted.source.ssId !== 'theatre-place'
    )
      throw Error('Proposal acceptance lost name or identity')
    await page.goto('http://127.0.0.1:4173/__association-evidence.html?long=1', {
      waitUntil: 'domcontentloaded',
    })
    await page.getByRole('radio', { name: 'Establishment', exact: true }).click()
    await page.locator('[data-association-result="theatre-place"]').click()
    const card = page.locator('[data-association-name]')
    const beforeName = (await card.boundingBox())!.height
    await page.getByRole('button', { name: 'Establishment name', exact: true }).click()
    const textarea = page.getByRole('textbox', {
      name: 'Establishment name',
      exact: true,
    })
    if ((await textarea.evaluate(el => el.tagName)) !== 'TEXTAREA')
      throw Error('Name is not multiline')
    const afterName = (await card.boundingBox())!.height
    if (Math.abs(afterName - beforeName) > 2)
      throw Error('Name card changed height: ' + beforeName + ' -> ' + afterName)
    if (
      await page
        .getByRole('button', { name: 'Reset Establishment name', exact: true })
        .count()
    )
      throw Error('Reset appears before changes')
    await textarea.fill('Joyful World International Nursery & Kindergarten Updated')
    await page
      .getByRole('button', { name: 'Reset Establishment name', exact: true })
      .waitFor()
    await textarea.fill('Joyful World International Nursery & Kindergarten')
    if (
      await page
        .getByRole('button', { name: 'Reset Establishment name', exact: true })
        .count()
    )
      throw Error('Reset remains after restoring source')
    await textarea.press('Escape')
    const number = page.locator(
      '[data-address-group="number"][data-address-choice="location"]',
    )
    const beforeNumber = (await number.boundingBox())!.height
    await number.getByRole('button').click()
    const afterNumber = (await number.boundingBox())!.height
    if (Math.abs(afterNumber - beforeNumber) > 2)
      throw Error('Number block changed height: ' + beforeNumber + ' -> ' + afterNumber)
    const title = page.getByRole('heading', {
      name: 'Choose the address details to keep',
      exact: true,
    })
    await title.scrollIntoViewIfNeeded()
    const languages = page.getByRole('button', { name: 'Multilingual', exact: true })
    const titleBox = (await title.boundingBox())!,
      languagesBox = (await languages.boundingBox())!
    if (
      Math.abs(
        titleBox.y + titleBox.height / 2 - languagesBox.y - languagesBox.height / 2,
      ) > 2
    )
      throw Error('Multilingual is not on the heading row')
    const fixedArrow = page.getByLabel('Use candidate location', { exact: true })
    if ((await fixedArrow.evaluate(el => el.tagName)) === 'BUTTON')
      throw Error('Identity arrow is interactive')
    await page.screenshot({
      path: 'output/playwright/comparison-' + name + '-editing.png',
      animations: 'disabled',
    })
    if (errors.length) throw Error(errors.join('\n'))
    console.log(
      name +
        ': map grows from 128px, manual sizing retained, proposal actions/metadata, 70-point gauge, comparison transitions, no overflow at 1100/390px',
    )
  } finally {
    await browser.close()
  }
}
