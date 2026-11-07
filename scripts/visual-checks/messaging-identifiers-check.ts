// Run with dev-check bun scripts/visual-checks/messaging-identifiers-check.ts against a local app on port 4173.
// NODE
import { mkdir, writeFile } from 'node:fs/promises'
// BROWSER
import { chromium, firefox } from 'playwright'

// Exercise the real settings component and adapter with synthetic persistence, never provider accounts.
const api = `
import { normalizeMessagingIdentity } from '/src/lib/messaging/identity.ts';
const key='messaging-identifiers-check';
const state=JSON.parse(sessionStorage.getItem(key)||'null')||{platform:'whatsapp',preferredPlatform:null,identities:[]};
window.identityCalls=[];
const save=()=>sessionStorage.setItem(key,JSON.stringify(state));
const query=value=>Object.assign(Promise.resolve(structuredClone(value)),{refresh:async()=>{}});
export const getUserMessagingSettings=()=>query(state);
export const getMessagingOrganisations=()=>query([{id:'synthetic-org',code:'Synthetic organisation'}]);
export const getMessagingAccounts=()=>query(['whatsapp','telegram'].map(platform=>({id:platform,platform,externalAccountId:'synthetic',enabled:true})));
export async function setUserMessagingPreference(input){window.identityCalls.push({kind:'preference',...input});state.preferredPlatform=input.platform;state.platform=input.platform||'whatsapp';save();return {platform:state.platform}}
export async function setUserMessagingIdentity(input){
 window.identityCalls.push({kind:'identity',...input});
 if(window.failIdentitySave){window.failIdentitySave=false;throw new Error('Synthetic save failed')}
 state.identities=state.identities.filter(row=>row.platform!==input.platform);
 if(input.identity)state.identities.push({platform:input.platform,...normalizeMessagingIdentity(input.platform,input.identity),validation:null,verifiedAt:null,updatedAt:Date.now()});
 save();return {saved:true};
}
export async function checkUserMessagingIdentity(){window.identityCalls.push({kind:'check'});throw new Error('Provider confirmation must remain deferred')}
export async function verifyUserMessagingIdentity(input){
 window.identityCalls.push({kind:'verify',...input});
 const identity=state.identities.find(row=>row.platform===input.accountId);
 if(!identity||identity.updatedAt!==input.expectedUpdatedAt)throw new Error('Stale claim');
 identity.verifiedAt=Date.now();save();return {nativeId:identity.nativeId};
}
`

await mkdir('output/playwright', { recursive: true })
const results: { browser: string; width: number; screenshot: string }[] = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1100, 360]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      page.setDefaultTimeout(15_000)
      const errors: string[] = []
      page.on('pageerror', cause => {
        errors.push(cause.message)
        console.error(cause.message)
      })
      page.on('response', response => {
        if (response.status() >= 400) console.error(response.status(), response.url())
      })
      await page.route('**/src/lib/api/messaging.remote.ts*', route =>
        route.fulfill({ contentType: 'text/javascript', body: api }),
      )
      await page.route('**/__messaging-identifiers.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/messagingIdentifiersCheck.ts"></script></body></html>',
        }),
      )
      const url = 'http://127.0.0.1:4173/__messaging-identifiers.html'
      await page.goto(url)
      const whatsapp = page.getByRole('textbox', { name: 'WhatsApp', exact: true })
      const telegram = page.getByRole('textbox', { name: 'Telegram', exact: true })
      const preference = page.getByRole('button', {
        name: 'Preferred messaging platform',
        exact: true,
      })
      await whatsapp.fill('+852 9123 4567')
      await page.waitForFunction(
        () =>
          JSON.parse(sessionStorage.getItem('messaging-identifiers-check') || '{}')
            .identities?.length === 1,
      )
      if (await preference.count())
        throw new Error('Preference appeared before both contacts were saved')
      await telegram.fill('@synthetic_user')
      await preference.waitFor()
      await preference.click()
      await page.getByRole('radio', { name: 'Telegram', exact: true }).click()
      await page.waitForFunction(
        () =>
          JSON.parse(sessionStorage.getItem('messaging-identifiers-check')!)
            .preferredPlatform === 'telegram',
      )
      await page.getByRole('radio').first().waitFor({ state: 'detached' })
      await page.reload()
      await preference.waitFor()
      if (
        (await whatsapp.inputValue()) !== '+85291234567' ||
        (await telegram.inputValue()) !== '@synthetic_user' ||
        !(await preference.innerText()).includes('Telegram')
      )
        throw new Error('Reload lost a contact or preference')
      await preference.click()
      await page
        .getByRole('radio', { name: 'Use default (WhatsApp)', exact: true })
        .click()
      await page.waitForFunction(
        () =>
          JSON.parse(sessionStorage.getItem('messaging-identifiers-check')!)
            .preferredPlatform === null,
      )
      await page.evaluate('window.failIdentitySave=true')
      await telegram.fill('retry_user')
      await page
        .getByRole('status')
        .filter({ hasText: 'Synthetic save failed' })
        .waitFor({ state: 'attached' })
      if ((await telegram.inputValue()) !== 'retry_user')
        throw new Error('Failed save discarded the draft')
      await page
        .getByRole('button', { name: 'Retry saving Telegram', exact: true })
        .click()
      await page.waitForFunction(() =>
        JSON.parse(
          sessionStorage.getItem('messaging-identifiers-check')!,
        ).identities.some(identity => identity.username === 'retry_user'),
      )
      await page.getByText('Feature forthcoming', { exact: true }).first().waitFor()
      await page.getByRole('button', { name: 'Telegram status', exact: true }).hover()
      await page
        .getByRole('tooltip')
        .filter({ hasText: 'forthcoming feature' })
        .waitFor()
      if (
        await page.evaluate(
          'window.identityCalls.some(call => call.kind === "check" || call.kind === "verify")',
        )
      )
        throw new Error('Contact editing called a provider action')
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        )
      )
        throw new Error('Settings overflow horizontally')
      if (errors.length) throw new Error(errors.join('\n'))
      const screenshot = `output/playwright/${name}-messaging-identifiers-${width}.png`
      await page.screenshot({
        path: screenshot,
        fullPage: true,
        animations: 'disabled',
      })
      results.push({ browser: name, width, screenshot })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
await writeFile(
  'output/playwright/messaging-identifiers-results.json',
  JSON.stringify(results, null, 2),
)
console.log(JSON.stringify(results, null, 2))
