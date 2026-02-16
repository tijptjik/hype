<script lang="ts">
// BITS COMPONENTS
import { Header as BitsHeader } from '$lib/bits/custom'
// TYPES
import type { HeaderCrumb } from '$lib/bits/custom/header'
import type { Component } from 'svelte'

let {
  text,
  description,
  icon,
  href,
  crumbs = [],
  hideTitle = false,
  hideDescription = false
}: {
  text?: string
  description?: string
  icon?: Component
  href?: string
  crumbs?: HeaderCrumb[]
  hideTitle?: boolean
  hideDescription?: boolean
} = $props()
</script>

<BitsHeader
  size="md"
  {icon}
  {href}
  crumbs={crumbs}
  {text}
  {description}
  {hideTitle}
  {hideDescription} />
