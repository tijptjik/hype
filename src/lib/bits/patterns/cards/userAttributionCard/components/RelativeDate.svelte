<script lang="ts">
import { format, formatDistanceToNow } from 'date-fns'
import { formatDate } from '$lib'
import { getLocale } from '$lib/i18n'

type Props = {
  date?: string
  friendly?: boolean
}

let { date, friendly = true }: Props = $props()

function getFriendlyEnglishDate(value: string): string {
  const target = new Date(value)
  const now = new Date()
  const diffMs = now.getTime() - target.getTime()

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return formatDistanceToNow(target, { addSuffix: true })
  }

  const hour = 60 * 60 * 1000
  const day = 24 * hour
  const week = 7 * day
  const month = 30 * day

  if (diffMs < hour) return 'just now'
  if (diffMs < day) return 'today'
  if (diffMs < week) return 'this week'
  if (diffMs < month) return 'recently'
  return format(target, "MMM ''yy")
}

const text = $derived(
  date
    ? friendly
      ? getLocale().startsWith('zh')
        ? formatDistanceToNow(new Date(date), { addSuffix: true })
        : getFriendlyEnglishDate(date)
      : formatDate(date)
    : '',
)
</script>

<span>{text}</span>
