<script lang="ts">
import { Button } from '$lib/bits/core/button'
import { cx } from '$lib/bits/utils'
import { InfoDialog } from '$lib/bits/core/dialog'
import { Separator } from '$lib/bits/core/separator'
import * as Main from '../../../main'
import { m } from '$lib/i18n'
import { SwapField } from '$lib/bits/patterns/forms/swapField'
import UserAttributionCard from '$lib/bits/patterns/cards/userAttributionCard/UserAttributionCard.svelte'
import SimpleTooltip from '$lib/bits/core/tooltip/SimpleTooltip.svelte'
import { resolveAvatarImageSrc } from '$lib/utils/avatar'
import type { FormFeatureVisualSectionProps } from './formFeatureVisualSection.types'
import ChevronLeftIcon from 'virtual:icons/lucide/chevron-left'
import ChevronRightIcon from 'virtual:icons/lucide/chevron-right'
import ExpandIcon from 'virtual:icons/lucide/expand'
import GhostIcon from 'virtual:icons/lucide/ghost'
import InfoIcon from 'virtual:icons/lucide/info'
import OctagonMinusIcon from 'virtual:icons/lucide/octagon-minus'
import ShrinkIcon from 'virtual:icons/lucide/shrink'

let {
  class: className = '',
  hasPresentedCanonicalImageSizing = false,
  isCanonicalImagePending = false,
  imageAspectRatio = null,
  isCollapsed = false,
  isNewFeature = false,
  contributorUser = null,
  contributorId = null,
  createdAt = null,
  isEditing = true,
  isIntangible = false,
  isVisitable = true,
  hasPrevious = false,
  hasNext = false,
  onIntangibleChange,
  onVisitableChange,
  onExpand,
  onCollapse,
  onNavigatePrevious,
  onNavigateNext,
  map,
  image,
}: FormFeatureVisualSectionProps = $props()

const rootClass = $derived(
  cx(
    'bits-feature-editor__visual',
    hasPresentedCanonicalImageSizing && 'bits-feature-editor__visual--image-loaded',
    isCanonicalImagePending && 'bits-feature-editor__visual--image-pending',
    className,
  ),
)
</script>

<Main.VisualSection
  class={rootClass}
  {imageAspectRatio}
  {isCollapsed}
  expandedHeight={520}
  collapsedHeight={64}
