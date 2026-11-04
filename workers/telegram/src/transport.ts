import { WebSocketConnection } from '@fuman/net'
import {
  IntermediatePacketCodec,
  ObfuscatedPacketCodec,
  type TelegramTransport,
} from '@mtcute/core'
import type { BasicDcOption } from '@mtcute/core/utils.js'

const DC_HOSTS: Readonly<Record<number, string>> = {
  1: 'pluto',
  2: 'venus',
  3: 'aurora',
  4: 'vesta',
  5: 'flora',
}

/** MTProto over Workers' outbound WebSocket API, with protocol-required obfuscation. */
export class WorkersTelegramTransport implements TelegramTransport {
  async connect(dc: BasicDcOption, signal: AbortSignal): Promise<WebSocketConnection> {
    const host = DC_HOSTS[dc.id]
    if (!host) throw new Error('Unsupported Telegram datacentre')
    const response = await fetch(
      `https://${host}.web.telegram.org/apiws${dc.testMode ? '_test' : ''}`,
      {
        headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': 'binary' },
        redirect: 'manual',
        signal,
      },
    )
    const socket = response.webSocket
    if (response.status !== 101 || !socket) {
      await response.body?.cancel()
      throw new Error('Telegram WebSocket upgrade failed')
    }
    socket.binaryType = 'arraybuffer'
    const connection = new WebSocketConnection(socket)
    const abort = () => connection.close()
    signal.addEventListener('abort', abort, { once: true })
    socket.addEventListener('close', () => signal.removeEventListener('abort', abort), {
      once: true,
    })
    socket.accept()
    if (signal.aborted) {
      connection.close()
      throw new Error('Telegram connection cancelled')
    }
    return connection
  }

  packetCodec(): ObfuscatedPacketCodec {
    return new ObfuscatedPacketCodec(new IntermediatePacketCodec())
  }
}
