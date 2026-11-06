<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import InfoIcon from 'virtual:icons/proicons/info'
import LocationIcon from 'virtual:icons/proicons/location'
import SyncIcon from 'virtual:icons/proicons/arrow-sync'
import SearchIcon from 'virtual:icons/proicons/search'
</script>

<header class="min-w-0 flex-1 space-y-1 text-center" data-association-heading>
  <div class="flex items-center justify-center gap-2">
    <h2 class="text-base font-semibold sm:text-lg">{m.association_title()}</h2>
    <SimpleTooltip
      showArrow={true}
      triggerProps={{ 'aria-label': m.association_help_title(), role: 'button' }}
      contentClass="w-[21rem] max-w-[calc(100vw-2rem)] p-4 text-left"
    >
      {#snippet trigger()}
        <InfoIcon class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      {/snippet}
      <div
        class="max-h-[min(calc(100dvh-5rem),calc(var(--bits-popover-content-available-height,100dvh)-2.5rem))] overflow-y-auto"
      >
        <div class="border-border/50 flex items-center gap-2.5 border-b pb-3">
          <LocationIcon class="text-primary size-5 shrink-0" aria-hidden="true" />
          <h3 class="text-[15px] leading-snug font-semibold">
            {m.association_help_title()}
          </h3>
        </div>
        <ul class="mt-4 space-y-4">
          {#each [
            {
              icon: LocationIcon,
              title: m.association_help_specific_title(),
              body: m.association_help_specific_body(),
            },
            {
              icon: SyncIcon,
              title: m.association_help_sync_title(),
              body: m.association_help_sync_body(),
            },
            {
              icon: SearchIcon,
              title: m.association_help_discover_title(),
              body: m.association_help_discover_body(),
            },
          ] as item}
            <li class="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5">
              <item.icon
                class="text-muted-foreground mt-0.5 size-5"
                aria-hidden="true"
              />
              <div class="space-y-1">
                <p class="text-sm leading-snug font-semibold">{item.title}</p>
                <p class="text-muted-foreground text-sm leading-relaxed">{item.body}</p>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    </SimpleTooltip>
  </div>
  <p class="text-muted-foreground text-xs sm:text-sm">{m.association_subtitle()}</p>
</header>
