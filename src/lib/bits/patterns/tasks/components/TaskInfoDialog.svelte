<script lang="ts">
import { Dialog } from 'bits-ui'
import { m } from '#lib/i18n.js'
import DuplicateIcon from 'virtual:icons/lucide/circle-equal'
import XIcon from 'virtual:icons/proicons/cancel'
import CheckIcon from 'virtual:icons/proicons/checkmark-circle'
import CheckBadgeIcon from 'virtual:icons/proicons/checkmark-starburst'
import EyeOffIcon from 'virtual:icons/proicons/eye-off'
import GhostIcon from 'virtual:icons/lucide/ghost'
import TrashIcon from 'virtual:icons/proicons/delete'
import XCircleIcon from 'virtual:icons/proicons/cancel-circle'
import type { Component } from 'svelte'
import type { TaskType } from '#lib/api/services/taskReview.js'

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

let {
  open = $bindable(false),
  type,
  revisionReviewRequired = false,
}: {
  open?: boolean
  type: TaskType
  revisionReviewRequired?: boolean
} = $props()

const sections = $derived.by((): SectionDescriptor[] => {
  if (type === 'newFeature') {
    return [
      {
        bodyHtml: m.strong_next_zebra_quiz(),
        actions: [
          {
            label: m.alive_north_albatross_lead(),
            descriptionHtml: m.awful_real_newt_lift(),
            icon: XCircleIcon,
            toneClass: 'text-error',
          },
          {
            label: m.task_resolve_duplicate_label(),
            descriptionHtml: m.task_resolve_duplicate_help(),
            icon: DuplicateIcon,
            toneClass: 'text-warning',
          },
          {
            label: m.direct_nimble_buzzard_reside(),
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
            label: m.alive_north_albatross_lead(),
            descriptionHtml: m.great_loose_gull_assure(),
            icon: XCircleIcon,
            toneClass: 'text-error',
          },
          ...(revisionReviewRequired
            ? [{
                label: m.direct_nimble_buzzard_reside(),
                descriptionHtml: m.task_photo_accept_help(),
                icon: CheckIcon,
                toneClass: 'text-success',
              }]
            : [{
                label: m.each_funny_cow_radiate(),
                descriptionHtml: m.mild_deft_larva_absorb(),
                icon: CheckIcon,
                toneClass: 'text-success',
              }, {
                label: m.shy_sunny_hare_revive(),
                descriptionHtml: m.blue_novel_owl_stab(),
                icon: CheckBadgeIcon,
                toneClass: 'text-success',
              }]),
        ],
      },
      { bodyHtml: m.task_photo_tools_help() },
    ]
  }

  return [
    {
      bodyHtml: m.weird_great_barbel_gaze(),
      actions: [
        {
          label: m.alive_north_albatross_lead(),
          descriptionHtml: m.task_missing_reject_help(),
          icon: XCircleIcon,
          toneClass: 'text-error',
        },
        {
          label: m.task_mark_permanently_unavailable(),
          descriptionHtml: m.flat_direct_bobcat_praise(),
          icon: GhostIcon,
          toneClass: 'text-accent',
        },
        {
          label: m.forms__unpublish(),
          descriptionHtml: m.great_sad_rook_cure(),
          icon: EyeOffIcon,
          toneClass: 'text-warning',
        },
        {
          label: m.whole_deft_penguin_enchant(),
          descriptionHtml: m.tired_quick_snake_enjoy(),
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
      class={`fixed left-1/2 top-1/2 z-[1001] w-[min(92vw,50rem)] -translate-x-1/2 -translate-y-1/2 max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-panel p-8 text-foreground shadow-2xl`}
    >
      <div class="flex items-start justify-between gap-6">
        <div class="flex min-w-0 items-center gap-4">
          <Dialog.Title class="text-xl font-semibold tracking-tight text-foreground">
            {m.antsy_patient_moth_taste()}
          </Dialog.Title>


        </div>

        <Dialog.Close
          class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/[0.04] text-foreground/72 transition hover:bg-foreground/[0.08] hover:text-foreground"
          aria-label="Close task information"
        >
          <XIcon class="h-5 w-5" />
        </Dialog.Close>
      </div>

      <div class="mt-6 space-y-6 text-base leading-8 text-foreground/82">
        <div class="space-y-4">
          {#each sections as section, index (`${type}:${section.title ?? index}`)}
              <section class="space-y-4">
                {#if section.title}
                  <h3 class="text-sm font-semibold text-muted-foreground">
                    {section.title}
                  </h3>
                {/if}

                {#if section.bodyHtml}
                  <div class="text-foreground/84">{@html section.bodyHtml}</div>
                {/if}

                {#if section.actions?.length}
                  <div class="space-y-3">
                    {#each section.actions as action (`${action.label}:${action.descriptionHtml}`)}
                      <div
                        class="flex items-start gap-3 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-4 py-3"
                      >
                        <action.icon
                          class={`mt-1 h-5 w-5 shrink-0 ${action.toneClass}`}
                        />
                        <div class="min-w-0">
                          <div class={`font-semibold ${action.toneClass}`}>
                            {action.label}
                          </div>
                          {#if action.descriptionHtml}
                            <div class="text-foreground/72">
                              {@html action.descriptionHtml}
                            </div>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </section>
          {/each}
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
