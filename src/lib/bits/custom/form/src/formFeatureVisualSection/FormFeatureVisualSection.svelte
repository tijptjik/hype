<script lang="ts">
import { Button } from '#lib/bits/core/button/index.js'
import { cx } from '#lib/bits/utils.js'
import { InfoDialog } from '#lib/bits/core/dialog/index.js'
import { Separator } from '#lib/bits/core/separator/index.js'
import * as Main from '../../../main'
import { m } from '#lib/i18n.js'
import { SwapField } from '#lib/bits/patterns/forms/swapField/index.js'
import UserAttributionCard from '#lib/bits/patterns/cards/userAttributionCard/UserAttributionCard.svelte'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import { resolveAvatarImageSrc } from '#lib/utils/avatar.js'
import type { FormFeatureVisualSectionProps } from './formFeatureVisualSection.types'
import ChevronLeftIcon from 'virtual:icons/proicons/chevron-left'
import ChevronRightIcon from 'virtual:icons/proicons/chevron-right'
import ExpandIcon from 'virtual:icons/proicons/full-screen-maximize'
import GhostIcon from 'virtual:icons/lucide/ghost'
import InfoIcon from 'virtual:icons/proicons/info'
import OctagonMinusIcon from 'virtual:icons/proicons/do-not-disturb'
import ShrinkIcon from 'virtual:icons/proicons/full-screen-minimize'

