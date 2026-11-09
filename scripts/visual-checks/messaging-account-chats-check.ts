// NODE
import { mkdir, readFile, writeFile } from 'node:fs/promises'
// BROWSER CHECKS
import { browserCases } from './lib/browser-cases'

// Render the real inbox, runtimes and composer with synthetic account APIs; no provider is contacted.
const init = `
const accounts=[{id:'telegram',platform:'telegram',enabled:true},{id:'whatsapp',platform:'whatsapp',enabled:true}];
const self={telegram:'99',whatsapp:'85290000000@s.whatsapp.net'};
const allThreads=[
 {id:'linked-tg',accountId:'telegram',chatId:'42',displayName:'HYPE member',lastMessageAt:6,recipient:{id:'hype-a',name:'HYPE Member',username:'hype_member',image:null}},
 {id:'external-tg',accountId:'telegram',chatId:'77',displayName:'Mina Ho',lastMessageAt:5,recipient:null},
 {id:'linked-wa',accountId:'whatsapp',chatId:'85291234561@s.whatsapp.net',displayName:'HYPE member',lastMessageAt:4,recipient:{id:'hype-b',name:'Another HYPE Member',username:'another_member',image:null}},
 {id:'external-wa',accountId:'whatsapp',chatId:'123456789@lid',displayName:'Long Native Contact Name That Must Remain Readable',lastMessageAt:3,recipient:null},
 {id:'group',accountId:'telegram',chatId:'-100123',displayName:'Delivery Team',lastMessageAt:2,recipient:null},
 {id:'older',accountId:'telegram',chatId:'79',displayName:'Older Telegram Contact',lastMessageAt:1,recipient:null},
].map(row=>({...row,platform:row.accountId,lastMessageAt:Date.now()-(7-row.lastMessageAt)*60000,isArchived:false,pinnedAt:JSON.parse(sessionStorage.getItem('pins')||'{}')[row.id]??null,unreadCount:0,preview:'Preview for '+row.id}));
const threads=allThreads.filter(row=>!['external-tg','group','older'].includes(row.id));
const messages=Object.fromEntries(accounts.map(account=>[account.id,allThreads.filter(row=>row.accountId===account.id).map((row,index)=>({id:'message-'+row.id,sequence:index+1,chat:row.chatId,sender:row.chatId,senderName:row.displayName,timestamp:row.lastMessageAt,fromMe:row.id==='external-wa',operator:row.id==='external-wa'?{name:'Synthetic Operator',username:'operator',image:null}:undefined,text:row.preview,readByMe:true}))]));
window.threadFixture={accounts,self,allThreads,threads,messages,events:[],outbox:{telegram:[],whatsapp:[]},scope:{prisms:{organisation:['synthetic']},selectOrganisation:async()=>{}}};
`
const custom: Record<string, string> = {
  getMessagingOrganisations: `()=>query([{id:'synthetic',code:'Account chats',name:'Synthetic Organisation',isMember:true,hasMessaging:true}])`,
  getMessagingAccounts: `()=>query(f.accounts)`,
  getMessagingConversations: `({accountId,archived=false})=>query(f.threads.filter(row=>row.accountId===accountId&&row.isArchived===archived))`,
  loadMessagingConversations: `async ({cursor})=>{f.events.push({kind:'discover',cursor});const ids=cursor?['older']:['external-tg','group'];for(const row of f.allThreads.filter(row=>ids.includes(row.id)))if(!f.threads.some(old=>old.id===row.id))f.threads.push(row);return {messages:f.messages.telegram.filter(message=>ids.includes(message.id.replace('message-',''))),next:cursor?null:{peer:'77',id:1,date:1}}}`,
  getMessagingInbox: `({accountId,after=0})=>query({status:{...status,identity:{id:f.self[accountId],name:'Linked account',username:null,phone:null}},messages:f.messages[accountId].filter(row=>row.sequence>after&&f.threads.some(thread=>thread.accountId===accountId&&thread.chatId===row.chat)),outbox:f.outbox[accountId],calls:{incoming:[],current:null},voiceAvailable:false})`,
  getMessagingProfile: `async ({accountId,address})=>({jid:address,name:f.allThreads.find(row=>row.accountId===accountId&&row.chatId===address)?.displayName||'Linked account',username:address==='77'?'native_handle':null,phone:null,aliases:address==='123456789@lid'?[address,'85291234567@s.whatsapp.net']:[address],photo:null})`,
  searchMessagingUsers: `async ()=>[]`,
  watchMessagingAccount: `async ()=>status`,
  unwatchMessagingAccount: `async ()=>{}`,
  markMessagingMessagesRead: `async ()=>({read:[]})`,
  loadMessagingHistory: `async ()=>({messages:[],nextBefore:null})`,
  getMessagingStickerPacks: `async ()=>[]`,
  configureMessagingNotifications: `async ()=>({enabled:false})`,
  setMessagingConversationPinned: `async ({accountId,chat,pinned})=>{const row=f.threads.find(row=>row.accountId===accountId&&row.chatId===chat);row.pinnedAt=pinned?Date.now():null;const pins=JSON.parse(sessionStorage.getItem('pins')||'{}');pins[row.id]=row.pinnedAt;sessionStorage.setItem('pins',JSON.stringify(pins));return {id:row.id,pinnedAt:row.pinnedAt}}`,
  setMessagingConversationArchived: `async ({accountId,chat,archived})=>{const row=f.threads.find(row=>row.accountId===accountId&&row.chatId===chat);row.isArchived=archived;f.events.push({kind:'archive',accountId,chat});return {id:row.id,isArchived:archived}}`,
  sendMessagingMessage: `async ({accountId,meta,...request})=>{f.events.push({kind:'send',accountId,request});const result={request,state:'submitted',messageId:request.requestId};f.outbox[accountId].push(result);return result}`,
}
const source = await readFile('src/lib/api/messaging.remote.ts', 'utf8')
const names = [...source.matchAll(/export const (\w+) = guarded/g)].map(
  match => match[1],
)
const api =
  `const f=window.threadFixture;const status={connected:true,loggedOut:false,qr:null,qrExpiresAt:null};const query=value=>Object.assign(Promise.resolve(structuredClone(value)),{refresh:async()=>{}});const unavailable=async()=>{throw new Error('Synthetic fixture has no provider')};\n` +
  names.map(name => `export const ${name}=${custom[name] ?? 'unavailable'};`).join('\n')
