// Run with dev-check bun scripts/visual-checks/messaging-grouping-check.ts against a local app on port 4173.
// NODE
import { mkdir, readFile, writeFile } from 'node:fs/promises'
// BROWSER
import { chromium, firefox } from 'playwright'

// Real inbox, adapters and composer; all remote APIs below are synthetic and local to the page.
const init = `
const accounts = [{id:'telegram',platform:'telegram',enabled:true},{id:'whatsapp',platform:'whatsapp',enabled:true}];
const chats = {telegram:'42',whatsapp:'15555550100@s.whatsapp.net'};
const names = {telegram:'Ada Lam',whatsapp:'Bo Chan'};
const self = {telegram:'99',whatsapp:'15555559999@s.whatsapp.net'};
const photo = 'data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#f59e0b"/></svg>');
const profiles = Object.fromEntries(accounts.map(account=>[account.id,{jid:self[account.id],name:'Our '+account.platform+' account',username:null,phone:null,aliases:[self[account.id]],photo}]));
const threads = JSON.parse(sessionStorage.getItem('thread-fixture') || 'null') || accounts.map((account,index)=>({id:account.id,accountId:account.id,platform:account.platform,chatId:chats[account.id],isArchived:false,lastMessageAt:2-index,unreadCount:0,recipient:{id:account.id,name:names[account.id],username:account.id,image:null}}));
const messages = Object.fromEntries(accounts.map(account=>[account.id,[{id:'incoming',chat:chats[account.id],sender:chats[account.id],senderName:names[account.id],sequence:1,timestamp:Date.now()-60000,fromMe:false,text:'A synthetic conversation',readByMe:true}]]));
for(const account of accounts)messages[account.id].push({id:'outgoing',chat:chats[account.id],sender:self[account.id],sequence:2,timestamp:Date.now(),fromMe:true,text:'A clearer outgoing message'});
for(const account of accounts)for(let i=0;i<40;i++)messages[account.id].push({id:'group-'+i,chat:chats[account.id],sender:self[account.id],sequence:i+3,timestamp:Date.now()-40000+i*1000,fromMe:true,text:'Grouped message '+i+' with enough content to read naturally.',operator:{id:i<25?'alex':'sam',name:i<25?'Alex':'Sam',username:i<25?'alex_hype':'sam_hype',image:null}});
window.threadFixture = {accounts,chats,names,self,profiles,threads,messages,outbox:{telegram:[],whatsapp:[]},events:[],scope:{prisms:{organisation:['synthetic']},selectOrganisation:async()=>{}},failArchive:false};
`
const source = await readFile('src/lib/api/messaging.remote.ts', 'utf8')
const custom: Record<string, string> = {
  getMessagingOrganisations: `() => query([{id:'synthetic',code:'Synthetic inbox',isMember:true,hasMessaging:true}])`,
  getMessagingAccounts: `() => query(f.accounts)`,
  getMessagingConversations: `({accountId,archived=false}) => query(f.threads.filter(row=>row.accountId===accountId && row.isArchived===archived))`,
  setMessagingConversationArchived: `async ({accountId,chat,archived}) => { if(f.failArchive){f.failArchive=false;throw new Error('Synthetic archive failure')} const row=f.threads.find(row=>row.accountId===accountId && row.chatId===chat); if(!row)throw new Error('Unknown thread'); row.isArchived=archived; f.events.push({kind:'archive',accountId,archived}); sessionStorage.setItem('thread-fixture',JSON.stringify(f.threads)); return {id:row.id,isArchived:archived} }`,
  getMessagingInbox: `({accountId,after=0}) => query({status:{...status,identity:{id:f.self[accountId],name:f.profiles[accountId].name,username:null,phone:null}},messages:f.messages[accountId].filter(message=>message.sequence>after),outbox:f.outbox[accountId],calls:{incoming:[],current:null},voiceAvailable:false})`,
  getMessagingProfile: `async ({accountId,address}) => address===f.self[accountId] ? f.profiles[accountId] : ({jid:address,name:Object.entries(f.chats).find(([,chat])=>chat===address)?.[0] || 'You',username:null,phone:null,aliases:[],photo:null})`,
  watchMessagingAccount: `async () => status`,
  unwatchMessagingAccount: `async () => {}`,
  markMessagingMessagesRead: `async () => ({read:[]})`,
  loadMessagingHistory: `async () => ({messages:[],nextBefore:null})`,
  getMessagingStickerPacks: `async () => []`,
  configureMessagingNotifications: `async () => ({enabled:false})`,
  sendMessagingMessage: `({accountId,meta,...request}) => new Promise(resolve=>{f.events.push({kind:'send',accountId,request}); const receipt={request,state:'pending',messageId:''}; f.outbox[accountId]=[receipt]; f.finishSend=(state='submitted')=>resolve({...receipt,state,messageId:state==='submitted'?request.requestId:''}); f.publishEcho=()=>{f.messages[accountId].push({id:request.requestId,chat:request.to,sender:f.self[accountId],sequence:f.messages[accountId].length+1,timestamp:Date.now(),fromMe:true,text:request.text,delivery:'sent'})} })`,
}
const names = [...source.matchAll(/export const (\w+) = guarded/g)].map(
  match => match[1],
)
const api =
  `const f=window.threadFixture; const status={connected:true,loggedOut:false,qr:null,qrExpiresAt:null}; const query=value=>Object.assign(Promise.resolve(structuredClone(value)),{refresh:async()=>{}}); const unavailable=async()=>{throw new Error('Synthetic fixture has no provider')};\n` +
  names
    .map(name => `export const ${name} = ${custom[name] ?? 'unavailable'};`)
    .join('\n')