let {
  class: className = '',
  expandedHeight = 520,
  minimumHeight = 64,
  showImage = true,
  showControls = true,
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
  onHeightChange,
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
let visualSection: Main.VisualSection | undefined

/** Balance the adjacent editor with a visible, draggable map.
 * @param overflow Hidden editor height, or negative spare space, in CSS pixels. @returns Nothing.
 */
export function makeRoom(overflow: number): void {
  visualSection?.makeRoom(overflow)
}

/** Restore the map's size before association review when discovery results reopen.
 * @param targetHeight Desired height when a resumed draft has no snapshot.
 * @returns Nothing.
 */
export function restoreAfterFit(targetHeight?: number): void {
  visualSection?.restoreAfterFit(targetHeight)
}
/** Capture map size before direct address acceptance as well as association review.
 * @returns Nothing.
 */
export function rememberHeight(): void {
  visualSection?.rememberHeight()
}
</script>

<Main.VisualSection
  bind:this={visualSection}
  {minimumHeight}
  showImage={!isNewFeature && showImage}
  {showControls}
  {onHeightChange}
  class={rootClass}
  {imageAspectRatio}
  {isCollapsed}
  resizeLabel={m.feature_visual_resize()}
  {expandedHeight}
  collapsedHeight={minimumHeight}
>
  {#snippet leftControls()}
    {#if isNewFeature && contributorUser}
      <article class="inline-flex items-center">
        <img
          class="relative z-10 h-12 w-12 shrink-0 rounded-full bg-[color:color-mix(in_oklab,var(--color-foreground)_16%,transparent)] object-cover shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-foreground)_12%,transparent)]"
          src={resolveAvatarImageSrc(contributorUser.image) ?? ''}
          alt={contributorUser.name ??
            contributorUser.attribution ??
            m.user__current_user()}
        >
        <div
          class="bg-panel text-foreground -ml-12 flex h-11 max-w-none min-w-max flex-col justify-center gap-0.5 rounded-full border border-[color:color-mix(in_oklab,var(--color-foreground)_12%,transparent)] py-0.5 pr-4 pl-14 backdrop-blur-[14px]"
        >
          <span class="text-[0.9375rem] leading-[1.1] font-semibold whitespace-nowrap">
            {contributorUser.name ??
              contributorUser.attribution ??
              m.user__current_user()}
          </span>
          <span
            class="flex items-center gap-[0.35rem] text-[0.8125rem] leading-none whitespace-nowrap text-[color:color-mix(in_oklab,var(--color-foreground)_65%,transparent)]"
          >
            {m.profile__role_type__contributor()}
          </span>
        </div>
      </article>
    {:else}
      <UserAttributionCard
        userId={contributorId}
        date={createdAt ?? undefined}
        type="contributor"
        isOpen={true}
      />
    {/if}
  {/snippet}

  {#snippet centerControls()}
    <div
      class="bg-panel text-foreground inline-flex min-h-11 items-center gap-1 rounded-full border border-[color:color-mix(in_oklab,var(--color-foreground)_12%,transparent)] px-2.5 py-1 backdrop-blur-[14px]"
    >
      <SimpleTooltip>
        {#snippet trigger()}
          <div class="inline-flex h-11 w-11 min-w-10 items-center justify-center">
            <SwapField
              checked={Boolean(isIntangible)}
              disabled={!isEditing}
              size="sm"
              class="[&_[data-ui=swap][data-state=checked]]:bg-primary! [&_[data-ui=swap][data-state=checked]]:text-primary-content! inline-flex h-10 w-10 min-w-10 transform-none items-center justify-center [&_.bits-swap-field]:inline-flex [&_.bits-swap-field]:h-10 [&_.bits-swap-field]:w-10 [&_.bits-swap-field]:items-center [&_.bits-swap-field]:justify-center [&_[data-ui=swap]]:h-10 [&_[data-ui=swap]]:min-h-10 [&_[data-ui=swap]]:w-10 [&_[data-ui=swap]]:min-w-10 [&_[data-ui=swap]]:border-none [&_[data-ui=swap]]:bg-transparent [&_[data-ui=swap]]:p-0 [&_[data-ui=swap]]:shadow-none [&_[data-ui=swap]:disabled]:border-none [&_[data-ui=swap]:disabled]:bg-transparent [&_[data-ui=swap]:disabled]:shadow-none [&_[data-ui=swap][data-state=checked]]:border-none [&_[data-ui=swap][data-state=checked]]:opacity-100! [&_[data-ui=swap][data-state=checked]]:shadow-none"
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
              class="[&_[data-ui=swap][data-state=checked]]:bg-error! [&_[data-ui=swap][data-state=checked]]:text-error-content! inline-flex h-10 w-10 min-w-10 transform-none items-center justify-center [&_.bits-swap-field]:inline-flex [&_.bits-swap-field]:h-10 [&_.bits-swap-field]:w-10 [&_.bits-swap-field]:items-center [&_.bits-swap-field]:justify-center [&_[data-ui=swap]]:h-10 [&_[data-ui=swap]]:min-h-10 [&_[data-ui=swap]]:w-10 [&_[data-ui=swap]]:min-w-10 [&_[data-ui=swap]]:border-none [&_[data-ui=swap]]:bg-transparent [&_[data-ui=swap]]:p-0 [&_[data-ui=swap]]:shadow-none [&_[data-ui=swap]:disabled]:border-none [&_[data-ui=swap]:disabled]:bg-transparent [&_[data-ui=swap]:disabled]:shadow-none [&_[data-ui=swap][data-state=checked]]:border-none [&_[data-ui=swap][data-state=checked]]:opacity-100! [&_[data-ui=swap][data-state=checked]]:shadow-none"
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
        class="mx-0 mx-2 my-0 block h-6 bg-[color:color-mix(in_oklab,var(--color-foreground)_30%,transparent)]"
      />

      <InfoDialog
        title={m.antsy_patient_moth_taste()}
        triggerText=""
        triggerIconComponent={InfoIcon}
        triggerIconClasses="h-[22px] w-[22px] text-foreground hover:text-primary"
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
      class="bg-panel text-foreground inline-flex min-h-11 items-center gap-2 rounded-full border border-[color:color-mix(in_oklab,var(--color-foreground)_12%,transparent)] px-2.5 py-1 backdrop-blur-[14px]"
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
        class="h-10 w-6 !border-0 !bg-transparent p-0 text-[var(--color-foreground)] shadow-none transition-[background-color,opacity] duration-180 ease-out disabled:opacity-35"
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
        class="h-10 w-6 hover:text-white disabled:opacity-35"
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
