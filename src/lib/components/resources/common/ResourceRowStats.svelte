<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// BITS CUSTOM
import {
  CategoryStats,
  ContentStats,
  ImageStats,
  SpecifierStats,
  StatusStats,
  TranslationStats,
} from '$lib/bits/custom'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type { Feature } from '$lib/db/zod/schema/feature.types'

let {
  feature,
  appCtx,
  grapheme = '',
}: { feature: Feature; appCtx: AppCtx; grapheme?: string } = $props()
</script>

<div
  class="pointer-events-none flex items-center justify-center gap-8 @[62rem]/main:gap-8 @[74rem]/main:gap-9 @[86rem]/main:gap-10 @[98rem]/main:gap-12 @[120rem]/main:gap-20"
>
  <div class="flex flex-col items-center justify-center gap-1">
    <small class="text-xs text-base-content/60">{m.feature__graphemes()}</small>
    <div class="tooltip" data-tip={grapheme}>
      <p
        class="w-[80px] truncate text-sm text-base-content @[62rem]/main:w-[120px] @[74rem]/main:w-[160px] @[86rem]/main:w-[200px]"
      >
        {grapheme || '-'}
      </p>
    </div>
  </div>
  <StatusStats {feature} {appCtx} />
  <div class="hidden @[50rem]/main:block"><TranslationStats {feature} {appCtx} /></div>
  <div class="hidden @[50rem]/main:block"><ContentStats {feature} {appCtx} /></div>
  <div class="hidden @[62rem]/main:block"><ImageStats {feature} {appCtx} /></div>
  <div class="hidden @[78rem]/main:block"><CategoryStats {feature} {appCtx} /></div>
  <div class="hidden @[84rem]/main:block"><SpecifierStats {feature} {appCtx} /></div>
</div>