await mkdir('output/playwright', { recursive: true })
const results: object[] = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1120, 360]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      // Enable providers only inside this fully synthetic inbox fixture.
      await page.route('**/src/lib/messaging/integrations.ts*', route =>
        route.fulfill({
          contentType: 'text/javascript',
          body: 'export const messagingIntegrations = { telegram: true, whatsapp: true };',
        }),
      )
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.stack || error.message))
      await page.addInitScript({ content: init })
      await page.route('**/src/lib/api/messagingAppearance.remote.ts*', route =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `import {DEFAULT_CHAT_APPEARANCE} from '/src/lib/messaging/appearance.ts'; export const getMessagingAppearance=()=>Object.assign(Promise.resolve({...DEFAULT_CHAT_APPEARANCE,image:'/messaging/toastie-and-friends.png',opacity:0.08}),{refresh:async()=>{}}); export const setMessagingAppearance=async({appearance})=>appearance;`,
        }),
      )
      await page.route('**/src/lib/api/messaging.remote.ts*', route =>
        route.fulfill({ contentType: 'text/javascript', body: api }),
      )
      for (const context of ['admin', 'root'])
        await page.route(`**/src/lib/context/${context}.svelte.ts*`, async route => {
          if (route.request().url().includes('fixture-original')) {
            await route.continue()
            return
          }
          const getter =
            context === 'admin'
              ? 'export const getAdminCtx=()=>({view:{scope:window.threadFixture.scope}})'
              : "export const getRootCTX=()=>({user:{id:'synthetic-operator'}})"
          await route.fulfill({
            contentType: 'text/javascript',
            body: `export * from '/src/lib/context/${context}.svelte.ts?fixture-original'; ${getter};`,
          })
        })
      await page.route('**/__messaging-threads.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/messagingThreadsCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/_app/remote/**', route => {
        errors.push(
          'Unexpected fixture remote: ' + new URL(route.request().url()).pathname,
        )
        return route.abort()
      })
      await page.goto(
        `${process.env.HYPE_REVIEW_URL ?? 'http://127.0.0.1:4173'}/__messaging-threads.html`,
      )
      const nav = page.getByRole('navigation', { name: 'Conversations', exact: true })
      const ada = nav
        .getByRole('button')
        .filter({ has: page.getByText('Ada Lam', { exact: true }) })
      const bo = nav
        .getByRole('button')
        .filter({ has: page.getByText('Bo Chan', { exact: true }) })
      try {
        await ada.waitFor()
        await bo.waitFor()
      } catch (cause) {
        console.error({ errors, body: await page.locator('body').innerText() })
        await page.screenshot({
          path: `output/playwright/${name}-thread-fixture-failure-${width}.png`,
        })
        throw cause
      }
      if (await nav.getByRole('button', { name: /Thread actions/ }).count())
        throw new Error('Thread ellipsis is still present')
      await ada.click()
      await page.getByRole('heading', { name: 'Ada Lam', exact: true }).waitFor()

      await page
        .getByRole('log')
        .getByText('A clearer outgoing message', { exact: true })
        .waitFor()
      const previewLine = nav
        .getByText('A clearer outgoing message', { exact: true })
        .first()
      const identityLine = nav.getByText(/@telegram/).first()
      const previewStyle = await previewLine.evaluate(el => ({
        size: parseFloat(getComputedStyle(el).fontSize),
        top: el.getBoundingClientRect().top,
      }))
      const identityStyle = await identityLine.evaluate(el => ({
        size: parseFloat(getComputedStyle(el).fontSize),
        top: el.getBoundingClientRect().top,
      }))
      if (
        previewStyle.size <= identityStyle.size ||
        previewStyle.top <= identityStyle.top
      )
        throw new Error(
          'Conversation preview is not readable below the contact identity',
        )
      await page.waitForTimeout(300)
      const colors = await page.evaluate(() => {
        const active = document.querySelector('[aria-current="true"]')?.parentElement
        const bubble = document
          .querySelector('article header[title="Alex"]')
          ?.closest('article')
        if (!active || !bubble)
          throw new Error('Missing selected conversation or bubble')
        return {
          active: getComputedStyle(active).backgroundColor,
          outgoing: getComputedStyle(bubble).backgroundColor,
          border: getComputedStyle(bubble).borderColor,
        }
      })
      if (
        colors.active !== 'rgb(215, 234, 242)' ||
        colors.outgoing !== 'rgb(255, 250, 243)'
      )
        throw new Error(JSON.stringify(colors))

      const log = page.getByRole('log', { name: 'Messages' })
      const groups = await log.evaluate(el => ({
        messages: el.querySelectorAll('article').length,
        headers: el.querySelectorAll('article header').length,
      }))
      if (groups.messages < 40 || groups.headers > 5)
        throw new Error('Messages did not group: ' + JSON.stringify(groups))
      await log.evaluate(el => {
        el.scrollTop = el.scrollHeight / 2
      })
      await page.waitForTimeout(150)
      const before = await log.evaluate(el => {
        const top = el.getBoundingClientRect().top
        const anchor = [...el.querySelectorAll<HTMLElement>('[data-message-key]')].find(
          row => row.getBoundingClientRect().bottom > top,
        )!
        return {
          key: anchor.dataset.messageKey!,
          offset: anchor.getBoundingClientRect().top - top,
        }
      })
      await log.evaluate(el => {
        const img = new Image()
        img.alt = 'Synthetic delayed image'
        img.style.width = '300px'
        img.style.display = 'block'
        el.querySelector('article')!.append(img)
        setTimeout(() => {
          img.src =
            'data:image/svg+xml,' +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"><rect width="300" height="600" fill="#d7eaf2"/></svg>',
            )
        }, 100)
      })
      await page.waitForTimeout(600)
      const after = await log.evaluate((el, key) => {
        const row = [...el.querySelectorAll<HTMLElement>('[data-message-key]')].find(
          row => row.dataset.messageKey === key,
        )!
        return row.getBoundingClientRect().top - el.getBoundingClientRect().top
      }, before.key)
      if (Math.abs(after - before.offset) > 2)
        throw new Error(
          'Delayed image moved reading anchor: ' + JSON.stringify({ before, after }),
        )
      await page.screenshot({
        path: `output/playwright/${name}-grouped-messages-${width}.png`,
      })
      await log.evaluate(el => {
        el.scrollTop = el.scrollHeight
      })
      await page.waitForTimeout(100)
      await log.evaluate(el => {
        el.querySelector('article img[alt="Synthetic delayed image"]')!.setAttribute(
          'height',
          '900',
        )
      })
      await page.waitForTimeout(300)
      const distance = await log.evaluate(
        el => el.scrollHeight - el.clientHeight - el.scrollTop,
      )
      if (distance > 2) throw new Error('Lost bottom pin: ' + distance)
      console.log(
        JSON.stringify({
          name,
          width,
          groups,
          anchorShift: after - before.offset,
          bottomDistance: distance,
        }),
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