await mkdir('output/playwright', { recursive: true })
const results: object[] = []
for await (const { name: browserName, browser } of browserCases()) {
  for (const width of [1120, 320]) {
    console.log(browserName, width, 'checking account chats')
    const page = await browser.newPage({ viewport: { width, height: 960 } })
    page.setDefaultTimeout(15000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.stack || error.message))
    await page.addInitScript({ content: init })
    await page.route('**/src/lib/api/messaging.remote.ts*', route =>
      route.fulfill({ contentType: 'text/javascript', body: api }),
    )
    await page.route('**/src/lib/api/messagingAppearance.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `import {DEFAULT_CHAT_APPEARANCE} from '/src/lib/messaging/appearance.ts';export const getMessagingAppearance=()=>Object.assign(Promise.resolve(DEFAULT_CHAT_APPEARANCE),{refresh:async()=>{}});export const setMessagingAppearance=async({appearance})=>appearance;`,
      }),
    )
    for (const context of ['admin', 'root'])
      await page.route(`**/src/lib/context/${context}.svelte.ts*`, async route => {
        if (route.request().url().includes('fixture-original')) return route.continue()
        const getter =
          context === 'admin'
            ? 'export const getAdminCtx=()=>({view:{scope:window.threadFixture.scope}})'
            : "export const getRootCTX=()=>({user:{id:'synthetic-operator'}})"
        return route.fulfill({
          contentType: 'text/javascript',
          body: `export * from '/src/lib/context/${context}.svelte.ts?fixture-original';${getter};`,
        })
      })
    await page.route('**/__messaging-account-chats.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/messagingThreadsCheck.ts"></script></body></html>',
      }),
    )
    await page.route('**/_app/remote/**', route => {
      errors.push('Unexpected remote request')
      return route.abort()
    })
    await page.goto('http://127.0.0.1:4173/__messaging-account-chats.html')
    const nav = page.getByRole('navigation', { name: 'Conversations', exact: true })
    const mina = nav
      .getByRole('button')
      .filter({ has: page.getByText('Mina Ho', { exact: true }) })
    try {
      await mina.waitFor()
    } catch (cause) {
      console.error({ errors, text: await page.locator('body').innerText() })
      throw cause
    }
    if (!(await mina.locator('[class*=ring-red-]').count()))
      throw new Error('Unlinked native contact is not labelled')
    const linked = nav
      .getByRole('button')
      .filter({ has: page.getByText('HYPE Member', { exact: true }) })
    if ((await linked.innerText()).includes('Not linked to HYPE'))
      throw new Error('Linked HYPE member mislabelled')
    const group = nav
      .getByRole('button')
      .filter({ has: page.getByText('Delivery Team', { exact: true }) })
    if (!(await group.innerText()).includes('Group / channel'))
      throw new Error('Group missing distinct label')
    await mina.click()
    const chat = page.getByRole('region', { name: 'Conversation', exact: true })
    await chat.getByText('Not linked to HYPE', { exact: true }).waitFor()
    await chat.getByText('Telegram @native_handle', { exact: true }).waitFor()
    await page
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('Keep this native chat draft')
    const search = page.getByRole('textbox', {
      name: 'Search chats and HYPE users',
      exact: true,
    })
    await search.fill('Mina')
    await mina.waitFor()
    if (await linked.count()) throw new Error('Local native chat search did not filter')
    await search.fill('')
    await page.getByRole('button', { name: 'Load more chats', exact: true }).click()
    await nav.getByText('Older Telegram Contact', { exact: true }).waitFor()
    if (
      (await page
        .getByRole('textbox', { name: 'Message', exact: true })
        .inputValue()) !== 'Keep this native chat draft'
    )
      throw new Error('Loading more chats discarded draft')
    await group.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Pin chat', exact: true }).click()
    await page.waitForFunction(() =>
      document
        .querySelector('nav[aria-label="Conversations"] button')
        ?.textContent?.includes('Delivery Team'),
    )
    if (
      (await page
        .getByRole('textbox', { name: 'Message', exact: true })
        .inputValue()) !== 'Keep this native chat draft'
    )
      throw new Error('Pinning changed selection or discarded draft')
    if (
      !(await mina.innerText()).includes('Preview for external-tg') ||
      !(await linked.innerText()).includes('Preview for linked-tg')
    )
      throw new Error('Chat previews crossed identities')
    await page.reload()
    await group.waitFor()
    await page.waitForFunction(() =>
      document
        .querySelector('nav[aria-label="Conversations"] button')
        ?.textContent?.includes('Delivery Team'),
    )
    await group.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Unpin chat', exact: true }).click()
    await page.waitForFunction(() =>
      document
        .querySelector('nav[aria-label="Conversations"] button')
        ?.textContent?.includes('HYPE Member'),
    )
    await mina.click()
    await nav.evaluate(element => {
      element.scrollTop = 0
    })
    if (width < 600) await mina.scrollIntoViewIfNeeded()
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error('Inbox overflows horizontally')
    const screenshot = `output/playwright/${browserName}-messaging-account-chats-${width}.png`
    await page.screenshot({
      path: screenshot,
      fullPage: true,
      animations: 'disabled',
    })
    const externalWa = nav.getByRole('button').filter({
      has: page.getByText('Long Native Contact Name That Must Remain Readable', {
        exact: true,
      }),
    })
    await externalWa.click()
    await page
      .getByRole('heading', {
        name: 'Long Native Contact Name That Must Remain Readable',
        exact: true,
      })
      .waitFor()
    const senderHeader = chat.locator('header[title="Synthetic Operator"]')
    await senderHeader.getByText('Synthetic Organisation', { exact: true }).waitFor()
    if (
      (await senderHeader.innerText()).includes('WhatsApp') ||
      (await senderHeader.innerText()).includes('Synthetic Operator')
    )
      throw new Error(
        'Outgoing header exposes account or operator instead of organisation',
      )
    await senderHeader.hover()
    await page
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('Synthetic native reply')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page.waitForFunction(() =>
      Boolean(
        (window as any).threadFixture.events.find(
          (event: any) => event.kind === 'send',
        ),
      ),
    )
    const sent = await page.evaluate(() =>
      (window as any).threadFixture.events.find((event: any) => event.kind === 'send'),
    )
    if (sent.accountId !== 'whatsapp' || sent.request.to !== '123456789@lid')
      throw new Error('Native alias redirected the existing chat route')
    await externalWa.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Archive thread', exact: true }).click()
    await externalWa.waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Archived', exact: true }).click()
    await externalWa.waitFor()
    if (errors.length) throw new Error(errors.join('\n'))
    results.push({
      browser: browserName,
      width,
      screenshot,
      checks:
        'persistent pins, unpin order, distinct previews, avatar rings, native discovery, linked/unlinked labels, group label, search, pagination, draft preservation, native LID send, archive',
    })
    await page.close()
  }
}
await writeFile(
  'output/playwright/messaging-account-chats-results.json',
  JSON.stringify(results, null, 2),
)
console.log(JSON.stringify(results, null, 2))