>
  {#snippet leftControls()}
    {#if isNewFeature && contributorUser}
      <article class="inline-flex items-center">
        <img
          class="h-12 w-12 shrink-0 rounded-full bg-[color:color-mix(in_oklab,var(--color-base-content)_16%,transparent)] object-cover shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-base-content)_12%,transparent)]"
          src={resolveAvatarImageSrc(contributorUser.image) ?? ''}
          alt={contributorUser.name ?? contributorUser.attribution ?? m.user__current_user()}
        >
        <div
          class="-ml-12 flex h-11 min-w-max max-w-none flex-col justify-center gap-0.5 rounded-full border border-[color:color-mix(in_oklab,var(--color-base-content)_12%,transparent)] bg-[color:color-mix(in_oklab,black_82%,var(--color-glass-result)_18%)] py-0.5 pr-4 pl-14 backdrop-blur-[14px]"
        >
          <span class="whitespace-nowrap text-[0.9375rem] leading-[1.1] font-semibold">
            {contributorUser.name ?? contributorUser.attribution ?? m.user__current_user()}
          </span>
          <span
            class="flex items-center gap-[0.35rem] whitespace-nowrap text-[0.8125rem] leading-none text-[color:color-mix(in_oklab,var(--color-base-content)_65%,transparent)]"
          >
            {m.profile__role_type__contributor()}
          </span>
        </div>
      </article>
    {:else}
      <UserAttributionCard
        userId={contributorId}
        date={createdAt}
        type="contributor"
        isOpen={true}
      />
    {/if}
  {/snippet}

  {#snippet centerControls()}
    <div
      class="inline-flex min-h-11 items-center gap-1 rounded-full border border-[color:color-mix(in_oklab,var(--color-base-content)_12%,transparent)] bg-[color:color-mix(in_oklab,black_84%,var(--color-glass-result)_16%)] px-2.5 py-1 backdrop-blur-[14px]"
    >
      <SimpleTooltip>
        {#snippet trigger()}
          <div class="inline-flex h-11 w-11 min-w-10 items-center justify-center">
            <SwapField
              checked={Boolean(isIntangible)}
              disabled={!isEditing}
              size="sm"
              class="inline-flex h-10 w-10 min-w-10 items-center justify-center transform-none [&_.bits-swap-field]:inline-flex [&_.bits-swap-field]:h-10 [&_.bits-swap-field]:w-10 [&_.bits-swap-field]:items-center [&_.bits-swap-field]:justify-center [&_[data-ui=swap]]:h-10 [&_[data-ui=swap]]:min-h-10 [&_[data-ui=swap]]:w-10 [&_[data-ui=swap]]:min-w-10 [&_[data-ui=swap]]:border-none [&_[data-ui=swap]]:bg-transparent [&_[data-ui=swap]]:p-0 [&_[data-ui=swap]]:shadow-none [&_[data-ui=swap][data-state=checked]]:border-none [&_[data-ui=swap][data-state=checked]]:bg-transparent [&_[data-ui=swap][data-state=checked]]:shadow-none [&_[data-ui=swap]:disabled]:border-none [&_[data-ui=swap]:disabled]:bg-transparent [&_[data-ui=swap]:disabled]:shadow-none"
              label={m.feature__intangible()}
              onColor="accent"
              offColor="dark"
              onIcon={GhostIcon}
              offIcon={GhostIcon}
              onCheckedChange={value => onIntangibleChange?.(value)}
            />
          </div>
        {/snippet}
        {m.feature__intangible()}
      </SimpleTooltip>

      <SimpleTooltip>
        {#snippet trigger()}
          <div class="inline-flex h-11 w-11 min-w-10 items-center justify-center">
            <SwapField
              checked={!isVisitable}
              disabled={!isEditing}
              size="sm"
              class="inline-flex h-10 w-10 min-w-10 items-center justify-center transform-none [&_.bits-swap-field]:inline-flex [&_.bits-swap-field]:h-10 [&_.bits-swap-field]:w-10 [&_.bits-swap-field]:items-center [&_.bits-swap-field]:justify-center [&_[data-ui=swap]]:h-10 [&_[data-ui=swap]]:min-h-10 [&_[data-ui=swap]]:w-10 [&_[data-ui=swap]]:min-w-10 [&_[data-ui=swap]]:border-none [&_[data-ui=swap]]:bg-transparent [&_[data-ui=swap]]:p-0 [&_[data-ui=swap]]:shadow-none [&_[data-ui=swap][data-state=checked]]:border-none [&_[data-ui=swap][data-state=checked]]:bg-transparent [&_[data-ui=swap][data-state=checked]]:shadow-none [&_[data-ui=swap]:disabled]:border-none [&_[data-ui=swap]:disabled]:bg-transparent [&_[data-ui=swap]:disabled]:shadow-none"
              label={m.feature__cannot_visit()}
              onColor="error"
              offColor="dark"
              onIcon={OctagonMinusIcon}
              offIcon={OctagonMinusIcon}
              onCheckedChange={value => onVisitableChange?.(!value)}
            />
          </div>
        {/snippet}
        {m.feature__cannot_visit()}
      </SimpleTooltip>

      <Separator
        orientation="vertical"
        decorative={true}
        class="mx-0 my-0 block h-6 bg-[color:color-mix(in_oklab,var(--color-base-content)_30%,transparent)] mx-2"
      />

      <InfoDialog
        title={m.antsy_patient_moth_taste()}
        triggerText=""
        triggerIconComponent={InfoIcon}
        triggerIconClasses="h-[22px] w-[22px] text-white hover:text-primary"
      >
        <section>
          <h3 class="font-bold">{m.antsy_patient_moth_taste()}</h3>
          <p>{@html m.home_legal_trout_hurl()}</p>
        </section>
        <section>
          <h3 class="font-bold">{m.feature__classification()}</h3>
          <p>{m.weak_main_earthworm_thrive()}</p>
        </section>
        <section>
          <h3 class="font-bold">{m.feature__specification()}</h3>
          <p>{m.less_new_crocodile_dust()}</p>
        </section>
      </InfoDialog>

      <Button
        text={isCollapsed
          ? m.admin__forms_common_expand()
          : m.admin__forms_common_collapse()}
        iconComponent={isCollapsed ? ExpandIcon : ShrinkIcon}
        color="dark"
        style="transparent"
        size="sm"
        hideLabel={true}
        hideLabelInstantly={true}
        iconClasses="h-5.5 w-5.5 hover:text-primary"
        class="-ml-2 pr-3"
        attrs={{ 'aria-expanded': !isCollapsed }}
        onClick={() => {
          if (isCollapsed) {
            onExpand?.()
            return
          }

          onCollapse?.()
        }}
      />
    </div>
  {/snippet}

  {#snippet rightControls()}
    <div
      class="inline-flex min-h-11 items-center gap-2 rounded-full border border-[color:color-mix(in_oklab,var(--color-base-content)_12%,transparent)] bg-[color:color-mix(in_oklab,black_84%,var(--color-glass-result)_16%)] px-2.5 py-1 backdrop-blur-[14px]"
    >
      <Button
        text={m.slimy_helpful_shad_vent()}
        iconComponent={ChevronLeftIcon}
        color="dark"
        style="transparent"
        size="sm"
        hideLabel={true}
        hideLabelInstantly={true}
        disabled={!hasPrevious}
        iconClasses="h-5.5 w-5.5"
        class="h-10 w-6 !border-0 !bg-transparent p-0 text-[var(--color-base-content)] shadow-none transition-[background-color,opacity] duration-180 ease-out disabled:opacity-35"
        onClick={() => onNavigatePrevious?.()}
      />
      <Button
        text={m.curly_flaky_panther_mop()}
        iconComponent={ChevronRightIcon}
        color="dark"
        style="transparent"
        size="sm"
        hideLabel={true}
        hideLabelInstantly={true}
        disabled={!hasNext}
        iconClasses="h-5.5 w-5.5"
        class="h-10 w-6 disabled:opacity-35 hover:text-white"
        onClick={() => onNavigateNext?.()}
      />
    </div>
  {/snippet}

  {#snippet map()}
    {@render map?.()}
  {/snippet}

  {#snippet image()}
    {@render image?.()}
  {/snippet}
</Main.VisualSection>
