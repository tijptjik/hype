<script lang="ts">
import type { FormFieldsSectionLoadingItem } from '../formFieldsSection.types'

let {
  items = [],
}: {
  items?: FormFieldsSectionLoadingItem[]
} = $props()

const fallbackLoadingItems: FormFieldsSectionLoadingItem[] = [
  { id: 'loading-header-0', presentation: 'header', isCollapsed: true },
  { id: 'loading-full-1', presentation: 'full', isCollapsed: false },
  { id: 'loading-header-2', presentation: 'header', isCollapsed: true },
]

const loadingItems = $derived(items.length > 0 ? items : fallbackLoadingItems)
</script>

<div class="bits-project-fields__loading" aria-hidden="true">
  {#each loadingItems as item (item.id)}
    <article class="bits-project-field-card bits-project-field-card--skeleton">
      <div
        class="bits-project-field-card__header bits-project-field-card__header--skeleton"
      >
        <div class="bits-project-field-card__skeleton-rail">
          <div class="bits-project-field-card__skeleton-dot"></div>
          <div class="bits-project-field-card__skeleton-pill"></div>
        </div>
        <div class="bits-project-field-card__skeleton-title-wrap">
          <div class="bits-project-field-card__skeleton-title"></div>
          <div class="bits-project-field-card__skeleton-subtitle"></div>
        </div>
        <div class="bits-project-field-card__skeleton-actions">
          <div class="bits-project-field-card__skeleton-action"></div>
          <div class="bits-project-field-card__skeleton-action"></div>
          <div class="bits-project-field-card__skeleton-action"></div>
        </div>
      </div>

      {#if item.presentation === 'full' && !item.isCollapsed}
        <div
          class="bits-project-field-card__body bits-project-field-card__body--skeleton"
        >
          <div class="bits-project-field-card__skeleton-grid">
            <div
              class="bits-project-field-card__skeleton-line bits-project-field-card__skeleton-line--wide"
            ></div>
            <div class="bits-project-field-card__skeleton-line"></div>
            <div class="bits-project-field-card__skeleton-line"></div>
            <div
              class="bits-project-field-card__skeleton-line bits-project-field-card__skeleton-line--short"
            ></div>
          </div>
        </div>
      {/if}
    </article>
  {/each}
</div>
