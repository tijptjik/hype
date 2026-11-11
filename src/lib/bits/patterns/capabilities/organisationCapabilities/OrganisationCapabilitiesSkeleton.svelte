<script lang="ts">
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
// STYLES
import { resourceTabsStyles } from '#lib/bits/patterns/forms/formSurface/resourceTabs.styles.js'
import { formSectionDividerStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
import { formSearchHeaderStyles } from '#lib/bits/patterns/forms/formSurface/formSearchHeader.styles.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import UsersIcon from 'virtual:icons/proicons/person-multiple'
import ShieldIcon from 'virtual:icons/proicons/shield-checkmark'
import LanguagesIcon from 'virtual:icons/tabler/language'
</script>

<FormSurface class={`${resourceTabsStyles} flex min-h-0 flex-1 flex-col`}>
  <div
    role="status"
    aria-label={m.resource_loading()}
    aria-busy="true"
    class="grid flex-1 grid-rows-[repeat(2,minmax(min-content,1fr))]"
  >
    <div class="grid min-h-0 grid-cols-1 lg:grid-cols-2">
      <section
        class="border-border flex min-w-0 flex-col border-b lg:border-r lg:border-b-0"
      >
        <SectionHeader
          icon={UsersIcon}
          title="Users"
          description="Choose how people become users of your organisation."
        />
        <div class="p-4 lg:p-6">
          <div class="@container min-w-0 space-y-4" aria-hidden="true">
            <div
              class="border-border bg-foreground/4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">
                  Enable Users specific to this Organisation
                </p>
                <p class="text-muted-foreground mt-1 text-xs">
                  Keep a separate user list for this organisation.
                </p>
              </div>
              <Skeleton class="h-6 w-12 rounded-full" />
            </div>
            <!-- Reserve the enabled policy's four join options before its saved state arrives. -->
            <div
              class="border-border bg-foreground/4 min-w-0 rounded-xl border px-5 py-4"
            >
              <h3 class="text-sm font-medium">How users join</h3>
              <p class="text-muted-foreground mt-1 text-xs">
                Users can join through any of the selected options.
              </p>
              <div class="mt-2 grid min-w-0 gap-x-6 @min-[38rem]:grid-cols-2">
                {#each [
                  ['Hub Sign-in', 'Add users when they sign in through the hub.'],
                  [
                    'Hub Domain Email',
                    'Add users with a verified email address ending in the hub domain.',
                  ],
                  [
                    'Project Contribution',
                    'Submitting a feature, photo or missing report adds the user immediately, before review.',
                  ],
                  [
                    'Custom Card Trigger',
                    'Add users when they trigger the onboarding step in the custom card.',
                  ],
                ] as [label, description]}
                  <div
                    class="border-border/20 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-t py-4"
                  >
                    <div class="min-w-0 break-words whitespace-normal">
                      <div class="flex items-start gap-2 text-sm font-medium">
                        <Skeleton class="mt-0.5 size-4 shrink-0" />
                        <span class="min-w-0">{label}</span>
                      </div>
                      <p class="text-muted-foreground mt-1 text-xs">{description}</p>
                    </div>
                    <Skeleton class="h-6 w-12 rounded-full" />
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section
        class="bits-form__section bits-form__parent-resource bits-form__capabilities-section @container flex min-h-0 flex-col"
      >
        <SectionHeader
          icon={ShieldIcon}
          title={m.resources__capabilities()}
          description={m.admin__forms_capabilities_add_subtitle()}
          class={`bits-form__capabilities-header ${formSearchHeaderStyles}`}
        />
        <div
          class="bits-form__parent-resource-list bits-form__capabilities-list pt-2"
          aria-hidden="true"
        >
          {#each [0, 1, 2] as row}
            <div
              class="border-border/40 flex min-h-14 items-center gap-4 border-b px-3 last:border-b-0"
            >
              <Skeleton class="size-5 shrink-0" />
              <Skeleton
                class={row === 2 ? 'h-4 w-40 max-w-full' : 'h-4 w-32 max-w-full'}
              />
              <div class="ml-auto size-10 shrink-0"></div>
            </div>
          {/each}
        </div>
      </section>
    </div>
    <div class={formSectionDividerStyles}>
      <section>
        <SectionHeader
          title="Capability I18n"
          description={m.admin__forms_capabilities_labels_subtitle()}
          icon={LanguagesIcon}
          class="mb-4 grid-cols-1! gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]! [&_.bits-form\_\_section-header-right]:[container-type:normal]! [&_.bits-form\_\_section-header-right]:block [&_.bits-form\_\_section-header-right]:min-w-0"
        >
          {#snippet right()}
            <LocaleToolbar
              selectedLocales={[]}
              visibleLocales={[]}
              options={[]}
              expanded={false}
              disabled
              allowAdd={false}
              onExpandedChange={() => {}}
              onChange={() => {}}
            />
          {/snippet}
        </SectionHeader>
        <div class="@container/capability-labels" aria-hidden="true">
          <div
            class="grid min-w-0 grid-cols-1 gap-x-6 gap-y-8 px-6 pb-6 @min-[40rem]/capability-labels:grid-cols-2 @min-[64rem]/capability-labels:grid-cols-3"
          >
            {#each [0, 1, 2] as _}
              <div class="min-w-0">
                <div class="mb-2 flex min-h-7 items-center">
                  <Skeleton class="h-3 w-28" />
                </div>
                <div class="flex min-h-10 items-center px-3">
                  <Skeleton class="h-4 w-36 max-w-full" />
                </div>
              </div>
            {/each}
          </div>
        </div>
      </section>
    </div>
  </div>
</FormSurface>
