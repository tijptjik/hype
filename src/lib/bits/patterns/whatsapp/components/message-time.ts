// I18N
import { getLocale } from '#lib/i18n.js'

/** Format a compact relative timestamp against the conversation's shared clock.
 * @param timestamp Message timestamp in milliseconds.
 * @param now Current conversation clock in milliseconds.
 * @returns Localized relative time; the bubble retains the exact time in its title.
 */
export function relativeMessageTime(timestamp: number, now: number): string {
  const seconds = (timestamp - now) / 1000
  const formatter = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto', style: 'narrow' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86400], ['month', 30 * 86400], ['week', 7 * 86400],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.trunc(seconds / size), unit)
  }
  return formatter.format(0, 'second')
}
