/** Keep the relay DO active only while its actual packet sockets are open. */
export function proxyRelay(upstream: WebSocket): Response {
  const pair = new WebSocketPair()
  const downstream = pair[1]
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    downstream.removeEventListener('message', toNative)
    upstream.removeEventListener('message', toWorker)
    for (const socket of [upstream, downstream]) {
      socket.removeEventListener('close', close)
      socket.removeEventListener('error', close)
      try {
        socket.close(1000, 'relay closed')
      } catch {
        /* Already closed. */
      }
    }
  }
  const forward = (target: WebSocket, event: MessageEvent) => {
    if (closed) return
    if (
      typeof event.data === 'string'
        ? event.data.length > 256
        : !(event.data instanceof ArrayBuffer) || event.data.byteLength > 65_536
    ) {
      close()
      return
    }
    try {
      target.send(event.data)
    } catch {
      close()
    }
  }
  const toNative = (event: MessageEvent) => forward(upstream, event)
  const toWorker = (event: MessageEvent) => forward(downstream, event)
  upstream.binaryType = 'arraybuffer'
  downstream.binaryType = 'arraybuffer'
  upstream.addEventListener('message', toWorker)
  downstream.addEventListener('message', toNative)
  for (const socket of [upstream, downstream]) {
    socket.addEventListener('close', close)
    socket.addEventListener('error', close)
  }
  try {
    upstream.accept()
    downstream.accept()
  } catch {
    close()
    throw new Error('Voice relay upgrade failed')
  }
  return new Response(null, { status: 101, webSocket: pair[0] })
}
