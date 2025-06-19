<script lang="ts">
// I18N
import { m } from '$lib/i18n';

// TYPES
interface Props {
  label: string;
  currentValue: boolean | null;
  onToggleFalse: () => void;
  onToggleTrue: () => void;
  onToggleChange: (e: Event) => void;
  idx?: number;
  falseLabel?: string;
  trueLabel?: string;
  transformOffset?: number;
}

const {
  label,
  currentValue,
  onToggleFalse,
  onToggleTrue,
  onToggleChange,
  idx = 0,
  falseLabel = m.filters__no(),
  trueLabel = m.filters__has(),
  transformOffset = 16
}: Props = $props();
</script>

<div
  class="group flex min-w-[120px] flex-col items-center gap-[8px] tracking-widest"
  style="transform: translateX({-transformOffset * idx}px)">
  <label class="text-center text-xs uppercase leading-none text-base-content/70">
    {label}
  </label>
  <div
    class="grid w-full items-center gap-2"
    style="grid-template-columns: 1fr auto 1fr;">
    <span
      onclick={onToggleFalse}
      class="text cursor-pointer text-right text-sm uppercase text-base-content opacity-0 transition-opacity duration-300 group-hover:opacity-40"
      role="button"
      tabindex="-1">
      {falseLabel}
    </span>
    <input
      type="checkbox"
      class="toggle toggle-sm justify-self-center border-neutral-content/30 bg-[#CF4FB0] text-neutral-content/30 transition-colors {currentValue ===
      null
        ? 'bg-neutral-content/30'
        : currentValue === false
          ? 'bg-red-500'
          : ''}"
      checked={currentValue === true}
      indeterminate={currentValue === null}
      onchange={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleChange(e);
      }} />
    <span
      onclick={onToggleTrue}
      class="text cursor-pointer text-left text-sm uppercase text-base-content opacity-0 transition-opacity duration-300 group-hover:opacity-40"
      role="button"
      tabindex="-1">
      {trueLabel}
    </span>
  </div>
</div>
