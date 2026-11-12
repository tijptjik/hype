// NODE
import { mkdir } from 'node:fs/promises'
// BROWSER
import { chromium } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL
const chromeClass = process.env.DEV_RUNNER_CHROME_CLASS
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
if (!baseURL || !chromeClass || !artifacts) throw Error('Use dev-remote chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${chromeClass}`],
})
try {
  for (const width of [1200, 1440]) {
    for (const action of ['skip', 'translate']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      page.setDefaultTimeout(60000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/src/lib/api/identityCatalogue.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `
          let saved = null;
          const query = value => Object.assign(Promise.resolve(value), { refresh: async () => value });
          export const findIdentityCatalogue = () => query([]);
          export const getGroupBrands = () => query([]);
          export const getIdentityCatalogue = () => query(saved);
          export const publishIdentityCatalogue = async input => {
            window.__catalogueSaved = input;
            saved = { ...input.content, id: input.id, kind: input.kind, version: input.expectedVersion + 1 };
            return saved;
          };
          export const importIdentityCatalogue = async () => ({});
          export const publishIdentityCatalogueLocations = async () => ({ linked: 0, failed: [], next: null });
          export const uploadIdentityCatalogueLogo = async () => ({});
        `,
        }),
      )
      await page.route('**/src/lib/api/translation.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `export async function translateContentField({target,text}) { await new Promise(r => setTimeout(r,100)); return {status:'translated', text: target+' '+text} }`,
        }),
      )
      const kind = action === 'skip' ? 'brand' : 'group'
      const response = await page.goto(
        `${baseURL}/admin/catalogue?kind=${kind}&new=1`,
        { waitUntil: 'domcontentloaded', timeout: 120000 },
      )
      if (!response?.ok() || !new URL(page.url()).pathname.startsWith('/admin'))
        throw Error('Admin access failed')
      const session = await (
        await page.request.get(`${baseURL}/api/auth/get-session`)
      ).json()
      if (session?.user?.id !== 'hype-local-agent-admin')
        throw Error('Admin persona unavailable')
      await page.getByRole('button', { name: 'Name · en', exact: true }).click()
      await page.locator('#catalogue-name-en').fill('Review kitchen')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      const dialog = page.locator('[data-translation-dialog]')
      await dialog.waitFor()
      if (await page.evaluate(() => Boolean((window as any).__catalogueSaved)))
        throw Error('Header Save bypassed translation review')
      const outlines = page.locator('[data-missing-translation=true]')
      if ((await outlines.count()) !== 2)
        throw Error('Missing catalogue names were not highlighted')
      if (action === 'skip') {
        await dialog.getByRole('button', { name: 'Continue without accepting' }).click()
      } else {
        await dialog.getByRole('button', { name: 'Translate from English' }).click()
        await dialog.getByRole('button', { name: 'Accept all and continue' }).click()
      }
      await page.waitForFunction(() => Boolean((window as any).__catalogueSaved))
      const names = await page.evaluate(
        () => (window as any).__catalogueSaved.content.i18n,
      )
      if (action === 'skip' && (names['zh-Hant'].name || names['zh-Hans'].name))
        throw Error('Skipping filled empty locales')
      if (action === 'translate' && (!names['zh-Hant'].name || !names['zh-Hans'].name))
        throw Error('Accepted catalogue translations were not submitted')
      await page.screenshot({ path: `${artifacts}/catalogue-${action}-${width}.png` })
      if (errors.length) throw Error(errors.join('\n'))
      console.log('PASS catalogue header Save guard', kind, action, width)
      await page.close()
    }
  }
} finally {
  await browser.close()
}
