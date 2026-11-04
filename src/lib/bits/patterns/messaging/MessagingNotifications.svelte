<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// API
import { configureMessagingNotifications } from '#lib/api/messaging.remote.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import BellIcon from 'virtual:icons/lucide/bell'
import BellOffIcon from 'virtual:icons/lucide/bell-off'
let {organisationId}:{organisationId:string}=$props()
let supported=$state(false),enabled=$state(false),busy=$state(false),initialising=$state(true),failure=$state('')
let mounted=false
let subscription:PushSubscription|null=null
const meta={isAdminRequest:true as const}
/** Browser permission is requested only following an explicit Enable click. */
async function toggle():Promise<void>{
 if(busy||initialising)return
 busy=true;failure=''
 try{
  if(enabled&&subscription){await configureMessagingNotifications({meta,organisationId,action:'unsubscribe',endpoint:subscription.endpoint});enabled=false;return}
  const permission=await Notification.requestPermission()
  if(permission!=='granted')throw new Error('Allow notifications in browser settings to enable alerts')
  const response=await configureMessagingNotifications({meta,organisationId,action:'key'})
  if(!response.publicKey)throw new Error('Notification service unavailable')
  const key=Uint8Array.from(atob(response.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))
  const registration=await navigator.serviceWorker.register('/messaging-sw.js',{scope:'/admin/messaging'})
  await waitForActivation(registration)
  subscription=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key})
  const json=subscription.toJSON()
  await configureMessagingNotifications({meta,organisationId,action:'subscribe',subscription:{endpoint:subscription.endpoint,expirationTime:subscription.expirationTime,keys:{p256dh:json.keys!.p256dh,auth:json.keys!.auth}}})
  if(mounted){enabled=true;await focus()}
 }catch(cause){failure=cause instanceof Error?cause.message:'Unable to configure notifications'}finally{busy=false}
}
async function focus():Promise<void>{if(mounted&&enabled&&subscription)try{await configureMessagingNotifications({meta,organisationId,action:document.visibilityState==='visible'&&document.hasFocus()?'focus':'blur',endpoint:subscription.endpoint})}catch{}}
/** Wait for an active push worker, including install failure and activation races. */
async function waitForActivation(registration:ServiceWorkerRegistration):Promise<void>{
 if(registration.active)return
 const worker=registration.installing||registration.waiting
 if(!worker)throw new Error('Notification service worker could not start')
 await new Promise<void>((resolve,reject)=>{
  const finish=(error?:Error)=>{clearTimeout(timer);worker.removeEventListener('statechange',check);error?reject(error):resolve()}
  const check=()=>{if(worker.state==='activated')finish();else if(worker.state==='redundant')finish(new Error('Notification service worker could not start'))}
  const timer=setTimeout(()=>finish(new Error('Notification setup timed out; please retry')),15000)
  worker.addEventListener('statechange',check)
  check()
 })
}
onMount(()=>{
 mounted=true
 supported='Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window
 if(supported)void(async()=>{
  try{
   const registration=await navigator.serviceWorker.getRegistration('/admin/messaging')
   const existing=await registration?.pushManager.getSubscription()??null
   if(!mounted)return
   subscription=existing
   if(subscription){
    const status=await configureMessagingNotifications({meta,organisationId,action:'status',endpoint:subscription.endpoint})
    if(!mounted)return
    enabled=Boolean(status.enabled)
    if(enabled){
     const json=subscription.toJSON()
     await configureMessagingNotifications({meta,organisationId,action:'subscribe',subscription:{endpoint:subscription.endpoint,expirationTime:subscription.expirationTime,keys:{p256dh:json.keys!.p256dh,auth:json.keys!.auth}}})
     await focus()
    }
   }
  }catch{ /* Keep explicit enable available when restoring a subscription fails. */ }
  finally{if(mounted)initialising=false}
 })()
 else initialising=false
 const timer=setInterval(()=>void focus(),20000)
 window.addEventListener('focus',focus)
 window.addEventListener('blur',focus)
 document.addEventListener('visibilitychange',focus)
 return()=>{if(enabled&&subscription)void configureMessagingNotifications({meta,organisationId,action:'blur',endpoint:subscription.endpoint}).catch(()=>{});mounted=false;clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('blur',focus);document.removeEventListener('visibilitychange',focus)}
})
</script>
<div class="flex flex-col gap-1">
  <Button text={busy?'Updating notifications…':enabled?'Notifications on':'Enable notifications'} iconComponent={enabled?BellIcon:BellOffIcon} hideLabel hideLabelInstantly modifier="circle" style={enabled?'soft':'ghost'} color={enabled?'primary':'neutral'} size="sm" class={enabled?'':'opacity-60'} disabled={!supported||busy||initialising} attrs={{title:!supported?'Notifications are unavailable in this browser':initialising?'Checking notifications…':busy?'Updating notifications…':enabled?'Turn notifications off':'Turn notifications on','aria-pressed':enabled,'aria-busy':busy||initialising}} onClick={()=>void toggle()} />
  {#if failure}<p role="alert" class="max-w-xs text-xs">{failure}</p>{/if}
</div>
