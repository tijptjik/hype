// VALIDATION
import { z } from 'zod'

// Only raster data or same-origin/static and HTTPS images can become CSS backgrounds.
const image = z
  .string()
  .max(400_000)
  .refine(
    value =>
      !value ||
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ||
      /^\/(?!\/)[^\s"'()\\]+$/.test(value) ||
      /^https:\/\/[^\s"'()\\]+$/.test(value),
    'Choose a PNG, JPEG or WebP image, or an HTTPS image URL',
  )
export const ChatAppearanceSchema = z
  .object({
    image,
    opacity: z.number().min(0.02).max(0.2),
    size: z.number().int().min(160).max(640),
  })
  .strict()
export type ChatAppearance = z.infer<typeof ChatAppearanceSchema>
export const TOASTIE_CHAT_BACKGROUND = '/messaging/toastie-and-friends.png'
export const DEFAULT_CHAT_APPEARANCE: ChatAppearance = {
  image: '',
  opacity: 0.06,
  size: 480,
}

/** Read an optional organisation setting without trusting old or malformed JSON.
 * @param settings Persisted organisation settings.
 * @returns A validated subtle background, disabled until an image is chosen.
 */
export function readChatAppearance(
  settings: Record<string, unknown> | null | undefined,
): ChatAppearance {
  const parsed = ChatAppearanceSchema.safeParse(settings?.messagingAppearance)
  return parsed.success ? parsed.data : { ...DEFAULT_CHAT_APPEARANCE }
}

/** Project validated values into inherited CSS variables for settings previews and timelines.
 * @param appearance The selected organisation background.
 * @returns Escaped CSS declarations; only the decorative layer is faded.
 */
export function chatAppearanceStyle(appearance: ChatAppearance): string {
  const value = ChatAppearanceSchema.parse(appearance)
  return `--chat-background-image:${value.image ? `url(${JSON.stringify(value.image)})` : 'none'};--chat-background-mask:${(1 - value.opacity) * 100}%;--chat-background-size:${value.size}px;`
}
