<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
// BITS COMPONENTS
import Switch from '#lib/bits/custom/switch/Switch.svelte'
// SETTINGS
import { MULTILINGUAL_SETTING_KEYS } from '#lib/content-locales/settings.js'
import type {
  ContentLocaleSettings,
  ContentLocaleSettingsPatch,
  MultilingualSettingKey,
} from '#lib/content-locales/settings.js'

let {
  value,
  inherited = {},
  scope,
  disabled = false,
  onChange,
}: {
  value: ContentLocaleSettingsPatch
  inherited?: ContentLocaleSettings
  scope: 'organisation' | 'project'
  disabled?: boolean
  onChange: (patch: Partial<Record<MultilingualSettingKey, boolean | null>>) => void
} = $props()
const id = $props.id()
</script>

<div
  class="flex min-w-0 self-start flex-col divide-y divide-border/20 rounded-xl border border-border bg-foreground/4 px-5"
>
  {#each MULTILINGUAL_SETTING_KEYS as key}
    {@const overridden = typeof value[key] === 'boolean'}
    {@const differs = overridden && value[key] !== (inherited[key] ?? false)}
    <div class="flex flex-wrap items-center justify-between gap-3 py-4">
      <div class="min-w-0 flex-1 basis-48">
        <label for={`${id}-${key}`} class="text-sm font-medium"
          >{key === 'multilingualContent'
            ? m.content_multilingual_default()
            : m.address_multilingual_default()}</label
        >
        {#if scope === 'project'}
          <p class="mt-1 text-xs text-muted-foreground">
            {overridden
              ? m.content_languages_project()
              : m.content_languages_inherited()}
          </p>
        {/if}
      </div>
      <div class="flex shrink-0 items-center gap-3">
        {#if !disabled}
          <button
            type="button"
            disabled={!differs}
            tabindex={differs ? 0 : -1}
            aria-hidden={!differs}
            style:opacity={differs ? 1 : 0}
            aria-label={m.content_languages_reset()}
            title={m.content_languages_reset()}
            class="flex size-9 transition-opacity duration-200 motion-reduce:transition-none disabled:pointer-events-none items-center justify-center rounded text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
            onclick={() => onChange({ [key]: null })}
          >
            <ResetIcon class="size-4" aria-hidden="true" />
          </button>
        {/if}
        <Switch
          id={`${id}-${key}`}
          checked={value[key] ?? inherited[key] ?? false}
          {disabled}
          onCheckedChange={checked => onChange({ [key]: checked === true })}
        />
      </div>
    </div>
  {/each}
</div>
