import { chromium } from 'playwright'
import { REGISTERED_MAP_STYLE_CATALOG } from '../../src/lib/map/styles/catalog'
import { ensureMapStyleRenderGeneratedLocally } from '../../src/lib/map/styles/render.local.server'
const baseUrl='http://127.0.0.1:4173'
const remoteConfig={accountId:process.env.CLOUDFLARE_ACCOUNT_ID!,accessKeyId:process.env.R2_S3_ACCESS_KEY_ID!,secretAccessKey:process.env.R2_S3_SECRET_ACCESS_KEY!}
if(Object.values(remoteConfig).some(value=>!value)) throw new Error('Missing render credentials')
const browser=await chromium.launch({headless:true,args:['--disable-web-security']})
try {
 for(const style of REGISTERED_MAP_STYLE_CATALOG.filter(style=>style.key!=='hyperAdmin')) {
  const response=await fetch(`${baseUrl}/api/mapRenders/styles/${style.key}/asset`)
  if(response.ok){console.log('EXISTS',style.key);continue}
  if(response.status!==404)throw new Error(`Preview lookup failed: ${style.key} ${response.status}`)
  console.log('RENDERING',style.key)
  await ensureMapStyleRenderGeneratedLocally(style.key,{baseUrl,browser,ensureArtifacts:false,manageServer:false,stage:'local',storage:'local',remoteConfig})
  console.log('RENDERED',style.key)
 }
} finally { await browser.close() }
