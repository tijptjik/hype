// NODE
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const directory = 'output/playwright/organisation-permissions'
await mkdir(directory, { recursive: true })
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://localhost:5175'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__organisation-permissions.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/organisationPermissionsCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__organisation-permissions.html`)
      const control = page.getByRole('switch', {
        name: 'Permit to edit user details',
        exact: true,
      })
      await control.waitFor()
      if (await control.isChecked())
        throw new Error('Permission did not default to off')
      await control.click()
      if (!(await control.isChecked()))
        throw new Error('SuperAdmin could not toggle the permission')
      await page.getByRole('button', { name: 'Switch actor', exact: true }).click()
      if (!(await control.isDisabled()))
        throw new Error('Ordinary owner could change the permission')
      await page.screenshot({ path: `${directory}/${name}-${width}-owner.png` })
      await page.getByRole('button', { name: 'Switch actor', exact: true }).click()
      await page.getByRole('button', { name: 'Reset', exact: true }).click()
      if (await control.isChecked())
        throw new Error('Reset did not restore default-off state')
      await page.getByRole('button', { name: 'Toggle editing', exact: true }).click()
      if (!(await control.isDisabled())) throw new Error('View mode allowed editing')
      await page.getByRole('button', { name: 'Toggle editing', exact: true }).click()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
      if (overflow) throw new Error(`Horizontal overflow at ${width}px`)
      if (errors.length) throw new Error(errors.join('\n'))
      await page.screenshot({ path: `${directory}/${name}-${width}-superadmin.png` })
      console.log(
        `${name} ${width}px: default off, grant, owner restriction, reset and view mode passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
