// Push-only service worker: no request interception or application caching.
self.addEventListener('push', event => {
 let payload; try { payload=event.data?.json() } catch { return }
 if(!payload)return
 const url=new URL(payload.url,self.location.origin)
 if(url.origin!==self.location.origin || url.pathname!=='/admin/messaging')return
 event.waitUntil(self.registration.showNotification('HYPE',{body:'New message in your organisation inbox.',tag:payload.tag||'hype-messaging',data:{url:url.href}}))
})
self.addEventListener('notificationclick',event=>{
 event.notification.close()
 event.waitUntil((async()=>{
  const url=event.notification.data?.url || new URL('/admin/messaging',self.location.origin).href
  if(new URL(url).origin!==self.location.origin)return
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true})
  const existing=windows.find(client=>new URL(client.url).pathname==='/admin/messaging')
  if(existing)await existing.focus();else await self.clients.openWindow(url)
 })())
})
