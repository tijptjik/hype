// TYPES
import type { RecorderField } from '../../../../src/lib/fieldResearch/recorderEditor'

/** Use compact English captions for standard condition and technique values.
 * @param option Configured field option.
 * @returns Recorder caption, preserving custom catalogue wording.
 */
export function optionLabel(
  option: NonNullable<RecorderField['values']>[number],
): string {
  const label = option.i18n?.en?.value || option.value
  if (
    option.icon === 'condition-deteriorated' &&
    label.toLowerCase() === 'heavily deteriorated'
  )
    return 'Degraded'
  if (option.icon === 'condition-preserved' && label.toLowerCase() === 'well preserved')
    return 'Preserved'
  const technique = label.toLowerCase().replace(/\s*\/\s*/g, '/')
  if (option.icon === 'technique-painted' && /^hand[- ]painted$/.test(technique))
    return 'Painted'
  if (option.icon === 'technique-cast' && /^cast\/mou?lded$/.test(technique))
    return 'Cast'
  if (option.icon === 'technique-mounted' && technique === 'applied/mounted')
    return 'Mounted'
  return label
}
