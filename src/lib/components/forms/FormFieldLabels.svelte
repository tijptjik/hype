<script lang="ts">
const { isGenAI, languageTag, absolute = false } = $props();
</script>

{#snippet label(text, badgeType = 'ghost')}
  <span
    class="badge badge-outline badge-sm flex-shrink-0 badge-{badgeType} border-primary bg-neutral p-2.5"
    >{text}</span>
{/snippet}

{#if absolute}
  <div class="flex flex-col-reverse gap-2.5 flex-shrink-0">
    {#if isGenAI}
      {@render label('GenAI')}
    {/if}

    {#if languageTag}
      {@render label(
        languageTag.replace('hant', 'HK').replace('hans', 'CN').toUpperCase(),
        'primary'
      )}
    {/if}
  </div>
{:else}
  {#if isGenAI}
    {@render label('GenAI')}
  {/if}

  {#if languageTag}
    {@render label(
      languageTag.replace('hant', 'HK').replace('hans', 'CN').toUpperCase(),
      'primary'
    )}
  {/if}
{/if}
