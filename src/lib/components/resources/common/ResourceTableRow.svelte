<script lang="ts" generics="T extends Resource">
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// COMPONENTS
import ScrollableText from '$lib/components/common/ScrollableText.svelte';
// NAVIGATION
import { navigateOnAdminById, getUrlForResource } from '$lib/navigation';
// SERVICES
import { getURLfromImage } from '$lib/client/services/image';
// LIB
import { hashicon } from '@emeraldpay/hashicon';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { Resource } from '$lib/types';
import type { Snippet } from 'svelte';

let {
  entity,
  index,
  row
}: {
  entity: T;
  index: number;
  row?: Snippet<[T, number]>;
} = $props();

// CONTEXT
const adminCtx = getAdminCtx();

// Generate hashicon URL for fallback
const getHashiconUrl = (id: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  hashicon(id, { size: 64, createCanvas: () => canvas });
  return canvas.toDataURL();
};
</script>

<div class="px-2 py-1">
  {#if row}
    {@render row(entity, index)}
  {:else}
    {@const resourceType = adminCtx.activeResourceType as FirstClassResource}
    {@const href = getUrlForResource(adminCtx, resourceType, entity.id)}
    <a
      {href}
      onclick={(e) => {
        e.preventDefault();
        navigateOnAdminById(adminCtx, resourceType, entity.id);
      }}
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          navigateOnAdminById(adminCtx, resourceType, entity.id);
        }
      }}
      role="button"
      tabindex="0"
      class="block w-full cursor-pointer rounded-lg bg-glass-result p-2 shadow-sm transition-shadow hover:shadow-md focus:ring-2 focus:ring-offset-2 focus:ring-offset-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-secondary">
      <div class="flex items-center gap-4">
        <div class="relative h-16 w-16 flex-shrink-0">
          {#if (entity as any).image}
            <img
              src={getURLfromImage({
                image: (entity as any).image,
                transformation: 'c_fill,w_100,h_100,q_auto'
              })}
              alt={getI18n(
                entity as Record<'i18n', any>,
                'name',
                adminCtx.appCtx.getUserPreferences()
              ) ?? entity.id}
              class="h-full w-full rounded-md object-cover" />
          {:else}
            <img
              src={getHashiconUrl(entity.id)}
              alt={getI18n(
                entity as Record<'i18n', any>,
                'name',
                adminCtx.appCtx.getUserPreferences()
              ) ?? entity.id}
              class="h-full w-full rounded-md object-cover" />
          {/if}
        </div>
        <div class="flex flex-1 items-center justify-between overflow-hidden pr-4">
          <div class="flex flex-col overflow-hidden">
            <h3 class="font-medium text-base-content">
              {getI18n(
                entity as Record<'i18n', any>,
                'name',
                adminCtx.appCtx.getUserPreferences()
              ) ?? entity.id}
            </h3>
            <p class="w-full truncate text-sm text-base-content/60">
              <ScrollableText
                text={getI18n(
                  entity as Record<'i18n', any>,
                  'description',
                  adminCtx.appCtx.getUserPreferences()
                ) ?? ''} />
            </p>
          </div>
          <div class="ml-4 flex items-center">
            <span
              class="badge rounded-lg bg-base-200 px-3 py-3 text-xs uppercase"
              class:text-orange-500={(entity as any).isPendingReview}
              class:text-ok={(entity as any).isPublished}
              class:text-error={!(entity as any).isPublished &&
                !(entity as any).isPendingReview}>
              {(entity as any).isPendingReview
                ? m.tangy_zany_capybara_arise()
                : (entity as any).isPublished
                  ? m.yummy_ornate_snail_bend()
                  : m.weak_super_guppy_nail()}
            </span>
          </div>
        </div>
      </div>
    </a>
  {/if}
</div>
