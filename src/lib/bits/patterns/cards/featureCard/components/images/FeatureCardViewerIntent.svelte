<script lang="ts">
import { intentDisplay } from '#lib/client/services/image.js'
import type { ImageCtxEnvelope, Intent } from '#lib/db/zod/schema/image.types.js'

let { currentImage }: { currentImage: ImageCtxEnvelope } = $props()

const intent = $derived((currentImage?.intent || 'general') as Intent)
</script>

<div
  class="inline-flex h-7 items-center rounded-full bg-black/55 px-3 font-mono text-[10px] tracking-[0.22em] whitespace-nowrap text-white/92 uppercase backdrop-blur-sm"
>
  {currentImage.intentLabel ?? intentDisplay[intent] ?? intent}
</div>
