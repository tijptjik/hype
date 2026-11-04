<script lang="ts">
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// BITS COMPONENTS
import MessagingInbox from '#lib/bits/patterns/messaging/MessagingInbox.svelte'
// ICONS
import ChatIcon from 'virtual:icons/lucide/message-circle'
const admin = getAdminCtx()
const header = getHeaderCtrl()
admin.setResourceType(false)
$effect(() => {
  header.setHeaderForStandAlone('Messaging', ChatIcon, {
    showNew: false, showFilter: false, showFacets: false, showViewActions: false,
    showLayoutToggle: false, showControlBarToggle: false,
  })
  header.clearFooter()
})
</script>
<MessagingInbox />
