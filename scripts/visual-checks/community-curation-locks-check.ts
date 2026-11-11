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
      const names = page.getByRole('checkbox', {
        name: 'Names open to community changes',
        exact: true,
      })
      if (
        (await trigger.getAttribute('title')) !== 'Community curation fields are open'
      )
        throw new Error('Default community state is not open')
      if (!(await names.isChecked())) throw new Error('Names are not open by default')
      await names.uncheck()
      await page
        .getByRole('checkbox', {
          name: 'Address, floor and unit open to community changes',
          exact: true,
        })
        .uncheck()
      if (
        !(await page
          .getByRole('checkbox', {
            name: 'Map position open to community changes',
            exact: true,
          })
          .isChecked())
      )
        throw new Error('Address lock changed marker control')
      await page.screenshot({ path: `/tmp/hype-curation-locks/${name}-${width}.png` })
      await page.getByRole('button', { name: 'Save locks', exact: true }).click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      if (
        (await trigger.getAttribute('title')) !==
        'Some community curation fields are locked'
      )
        throw new Error('Trigger did not reflect saved locks')
      const saved = JSON.parse(
        (await page.locator('[data-lock-state]').textContent()) ?? '{}',
      )
      if (
        saved.fields.names !== false ||
        saved.fields['location.address'] !== false ||
        saved.saves !== 1
      )
        throw new Error('Boolean controls were not persisted')
      await trigger.click()
      if (await names.isChecked()) throw new Error('Saved lock was not retained')
      await names.check()
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.getByLabel('Simulate concurrent change').check()
      await trigger.click()
      await names.check()
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
