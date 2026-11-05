// NODE
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const directory = 'output/playwright/user-access'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const theme of ['breadline-light', 'hype-dark']) {
      for (const width of [320, 390, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 1100 } })
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.route('**/__user-access.html', route =>
          route.fulfill({
            contentType: 'text/html',
            body: `<html lang="en" data-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/userAccessCheck.ts"></script></body></html>`,
          }),
        )
        await page.goto('http://127.0.0.1:4173/__user-access.html')
        await page
          .getByText('Roles and capabilities', { exact: true })
          .waitFor({ timeout: 10000 })
          .catch(async error => {
            console.log(
              JSON.stringify({
                errors,
                body: await page.locator('body').textContent(),
              }),
            )
            throw error
          })
        await page
          .getByText('No direct assignments visible in your scope.', { exact: true })
          .waitFor()
        await page.getByText('-', { exact: true }).waitFor()
        await page.getByText('Not currently assignable', { exact: true }).waitFor()
        const hubPermissions = page
          .getByRole('region', { name: 'Hubs', exact: true })
          .getByRole('definition')
        if ((await hubPermissions.getByText('Create', { exact: true }).count()) !== 2)
          throw new Error(
            'Hub and organization creation must have separate resource groups',
          )
        await page
          .getByRole('button', { name: 'About inherited access', exact: true })
          .click()
        await page
          .getByText(
            'Inherited access and implicit public access do not create additional assignments below.',
            { exact: false },
          )
          .waitFor()
        await page.keyboard.press('Escape')
        await page.mouse.move(0, 0)
        await page.getByRole('tooltip').waitFor({ state: 'hidden' })
        const link = page.getByRole('link', {
          name: 'Community food redistribution and neighborhood volunteer coordination',
          exact: true,
        })
        if ((await link.getAttribute('href')) !== '/admin/projects/sample')
          throw new Error('Wrong resource link')
        if (
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
        )
          throw new Error(`${name} ${width}: horizontal overflow`)
        if (errors.length) throw new Error(errors.join('\n'))
        await page.screenshot({
          path: `${directory}/${theme}-${name}-${width}.png`,
          fullPage: true,
        })
        console.log(`${theme} ${name} ${width}: passed`)
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
}
