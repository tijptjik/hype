// NODE
import { mkdir, readFile, writeFile } from 'node:fs/promises'
// BROWSER CHECKS
import { browserCases } from './lib/browser-cases'

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
for await (const { name, browser } of browserCases()) {
  for (const width of [1120, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.stack || error.message))
    await page.addInitScript({ content: init })
    await page.route('**/src/lib/api/messagingAppearance.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `import {DEFAULT_CHAT_APPEARANCE} from '/src/lib/messaging/appearance.ts'; export const getMessagingAppearance=()=>Object.assign(Promise.resolve(DEFAULT_CHAT_APPEARANCE),{refresh:async()=>{}}); export const setMessagingAppearance=async({appearance})=>appearance;`,
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
    await page.goto('http://127.0.0.1:4173/__messaging-threads.html')
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
    await bo.click({ button: 'right' })
    const menu = page.getByRole('menu')
    await menu.getByRole('menuitem', { name: 'Archive thread' }).waitFor()
    if (
      !(await page.getByRole('heading', { name: 'Ada Lam', exact: true }).isVisible())
    )
      throw new Error('Right-click changed selection')
    await page.screenshot({
      animations: 'disabled',
      path: `output/playwright/${name}-thread-menu-${width}.png`,
    })
    await menu.getByRole('menuitem', { name: 'Archive thread' }).click()
    await bo.waitFor({ state: 'hidden' })
    await page.reload()
    await ada.waitFor()
    if (await bo.count()) throw new Error('Archive did not survive reload')
    await page.getByRole('button', { name: 'Archived', exact: true }).click()
    await bo.waitFor()
    await bo.focus()
    await bo.press('Shift+F10')
    await menu.getByRole('menuitem', { name: 'Restore thread' }).click()
    await bo.waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Inbox', exact: true }).click()
    await ada.waitFor()
    await bo.waitFor()
    // A failed archive restores the same selected thread, without losing its draft.
    await ada.click()
    await page
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('Preserve this draft')
    await page.evaluate('window.threadFixture.failArchive=true')
    await ada.click({ button: 'right' })
    await menu.getByRole('menuitem', { name: 'Archive thread' }).click()
    await page
      .getByRole('alert')
      .filter({ hasText: 'Synthetic archive failure' })
      .waitFor()
    await ada.waitFor()
    if (
      (await page
        .getByRole('textbox', { name: 'Message', exact: true })
        .inputValue()) !== 'Preserve this draft'
    )
      throw new Error('Archive rollback lost the draft')
    for (const [platform, row] of [
      ['telegram', ada],
      ['whatsapp', bo],
    ] as const) {
      await row.click()
      const input = page.getByRole('textbox', { name: 'Message', exact: true })
      const composer = page.getByRole('form', { name: 'Message composer' })
      await input.fill('')
      const empty = await composer.boundingBox()
      await input.fill(`Optimistic ${platform} message`)
      const before = await composer.boundingBox()
      await page.getByRole('button', { name: 'Send message', exact: true }).click()
      await page.getByRole('img', { name: 'Sending', exact: true }).waitFor()
      const avatar = page.locator('[data-pending-send]').getByRole('img', {
        name: 'Our ' + platform + ' account avatar',
        exact: true,
      })
      await avatar.waitFor()
      const avatarSrc = await avatar.getAttribute('src')
      if (!avatarSrc?.startsWith('data:image/svg+xml'))
        throw new Error('Pending send did not reuse the account avatar')
      const pending = await composer.boundingBox()
      if (
        !before ||
        !pending ||
        before.y !== pending.y ||
        before.height !== pending.height ||
        (await composer.getByRole('status').count())
      )
        throw new Error('Pending send shifted the composer')
      await page.screenshot({
        animations: 'disabled',
        path: `output/playwright/${name}-${platform}-pending-${width}.png`,
      })
      await page.evaluate('window.threadFixture.finishSend()')
      await page
        .getByRole('img', {
          name: platform === 'telegram' ? 'Sent to Telegram cloud' : 'Sent to WhatsApp',
          exact: true,
        })
        .waitFor()
      await page.waitForFunction(
        () =>
          document.querySelector('textarea[aria-keyshortcuts]') instanceof
            HTMLTextAreaElement &&
          (document.querySelector('textarea[aria-keyshortcuts]') as HTMLTextAreaElement)
            .value === '',
      )
      const sent = await composer.boundingBox()
      // Wrapped drafts naturally shrink when cleared; status must not add any extra row.
      if (
        !empty ||
        !sent ||
        empty.y !== sent.y ||
        empty.height !== sent.height ||
        (await composer.getByRole('status').count())
      )
        throw new Error(
          `Acknowledgment added layout shift: ${JSON.stringify({ empty, sent })}`,
        )
      await page.evaluate('window.threadFixture.publishEcho()')
      await page.locator('[data-pending-send]').waitFor({ state: 'hidden' })
      const echoedAvatar = page.getByRole('log').getByRole('img', {
        name: 'Our ' + platform + ' account avatar',
        exact: true,
      })
      await echoedAvatar.waitFor()
      if ((await echoedAvatar.getAttribute('src')) !== avatarSrc)
        throw new Error('Native echo changed the account avatar')
      if (
        (await page
          .getByRole('log')
          .getByText(`Optimistic ${platform} message`, { exact: true })
          .count()) !== 1
      )
        throw new Error('Native reconciliation duplicated or lost the message')
      await page
        .getByRole('button', { name: 'React', exact: true })
        .first()
        .press('Enter')
      await page.getByRole('button', { name: '👍', exact: true }).click()
      await page.waitForFunction(
        'window.threadFixture.events.at(-1)?.request?.reaction === "👍"',
      )
      await page.evaluate('window.threadFixture.finishSend("uncertain")')
      await page
        .getByText(
          'Reaction delivery is uncertain. Check the conversation before trying again.',
          { exact: true },
        )
        .waitFor()
      const recovery = await composer.boundingBox()
      if (
        !recovery ||
        empty.y !== recovery.y ||
        empty.height !== recovery.height ||
        (await composer.getByRole('status').count())
      )
        throw new Error('Reaction recovery shifted the composer')
      await page.getByRole('button', { name: 'New message', exact: true }).click()
      if (await input.evaluate(element => (element as HTMLTextAreaElement).readOnly))
        throw new Error('Reaction recovery left the composer locked')
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error('Narrow layout overflows horizontally')
    if (errors.length) throw new Error(errors.join('\n'))
    results.push({
      browser: name,
      width,
      archive: 'passed',
      restore: 'passed',
      rollback: 'passed',
      pendingSend: 'passed',
      accountAvatars: 'passed',
      ellipsisAbsent: true,
      reactionRecovery: 'passed',
      pendingComposerShift: 0,
      statusFooterShift: 0,
    })
    console.log(
      `${name} ${width}px: context menu, archive persistence, keyboard restore, rollback, both-platform optimistic sends and reaction recovery passed`,
    )
    await page.close()
  }
}
await writeFile(
  'output/playwright/messaging-thread-checks.json',
  JSON.stringify(results, null, 2),
)
