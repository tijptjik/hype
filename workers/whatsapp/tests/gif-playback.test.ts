import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'

it('projects WhatsApp GIF playback as animated media while preserving regular videos', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('gif-playback-projection'),
    instance => {
      for (const animated of [true, false]) {
        const result = JSON.parse(
          instance.engine.projectMessage(
            JSON.stringify({
              message: {
                video_message: { mimetype: 'video/mp4', gif_playback: animated },
              },
            }),
          ),
        )
        expect(result.content).toMatchObject({
          kind: 'video',
          mimeType: 'video/mp4',
          animated,
        })
      }
    },
  )
})
