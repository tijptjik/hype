import { test, expect } from '@playwright/test'
import { join } from 'node:path'

for (const width of [1440, 390]) {
  test(`HKGeocode selection follows the Feature marker at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin')
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    await expect(page).toHaveURL(/\/admin/)
    const externalConversions = []
    page.on('request', request => {
      if (/geodetic\.gov\.hk/.test(request.url()))
        externalConversions.push(request.url())
    })
    await page.route('**/__hkgcode-display.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/hkgcodeDisplayCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('/__hkgcode-display.html')
    await page
      .getByRole('button', { name: 'Display location using: Automatic', exact: true })
      .click()
    await page.getByRole('menuitemradio', { name: /^HKGeocode/ }).click()
    await expect(page.getByLabel('Saved display mode')).toHaveText('hkgcode')
    await expect(page.locator('textarea')).toHaveValue('K8FA3B')
    await page.getByRole('button', { name: 'Move to Central' }).click()
    await expect(page.locator('textarea')).toHaveValue('H74J3J')
    await page
      .getByRole('button', { name: 'Display location using: HKGeocode', exact: true })
      .click()
    await expect(
      page.getByRole('menuitemradio', { name: /^HKGeocode/ }),
    ).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('menuitem', { name: /^What3Words/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner artifact destination.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `hkgcode-menu-${width}.png`),
    })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Move outside coverage' }).click()
    await expect(page.locator('textarea')).toHaveValue('')
    await page
      .getByRole('button', { name: 'Display location using: HKGeocode', exact: true })
      .click()
    await expect(
      page.getByRole('menuitemradio', { name: /^HKGeocode/ }),
    ).toHaveAttribute('aria-disabled', 'true')
    await expect(
      page.getByText('Place the feature marker within Hong Kong GeoCode coverage', {
        exact: true,
      }),
    ).toBeVisible()
    await page.getByRole('menuitemradio', { name: /^Plus Code/ }).click()
    await expect(page.locator('textarea')).toHaveValue('6FG22222+22')
    expect(externalConversions).toEqual([])
  })
}
