<script lang="ts">
// SVELTE
import type { ComponentProps } from 'svelte'
// I18N
import { getLocaleKey } from '#lib/i18n.js'
// COMPONENTS
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import TaskReviewStatusBar from './TaskReviewStatusBar.svelte'
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
import {
  hasProfileText,
  type ProfileValues,
} from '#lib/bits/patterns/forms/featureLocation/profileTranslation.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// TYPES
import type { ProfileLocaleState } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'

let {
  localeState,
  onChange,
  content = {},
  review,
  isCompact = false,
}: {
  content?: ProfileValues
  localeState: ProfileLocaleState
  onChange: (state: ProfileLocaleState) => void
  review?: ComponentProps<typeof TaskReviewStatusBar>
  isCompact?: boolean
} = $props()
const contentLocales = $derived(
  Object.entries(content)
    .filter(
      ([, values]) =>
        hasProfileText(values?.title) || hasProfileText(values?.description),
    )
    .map(([locale]) => canonicalContentTag(locale)),
)
</script>

<div class="flex min-w-0 items-center gap-2">
  {#if review}
    <TaskReviewStatusBar {...review} {isCompact} />
  {/if}
  <LocaleToolbar
    allowAdd={false}
    horizontal
    {contentLocales}
    selectedLocales={localeState.selectedLocales}
    visibleLocales={localeState.visibleLocales}
    expanded={localeState.expanded}
    options={contentLocaleOptions(getLocaleKey())}
    onExpandedChange={expanded => onChange({ ...localeState, expanded })}
    onChange={selection => onChange({ ...localeState, ...selection })}
    class="max-w-[min(36rem,calc(100vw-10rem))]"
  />
  <hr aria-orientation="vertical" class="bg-border mx-1 h-6 w-px shrink-0 border-0">
</div>
