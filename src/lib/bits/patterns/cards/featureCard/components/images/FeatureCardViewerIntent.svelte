<script lang="ts">
import { intentDisplay } from '$lib/client/services/image'
import type { ImageCtxEnvelope, Intent } from '$lib/db/zod/schema/image.types'

let { currentImage }: { currentImage: ImageCtxEnvelope } = $props()

const intent = $derived((currentImage?.intent || 'general') as Intent)
</script>

<div
  class="inline-flex h-7 items-center whitespace-nowrap rounded-full bg-black/55 px-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/92 backdrop-blur-sm"
>
  {intentDisplay[intent]}
</div>
