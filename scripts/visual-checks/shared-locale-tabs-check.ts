import { browserCases } from './lib/browser-cases'
for await (const { name, browser } of browserCases()) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'no-preference',
  })
  await page.route('**/src/lib/api/division.remote.ts*', route =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export function getAddressDivisionLabel(){return {current:null}}; export async function getAddressDivisionContext(){return {available:true,memberships:[],options:[]}}; export async function getDivisionGeometry(){return null}',
    }),
  )
  await page.route('**/__shared-locales.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html data-theme="breadline-light"><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/sharedLocaleTabsCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('http://127.0.0.1:4173/__shared-locales.html')
  const toggle = page.getByRole('button', { name: 'Multilingual', exact: true })
  if ((await toggle.getAttribute('aria-expanded')) !== 'false')
    throw new Error('Content default should be collapsed')
  await page.getByRole('button', { name: 'Location tab', exact: true }).click()
  if ((await toggle.getAttribute('aria-pressed')) !== 'true')
    throw new Error('Address default should be expanded independently')
  await page.getByRole('button', { name: 'Profile tab', exact: true }).click()
  await toggle.click()
  await page.getByRole('button', { name: 'Next Feature', exact: true }).click()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true')
    throw new Error('Next Feature lost multilingual mode')
  await page.getByRole('button', { name: 'Location tab', exact: true }).click()
  if ((await toggle.getAttribute('aria-pressed')) !== 'true')
    throw new Error('Location did not inherit Profile expansion')
  await toggle.click()
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-address-locale]')].some(
      element => element.getAnimations().length,
    ),
  )
  await page.waitForFunction(
    () => !document.querySelector('[data-address-locale="zhHant"]'),
  )
  await toggle.click()
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-address-locale]')].some(
      element => element.getAnimations().length,
    ),
  )
  await page.locator('[data-address-locale="zhHant"]').first().waitFor()
  await page.waitForTimeout(220)
  await page.screenshot({
    path: `output/playwright/${name}-address-locales.png`,
    fullPage: true,
  })
  await toggle.click()
  await page.getByRole('button', { name: 'Profile tab', exact: true }).click()
  if ((await toggle.getAttribute('aria-expanded')) !== 'false')
    throw new Error('Profile did not retain Location collapse')
  await page.getByRole('button', { name: 'Location tab', exact: true }).click()
  if ((await toggle.getAttribute('aria-pressed')) !== 'false')
    throw new Error('Location lost state on remount')
  await page.getByRole('button', { name: 'Previous Feature', exact: true }).click()
  if ((await toggle.getAttribute('aria-pressed')) !== 'false')
    throw new Error('Previous Feature lost multilingual mode')
  console.log(
    `${name}: independent defaults, next/previous, shared tab state and address intro/outro passed`,
  )
}
