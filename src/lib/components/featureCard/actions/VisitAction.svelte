<script lang="ts">
// SVELTE
import { page } from '$app/state';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Check } from '@steeze-ui/heroicons';
// I18N
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// UTILS
import { formatDistanceToNow } from 'date-fns';
import { enGB, zhCN, zhHK } from 'date-fns/locale';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// SERVICES
import { toggleVisitedStatus } from '$lib/client/services/userFeatures';
import { getFlash } from 'sveltekit-flash-message';
// TYPES
import type { Feature, UserContributedFeature } from '$lib/types';

// PROPS
let { feature }: { feature: Feature | UserContributedFeature } = $props();

// CONTEXT
const appCtx = getAppCtx();
const flash = getFlash(page);

// STATE
let isSubmitting = $state(false);

// DERIVED STATE
let wishlistedFeature = $derived(
  'id' in feature
    ? appCtx.getWishlistUserFeatures().find((uf) => uf.featureId === feature.id)
    : undefined
);
let isWishlisted = $derived(!!wishlistedFeature);
let visitedFeature = $derived(
  'id' in feature
    ? appCtx.getVisitedUserFeatures().find((uf) => uf.featureId === feature.id)
    : undefined
);
let isVisited = $derived(!!visitedFeature);

// HANDLERS
async function toggleVisited() {
  if (isSubmitting || !('id' in feature)) return;
  isSubmitting = true;

  try {
    const shouldRemoveFromWishlist = !isVisited && isWishlisted;
    const newWishlistStatus = shouldRemoveFromWishlist
      ? false
      : wishlistedFeature?.isWishlisted || false;

    await toggleVisitedStatus(
      appCtx.user!.id,
      feature.id,
      isVisited,
      newWishlistStatus
    );

    await appCtx.invalidateAndRefresh('userFeatures');
  } catch (error) {
    console.error('Error updating visited status:', error);
    $flash = { type: 'error', message: 'Failed to update visited status' };
  } finally {
    isSubmitting = false;
  }
}
</script>

{#if isVisited}
  <div
    class="flex h-full flex-col items-start justify-center pl-2 text-sm text-neutral-content">
    <p class="text-xs uppercase">{m.white_dizzy_clownfish_quiz()}</p>
    <p class="font-mono text-white">
      {formatDistanceToNow(new Date(visitedFeature!.visitedAt!), {
        addSuffix: true,
        locale:
          getLocale() === 'zh-hant' ? zhHK : getLocale() === 'zh-hans' ? zhCN : enGB
      }).replace('minute', 'min')}
    </p>
  </div>
{:else}
  <button
    class="btn h-12 w-12 bg-base-400 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300 w-64:h-auto w-64:w-auto"
    onclick={toggleVisited}
    disabled={isSubmitting}>
    {#if isSubmitting}
      <span class="loading loading-ring loading-md"></span>
    {:else}
      <Icon
        src={Check}
        class="h-6 w-6 font-bold transition-colors duration-300 {isVisited
          ? 'text-primary'
          : 'text-neutral-content'}" />
      <span class="hidden w-120:block">
        {isVisited ? 'Forget' : m.noble_fine_ibex_pinch()}
      </span>
    {/if}
  </button>
{/if}
