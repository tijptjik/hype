<script lang="ts">
import { Dialog } from 'bits-ui'
import { m } from '$lib/i18n'
import XIcon from 'virtual:icons/lucide/x'
import CheckIcon from 'virtual:icons/lucide/circle-check'
import CheckBadgeIcon from 'virtual:icons/lucide/badge-check'
import EyeOffIcon from 'virtual:icons/lucide/eye-off'
import GhostIcon from 'virtual:icons/lucide/ghost'
import TrashIcon from 'virtual:icons/lucide/trash-2'
import XCircleIcon from 'virtual:icons/lucide/circle-x'
import type { Component } from 'svelte'
import type { TaskType } from '$lib/types'

type ActionDescriptor = {
  label: string
  descriptionHtml: string
  icon: Component
  toneClass: string
}

type SectionDescriptor = {
  title?: string
  bodyHtml?: string
  actions?: ActionDescriptor[]
}

type NewPhotoInfoTab = 'review' | 'guidance' | 'gallery'

let {
  open = $bindable(false),
  type,
}: {
  open?: boolean
  type: TaskType
} = $props()
let activeNewPhotoTab = $state<NewPhotoInfoTab>('review')

const contentHeightClass = $derived.by(() => {
  if (type === 'newFeature') return 'h-[min(92vh,28rem)]'
  if (type === 'newPhoto') return 'h-[min(92vh,38rem)]'
  return 'h-[min(92vh,52rem)]'
})

const newPhotoTabs: Array<{ id: NewPhotoInfoTab; label: string }> = [
  { id: 'review', label: 'Review' },
  { id: 'guidance', label: 'Tips' },
  { id: 'gallery', label: 'Gallery' },
]

function getNewPhotoTabButtonClass(tabId: NewPhotoInfoTab): string {
  return [
    'rounded-xl px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition',
    activeNewPhotoTab === tabId ? 'bg-white text-black' : 'text-white opacity-65',
  ].join(' ')
}

function getSectionTabId(index: number): NewPhotoInfoTab {
  if (index === 0) return 'review'
  if (index === 1) return 'guidance'
  return 'gallery'
}

const sections = $derived.by((): SectionDescriptor[] => {
  if (type === 'newFeature') {
    return [
      {
        bodyHtml: m.strong_next_zebra_quiz(),
        actions: [
          {
            label: m.quiet_late_worm_startle(),
            descriptionHtml: m.awful_real_newt_lift(),
            icon: XCircleIcon,
            toneClass: 'text-error',
          },
          {
            label: m.quiet_late_worm_startle_accept(),
            descriptionHtml: m.careful_inner_grebe_skip(),
            icon: CheckIcon,
            toneClass: 'text-success',
          },
        ],
      },
    ]
  }

  if (type === 'newPhoto') {
    return [
      {
        bodyHtml: m.few_sunny_wren_push(),
        actions: [
          {
            label: m.quiet_late_worm_startle(),
            descriptionHtml: m.great_loose_gull_assure(),
            icon: XCircleIcon,
            toneClass: 'text-error',
          },
          {
            label: m.each_funny_cow_radiate(),
            descriptionHtml: m.mild_deft_larva_absorb(),
            icon: CheckIcon,
            toneClass: 'text-success',
          },
          {
            label: m.shy_sunny_hare_revive(),
            descriptionHtml: m.blue_novel_owl_stab(),
            icon: CheckBadgeIcon,
            toneClass: 'text-success',
          },
        ],
      },
      {
        bodyHtml: m.happy_acidic_donkey_seek(),
        actions: [
          {
            label: m.proof_keen_swan_dart(),
            descriptionHtml: '',
            icon: CheckBadgeIcon,
            toneClass: 'text-white/72',
          },
          {
            label: m.arable_clear_coyote_sing(),
            descriptionHtml: '',
            icon: CheckBadgeIcon,
            toneClass: 'text-white/72',
          },
          {
            label: m.zesty_same_cat_clip(),
            descriptionHtml: '',
            icon: CheckBadgeIcon,
            toneClass: 'text-white/72',
          },
        ],
      },
      {
        bodyHtml: m.calm_away_panther_propel(),
      },
    ]
  }

  return [
    {
      bodyHtml: m.weird_great_barbel_gaze(),
      actions: [
        {
          label: m.next_main_gecko_heal(),
          descriptionHtml: m.tired_quick_snake_enjoy(),
          icon: GhostIcon,
          toneClass: 'text-accent',
        },
        {
          label: m.lime_house_pig_grasp(),
          descriptionHtml: m.great_sad_rook_cure(),
          icon: EyeOffIcon,
          toneClass: 'text-warning',
        },
        {
          label: m.small_new_bear_ask(),
          descriptionHtml: m.flat_direct_bobcat_praise(),
          icon: TrashIcon,
          toneClass: 'text-error',
        },
      ],
    },
  ]
})
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm" />
    <Dialog.Content
      class={`fixed left-1/2 top-1/2 z-[1001] ${contentHeightClass} w-[min(92vw,50rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/12 bg-neutral-950 p-8 text-white shadow-2xl`}
    >
      <div class="flex items-start justify-between gap-6">
        <div class="flex min-w-0 items-center gap-4">
          <Dialog.Title
            class="text-xl font-semibold uppercase tracking-[0.18em] text-white/92"
          >
            {m.antsy_patient_moth_taste()}
          </Dialog.Title>

          {#if type === 'newPhoto'}
            <div
              class="flex shrink-0 gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5"
            >
              {#each newPhotoTabs as tab (tab.id)}
                <button
                  type="button"
                  class={getNewPhotoTabButtonClass(tab.id)}
                  onclick={() => {
                    activeNewPhotoTab = tab.id
                  }}
                >
                  {tab.label}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <Dialog.Close
          class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/72 transition hover:bg-white/[0.08] hover:text-white"
          aria-label="Close task information"
        >
          <XIcon class="h-5 w-5" />
        </Dialog.Close>
      </div>

      <div class="mt-6 space-y-6 text-base leading-8 text-white/82">
        <div class="min-h-[24rem] space-y-4">
          {#each sections as section, index (`${type}:${section.title ?? index}`)}
            {#if type !== 'newPhoto' || activeNewPhotoTab === getSectionTabId(index)}
              <section class="space-y-4">
                {#if section.title}
                  <h3
                    class="text-center text-sm font-semibold uppercase tracking-[0.22em] text-white/60"
                  >
                    {section.title}
                  </h3>
                {/if}

                {#if section.bodyHtml}
                  <div class="text-white/84">{@html section.bodyHtml}</div>
                {/if}

                {#if section.actions?.length}
                  <div class="space-y-3">
                    {#each section.actions as action (`${action.label}:${action.descriptionHtml}`)}
                      <div
                        class="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                      >
                        <svelte:component
                          this={action.icon}
                          class={`mt-1 h-5 w-5 shrink-0 ${action.toneClass}`}
                        />
                        <div class="min-w-0">
                          <div class={`font-semibold ${action.toneClass}`}>
                            {action.label}
                          </div>
                          {#if action.descriptionHtml}
                            <div class="text-white/72">
                              {@html action.descriptionHtml}
                            </div>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </section>
            {/if}
          {/each}
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
