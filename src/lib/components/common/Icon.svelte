<script lang="ts">
import { Icon as SteezeIcon } from '@steeze-ui/svelte-icon';
import type { IconSource } from '@steeze-ui/svelte-icon';

interface IconProps {
  src: IconSource;
  size?: string;
  theme?: string;
  title?: string;
  [key: string]: any;
}

let {
  src,
  size = '24px',
  theme = 'outline',
  title,
  ...restProps
}: IconProps = $props();
</script>

<SteezeIcon
  {src}
  {size}
  {theme}
  {title}
  {...restProps} />
