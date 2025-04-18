<script lang="ts">
type Props = {
  checked: boolean;
  size?: 'sm' | 'md' | 'lg';
  onChange: () => void;
};

let { checked, size = 'lg', onChange }: Props = $props();
</script>

<!-- TODO Make into a field instead of an element -->
<label class="label cursor-pointer">
  <input
    {name}
    type="checkbox"
    class="toggle toggle-primary toggle-{size}"
    {checked}
    onchange={onChange} />
</label>
