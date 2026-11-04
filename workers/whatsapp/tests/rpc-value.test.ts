import { describe, expect, it, vi } from 'vitest'
import { copyRpcValue } from '../src/rpc-value'

describe('data-only RPC ownership', () => {
  it('copies nested data and releases the upstream result before returning', async () => {
    const dispose = vi.fn()
    const source = { status: { connected: true }, [Symbol.dispose]: dispose }
    const result = await copyRpcValue(Promise.resolve(source))
    expect(dispose).toHaveBeenCalledOnce()
    expect(Symbol.dispose in result).toBe(false)
    source.status.connected = false
    expect(result.status.connected).toBe(true)
  })

  it('releases the result even when an accidental capability cannot be cloned', async () => {
    const dispose = vi.fn()
    await expect(
      copyRpcValue(
        Promise.resolve({ capability: () => {}, [Symbol.dispose]: dispose }),
      ),
    ).rejects.toThrow()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('preserves arrays, nullable values and media bytes without detaching the source', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer
    expect(await copyRpcValue(Promise.resolve(null))).toBe(null)
    expect(await copyRpcValue(Promise.resolve(['synthetic']))).toEqual(['synthetic'])
    const copied = await copyRpcValue(Promise.resolve(bytes))
    expect(new Uint8Array(copied)).toEqual(new Uint8Array([1, 2, 3]))
    expect(copied).not.toBe(bytes)
    expect(bytes.byteLength).toBe(3)
  })
})
