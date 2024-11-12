<script lang="ts">
type Props = {
  checked: boolean;
  onChange: () => void;
};

let { checked, onChange }: Props = $props();
</script>

<label class="label cursor-pointer">
  <input type="checkbox" class="toggle toggle-primary toggle-lg" {checked} on:change={onChange} />
</label>
