<script lang="ts">
// SVELTE
import { goto } from '$app/navigation';
import { page } from '$app/state';
// I18N
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// LIB
import { ADMIN_PATH } from '$lib/index';
import { hashicon } from '@emeraldpay/hashicon';
// SERVICES
import { getURLfromImage } from '$lib/client/services/image';
import { getUrlForResource } from '$lib/navigation';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import Image from '$lib/components/common/Image.svelte';
import ScrollableText from '$lib/components/common/ScrollableText.svelte';
// TYPES
import type { Snippet } from 'svelte';
import type {
  Resource,
  ImageDB,
  Task,
  KeyMap,
  EntityWithOptionalImage
} from '$lib/types';

type Props = {
  entity: EntityWithOptionalImage;
  keyMap: KeyMap;
  header?: Snippet;
  content?: Snippet;
  actions?: Snippet;
  footer?: Snippet;
  onImageClick?: (entity: Exclude<Resource, Task>) => void;
};

let { entity, keyMap, header, content, actions, footer, onImageClick }: Props =
  $props();
let locale = $derived(getLocale());

// Utility function to get nested property values using dot notation
const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((current, key) => {
    if (!current || current[key] === undefined) {
      return undefined;
    }
    let value = current[key];
    // If the value is an array, take the first element
    if (Array.isArray(value) && value.length > 0) {
      value = value[0];
    }
    return value;
  }, obj);
};

// Get i18n object - support nested paths like 'hub.organisation.i18n'
const getI18nObject = (entity: any, locale: string, fieldPath?: string) => {
  // Use the specific field path if provided, otherwise fall back to title path
  const pathToCheck = fieldPath || keyMap.title;

  // Check if this is a nested i18n path (has something before .i18n)
  if (pathToCheck.includes('.i18n.') && !pathToCheck.startsWith('i18n.')) {
    // Extract the base path before .i18n (e.g., 'organisations' from 'organisations.i18n.name')
    const basePath = pathToCheck.substring(0, pathToCheck.indexOf('.i18n'));
    const baseObject = getNestedValue(entity, basePath);
    return baseObject?.i18n?.[locale] || {};
  }
  // Default behavior - use entity's direct i18n (for paths like 'i18n.name')
  return entity.i18n?.[locale] || {};
};

// Helper function to get the actual property value from keyMap
const getPropertyValue = (entity: any, keyPath: string, useI18n = true): any => {
  if (useI18n && (keyPath.includes('.i18n.') || keyPath.startsWith('i18n.'))) {
    // Get the i18n object for this specific field path
    const fieldI18nObject = getI18nObject(entity, locale, keyPath);
    // Extract the property name after .i18n
    const propertyName = keyPath.includes('.i18n.')
      ? keyPath.split('.i18n.')[1]
      : keyPath.split('i18n.')[1]; // Handle 'i18n.name' format
    return propertyName ? fieldI18nObject[propertyName] : '';
  }
  const result = getNestedValue(entity, keyPath);
  return result;
};

const adminCtx = getAdminCtx();

const href = $derived(
  adminCtx.activeResourceType
    ? `${getUrlForResource(
        adminCtx,
        adminCtx.activeResourceType,
        entity.id
      )}${page.url.search}`
    : null
);

// Generate hashicon URL for fallback
const getHashiconUrl = (id: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  hashicon(id, { size: 400, createCanvas: () => canvas });
  return canvas.toDataURL();
};

const onclick = (e: MouseEvent | KeyboardEvent) => {
  e.preventDefault();
  if (href) {
    adminCtx.setFacet('core');
    goto(href);
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    onclick(e);
  } else if (e.key === ' ' && onImageClick && entity.image) {
    e.preventDefault();
    onImageClick(entity);
  } else if (e.key === ' ') {
    // Fallback to click for cards without image action
    e.preventDefault();
    onclick(e);
  }
};
</script>

<div
  draggable="false"
  role="article"
  tabindex="0"
  class="duration-800 hover:scale-1 bg-grain card flex select-none flex-col gap-4 rounded-xl bg-glass-neutral shadow-[0_0_25px_rgba(0,0,0,0.25)] transition-shadow hover:shadow-[0_0_25px_theme(colors.primary)] focus-visible:shadow-[0_0_25px_theme(colors.primary)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-secondary active:outline-none"
  onkeydown={handleKeyDown}
  {onclick}>
  <!-- Header Section -->
  {#if header}
    {@render header()}
  {:else}
    <div
      class="cursor-pointer overflow-hidden rounded-t-xl"
      onclick={(e) => {
        if (onImageClick && entity.image) {
          e.stopPropagation();
          onImageClick(entity);
        }
      }}>
      <Image
        src={getNestedValue(entity, keyMap.image)
          ? getURLfromImage({
              image: getNestedValue(entity, keyMap.image) as ImageDB
            })
          : getHashiconUrl(entity.id)}
        alt={getPropertyValue(entity, keyMap.title)}
        layout="cover" />
    </div>
  {/if}
  <!-- Content Section -->
  <div class="card-body w-full gap-0 px-6 py-0">
    {#if content}
      {@render content()}
    {:else}
      {#if keyMap.subtitle}
        <small class="my-0 py-0 text-sm text-primary"
          >{getPropertyValue(entity, keyMap.subtitle)}</small>
      {/if}
      <h2 class="card-title mt-0 pt-0">
        <ScrollableText text={getPropertyValue(entity, keyMap.title)} />
      </h2>
      <p class="text-neutral-content">
        <ScrollableText
          text={getPropertyValue(entity, keyMap.description) ||
            m.loved_spare_hyena_imagine()} />
      </p>
    {/if}

    <!-- Actions Section -->
    {#if actions}
      <div class="mt-2 flex w-full flex-row items-center justify-between">
        {@render actions()}
      </div>
    {/if}
  </div>
  <!-- Footer Section -->
  <footer
    class="flex w-full flex-row items-center justify-between rounded-b-xl bg-glass-result px-6 py-2">
    {#if footer}
      {@render footer()}
    {:else}
      <div class="font-mono text-xs uppercase tracking-wider text-neutral-content">
        {#if 'isPublished' in entity && entity.isPublished !== undefined}
          {#if entity.isPublished}
            <span class="text-ok">{m.long_zippy_felix_mix()}</span>
          {:else}
            <span class="text-error">{m.weak_super_guppy_nail()}</span>
          {/if}
          <!-- HUB -->
        {:else if 'domain' in entity}
          <div class="font-mono text-xs uppercase text-neutral-content">
            {entity.organisations?.map((org) => org.code).join(', ')}
          </div>
        {/if}
      </div>
      <div class="flex flex-row items-center gap-2">
        {#if 'isVisitable' in entity && entity.isVisitable !== undefined}
          <div class="font-mono text-xs uppercase text-neutral-content">
            {entity.isVisitable ? 'Visitable' : 'Not Visitable'}
          </div>
        {/if}
      </div>
    {/if}
  </footer>
</div>
