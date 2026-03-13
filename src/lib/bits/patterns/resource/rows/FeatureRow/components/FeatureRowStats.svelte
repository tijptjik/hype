<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// BITS CUSTOM
import {
  StatsCategorical,
  StatsContent,
  StatsFreeform,
  StatsImage,
  StatsStatus,
  StatsTranslation,
} from '$lib/bits/custom'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type { Feature } from '$lib/db/zod/schema/feature.types'

let {
  feature,
  appCtx,
  grapheme = '',
}: {
  feature: Feature
  appCtx: AppCtx
  grapheme?: string
} = $props()
</script>

<div class="bits-resource-row-stats">
  <div class="bits-resource-row-stats__grapheme">
    <small class="bits-resource-row-stats__label">{m.feature__graphemes()}</small>
    <div class="bits-resource-row-stats__tooltip tooltip" data-tip={grapheme}>
      <p class="bits-resource-row-stats__grapheme-value">{grapheme || '-'}</p>
    </div>
  </div>
  <StatsStatus {feature} {appCtx} />
  <div class="bits-resource-row-stats__content">
    <StatsContent {feature} {appCtx} />
  </div>
  <div class="bits-resource-row-stats__translation">
    <StatsTranslation {feature} {appCtx} />
  </div>
  <div class="bits-resource-row-stats__image"><StatsImage {feature} {appCtx} /></div>
  <div class="bits-resource-row-stats__category">
    <StatsCategorical {feature} {appCtx} />
  </div>
  <div class="bits-resource-row-stats__specifier">
    <StatsFreeform {feature} {appCtx} />
  </div>
</div>
