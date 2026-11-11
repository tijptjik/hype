// BROWSER
import { chromium, firefox } from 'playwright'
// NODE
import { mkdir } from 'node:fs/promises'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: Manual browser checks are not cached Turbo tasks.
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
await mkdir('/tmp/hype-curation-locks', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__curation-locks.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/communityCurationLocksCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__curation-locks.html`)
      const trigger = page.getByRole('button', {
        name: 'Community curation locks',
        exact: true,
      })
      await trigger.click()
      const names = page.getByRole('switch', { name: 'Names', exact: true })
      const identity = page.getByRole('switch', { name: /Identity/ })
      if (await names.isChecked()) throw new Error('Open field shown as locked')
      const layout = await page.getByRole('dialog').evaluate(dialog => {
        const sections = [...dialog.querySelectorAll('section')]
        const boxes = sections.map(section => section.getBoundingClientRect().toJSON())
        const category = sections[0]
          .querySelector('[role="switch"]')!
          .getBoundingClientRect()
        const field = sections[0]
          .querySelectorAll('[role="switch"]')[1]
          .getBoundingClientRect()
        const heading = document
          .getElementById(dialog.getAttribute('aria-labelledby')!)!
          .getBoundingClientRect()
        const lock = dialog
          .querySelector('[aria-label="Lock all community fields"]')!
          .getBoundingClientRect()
        return {
          boxes,
          categoryHeight: category.height,
          fieldHeight: field.height,
          headerHeight: dialog.firstElementChild!.getBoundingClientRect().height,
          alignedHeader:
            Math.abs(heading.y + heading.height / 2 - lock.y - lock.height / 2) < 2,
          inlineCounts: sections.every(section => {
            const label = section.querySelector('label')!
            const [title, count] = [...label.querySelectorAll(':scope > span')].map(
              element => element.getBoundingClientRect(),
            )
            return Math.abs(title.y + title.height / 2 - count.y - count.height / 2) < 2
          }),
        }
      })
      if (
        !(layout.fieldHeight < layout.categoryHeight) ||
        !layout.alignedHeader ||
        !layout.inlineCounts ||
        layout.headerHeight > 80
      )
        throw new Error('Compact header, inline counts or switch sizes regressed')
      if (
        width >= 768 &&
        (layout.boxes[0].x !== layout.boxes[1].x ||
          layout.boxes[2].x <= layout.boxes[0].x ||
          layout.boxes[1].y <= layout.boxes[0].y)
      )
        throw new Error('Address is not below Identity in the left column')
      if (width < 768 && layout.boxes.some(box => box.x !== layout.boxes[0].x))
        throw new Error('Mobile categories are not in one column')

      if (await page.getByRole('switch', { name: /Branch ID/ }).count())
        throw new Error('Internal identifier exposed')
      await identity.check()
      for (const label of [
        'Names',
        'Brand names',
        'Brand link',
        'Group link',
        'Branch',
        'Format',
        'Classification',
        'Operating status',
        'Building status',
      ])
        if (!(await page.getByRole('switch', { name: label, exact: true }).isChecked()))
          throw new Error(`Identity did not lock ${label}`)
      await names.uncheck()
      if (await identity.isChecked())
        throw new Error('Partial category shown fully locked')
      await page.getByRole('switch', { name: /Address.*locked/ }).check()
      if (
        await page
          .getByRole('switch', { name: 'Map position', exact: true })
          .isChecked()
      )
        throw new Error('Address changed marker lock')
      const all = page.getByRole('button', { name: 'Lock all community fields' })
      await all.click()
      if ((await all.getAttribute('aria-pressed')) !== 'true')
        throw new Error('Master lock did not lock all')
      await all.click()
      if (await names.isChecked()) throw new Error('Master unlock failed')
      await names.check()
      await page
        .getByRole('switch', { name: 'Address, floor and unit', exact: true })
        .check()
      await page.getByRole('dialog').evaluate(async element => {
        await new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        )
        await Promise.all(
          element.getAnimations({ subtree: true }).map(animation => animation.finished),
        )
      })
      const thumbOffset = await page
        .getByRole('switch', { name: 'Address, floor and unit', exact: true })
        .evaluate(element =>
          parseFloat(
            getComputedStyle(element.querySelector('[data-switch-thumb]')!).translate,
          ),
        )
      if (!(thumbOffset > 0))
        throw new Error('Locked switch thumb is not in the on position')
      await page
        .getByRole('dialog')
        .locator('[aria-busy]')
        .evaluate(element => {
          element.scrollTop = 0
        })
      await page.screenshot({
        animations: 'disabled',
        path: `/tmp/hype-curation-locks/${name}-${width}.png`,
      })
      await page.getByRole('button', { name: 'Save locks', exact: true }).click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      if ((await trigger.textContent())?.trim() !== '2/17')
        throw new Error('Partial toolbar count incorrect')
      if ((await trigger.getAttribute('title')) !== '2/17 community fields locked')
        throw new Error('Toolbar lock status incorrect')
      const saved = JSON.parse(
        (await page.locator('[data-lock-state]').textContent()) ?? '{}',
      )
      if (
        saved.fields.names !== false ||
        saved.fields['location.address'] !== false ||
        saved.saves !== 1 ||
        'branchId' in saved.fields
      )
        throw new Error('Lock controls persisted incorrectly')
      await trigger.click()
      if (!(await names.isChecked())) throw new Error('Saved lock not retained')
      await names.uncheck()
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.getByLabel('Simulate concurrent change').check()
      await trigger.click()
      await names.uncheck()
      await page.getByRole('button', { name: 'Save locks', exact: true }).click()
      await page.getByRole('alert').waitFor()
      if (
        JSON.parse((await page.locator('[data-lock-state]').textContent()) ?? '{}')
          .saves !== 1
      )
        throw new Error('Stale edit overwrote controls')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.getByLabel('SuperAdmin', { exact: true }).uncheck()
      if (await trigger.count())
        throw new Error('Non-SuperAdmin sees administrative control')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error('Horizontal overflow')
      if (errors.length) throw new Error(errors.join('\n'))
      console.log(
        `${name} ${width}: lock/unlock, cancel, stale failure, role visibility and layout passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
