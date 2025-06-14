<script lang="ts">
// SVELTE
import { goto } from '$app/navigation';
import { page } from '$app/state';
// I18N
import { getLocale } from '$lib/i18n';
// LIB
import { ADMIN_PATH } from '$lib/index';
import { hashicon } from '@emeraldpay/hashicon';
// SERVICES
import { getURLfromImage } from '$lib/client/services/image';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import Image from '$lib/components/common/Image.svelte';
// ENUMS
import { ResourcePath } from '$lib/enums';
// TYPES
import type { Resource, ImageDB, Task } from '$lib/types';

export type KeyMap = {
  id: 'id' | 'code' | string;
  title: string;
  subtitle?: string;
  description?: string;
  image: string;
  tags?: string[];
  badges?: Array<{
    label: string;
    variant?: 'primary' | 'secondary' | 'outline' | undefined;
    type?: 'boolean';
    trueText?: string;
    falseText?: string;
    superAdminOnly?: boolean;
  }>;
};

type Props = {
  entity: Exclude<Resource, Task>;
  keyMap: KeyMap;
  header?: any;
  badges?: any;
  badgesExtra?: any;
  content?: any;
  actions?: any;
};

let { entity, keyMap, header, badges, badgesExtra, content, actions }: Props = $props();
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
    ? `${ADMIN_PATH}/${adminCtx.getEntityPath(
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
</script>

<a
  draggable="false"
  href={href || '#'}
  {onclick}
  role="article"
  tabindex="2"
  class="duration-800 card select-none bg-base-100 shadow-xl transition-shadow hover:scale-[.99] hover:shadow-2xl hover:shadow-primary focus-visible:shadow-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-secondary active:outline-none"
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick(e);
    }
  }}>
  <!-- Header Section -->
  {#if header}
    {@render header(entity)}
  {:else}
    <Image
      src={getNestedValue(entity, keyMap.image)
        ? getURLfromImage({
            image: getNestedValue(entity, keyMap.image) as ImageDB
          })
        : getHashiconUrl(entity.id)}
      alt={getPropertyValue(entity, keyMap.title)}
      layout="cover" />
  {/if}

  <!-- Content Section -->
  <div class="card-body w-full pb-6">
    {#if content}
      {@render content(entity)}
    {:else}
      <h2 class="card-title mt-0">
        {getPropertyValue(entity, keyMap.title)}
        {#if keyMap.subtitle}
          <small class="text-sm text-gray-500"
            >{getPropertyValue(entity, keyMap.subtitle)}</small>
        {/if}
      </h2>
      {#if keyMap.description}
        <p class="mt-2">{@html getPropertyValue(entity, keyMap.description)}</p>
      {/if}
    {/if}

    <!-- Actions Section -->
    <div class="mt-2 flex w-full flex-row items-center justify-between">
      {#if actions}
        {@render actions(entity)}
      {:else}
        <!-- Badges Section -->
        {#if badges}
          {@render badges(entity)}
        {:else if keyMap.badges?.length}
          <div class="flex flex-row flex-wrap justify-center gap-2 py-2 align-middle">
            {#each keyMap.badges.filter((badge) => !badge.superAdminOnly || adminCtx.appCtx.user?.superAdmin === true) as badge}
              {#if badge.type === 'boolean'}
                {@const boolValue = getNestedValue(entity, badge.label)}
                <span
                  class="badge badge-{badge.variant ||
                    'outline'} my-0.5 h-8 bg-base-300">
                  {boolValue ? badge.trueText || 'True' : badge.falseText || 'False'}
                </span>
              {:else}
                <span class="badge badge-{badge.variant || 'outline'}"
                  >{getNestedValue(entity, badge.label)}</span>
              {/if}
            {/each}
            <!-- Extra Badges Section -->
            {#if badgesExtra}
              {@render badgesExtra(entity)}
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  </div>
</a>
