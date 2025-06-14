<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition';
// LIB
import { NEW_REF } from '$lib';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// ENUMS
import { ResourcePath, FirstClassResource } from '$lib/enums';
// ICONS
import { Trash, ReceiptRefund } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// TYPES
import type { Form } from '$lib/types';

let menuProps: { form: Form } = $props();

// STATE
const adminCtx = getAdminCtx();

// STATE : FORM
let { form, errors, reset, submit, tainted, isTainted } = menuProps.form;

// STATE : UI
let isLoading = $state(false);

// ACTIONS
const handleClick = async (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  if (isLoading || !adminCtx.activeResourceRef || adminCtx.activeResourceRef === NEW_REF) return;

  isLoading = true;

  try {
    const response = await fetch(
      `/api/${ResourcePath[adminCtx.activeResourceType as FirstClassResource]}/${adminCtx.activeResourceRef}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: !$form.isArchived })
      }
    );

    if (!response.ok) throw new Error('Failed to update archive status');

    const result = await response.json();

    if (result && result.type === 'success') {
      // INVALIDE CACHE
      if (adminCtx.activeResourceType) {
        adminCtx.invalidateAndRefresh(adminCtx.activeResourceType);
      }

      // UPDATE FORM - Reset with new data to avoid dirtying the form
      reset({
        keepMessage: true,
        data: {
          ...$form,
          isArchived: result.data.isArchived
        },
        newState: {
          ...$form,
          isArchived: result.data.isArchived
        }
      });
    }
  } catch (err) {
    console.error(err);
    // TODO: Show error toast
  } finally {
    isLoading = false;
  }
};
</script>

<button
  transition:slide={{ axis: 'x' }}
  type="button"
  class="btn btn-ghost join-item gap-1 transition-colors duration-500 disabled:bg-transparent disabled:text-opacity-60"
  onclick={handleClick}>
  <Icon src={$form.isArchived ? ReceiptRefund : Trash} class="h-5 w-5" />
  <span
    >{$form.isArchived
      ? m.antsy_formal_badger_arise()
      : m.neat_awake_panda_grip()}</span>
</button>
