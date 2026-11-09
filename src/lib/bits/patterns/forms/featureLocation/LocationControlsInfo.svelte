<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import InfoIcon from 'virtual:icons/proicons/info'
import SyncIcon from 'virtual:icons/proicons/arrow-sync'
import PeopleIcon from 'virtual:icons/proicons/person-multiple'
import LanguagesIcon from 'virtual:icons/proicons/globe'
</script>

<SimpleTooltip
  showArrow={true}
  triggerProps={{ 'aria-label': m.location_controls_help(), role: 'button' }}
  contentClass="w-[38rem] max-w-[calc(100vw-2rem)] p-4 text-left"
  contentProps={{ side: 'bottom' }}
>
  {#snippet trigger()}
    <span
      class="text-muted-foreground hover:bg-primary/10 hover:text-primary inline-flex size-10 items-center justify-center rounded-lg"
    >
      <InfoIcon class="size-4" aria-hidden="true" />
    </span>
  {/snippet}
  <div
    class="max-h-[min(calc(100dvh-5rem),calc(var(--bits-popover-content-available-height,100dvh)-2.5rem))] space-y-4 overflow-y-auto"
  >
    <section class="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5">
      <SyncIcon class="text-primary mt-0.5 size-5" aria-hidden="true" />
      <div class="space-y-3">
        <h3 class="text-[15px] leading-snug font-semibold">
          {m.location_controls_sync_title()}
        </h3>
        <dl class="space-y-3 text-sm">
          {#each [
            {
              label: m.association_linked(),
              description: m.location_sync_linked_help(),
            },
            {
              label: m.association_unlinked(),
              description: m.location_sync_open_help(),
            },
            {
              label: m.location_sync_unsynced(),
              description: m.location_sync_unsynced_help(),
            },
          ] as item}
            <div class="leading-relaxed">
              <dt class="inline font-semibold">{item.label}</dt>
              {' '}
              <dd class="text-muted-foreground inline">— {item.description}</dd>
            </div>
          {/each}
        </dl>
      </div>
    </section>
    <section
      class="border-border/50 grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5 border-t pt-4"
    >
      <PeopleIcon class="text-primary mt-0.5 size-5" aria-hidden="true" />
      <div class="space-y-3 text-sm">
        <h3 class="text-[15px] leading-snug font-semibold">
          {m.location_controls_visibility_title()}
        </h3>
        <!-- Keep translated punctuation adjacent to the bold labels. -->
        <ul class="text-muted-foreground space-y-2 leading-relaxed">
          <li>
            <strong class="text-foreground font-semibold"
              >{m.location_visibility_shared()}</strong
            >{m.location_visibility_shared_help()}
          </li>
          <li>
            <strong class="text-foreground font-semibold"
              >{m.location_visibility_exclusive()}</strong
            >{m.location_visibility_exclusive_help()}
          </li>
        </ul>
        <p class="text-muted-foreground leading-relaxed">
          {m.location_visibility_name_override_help()}
        </p>
      </div>
    </section>
    <section
      class="border-border/50 grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5 border-t pt-4"
    >
      <LanguagesIcon class="text-primary mt-0.5 size-5" aria-hidden="true" />
      <div class="space-y-2 text-sm">
        <h3 class="text-[15px] leading-snug font-semibold">
          {m.location_controls_languages_title()}
        </h3>
        <p class="text-muted-foreground leading-relaxed">
          {m.location_languages_help()}
        </p>
        <p class="text-muted-foreground flex items-start gap-2 leading-relaxed">
          <span
            class="bg-primary mt-2 size-1.5 shrink-0 rounded-full"
            aria-hidden="true"
          ></span>{m.location_languages_indicator_help()}
        </p>
      </div>
    </section>
  </div>
</SimpleTooltip>
