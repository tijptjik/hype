import { expect, it } from 'vitest'
import { sameMessageGroup } from '#lib/messaging/message-group.js'
import type { WhatsAppMessage } from '#lib/api/services/whatsover.types.js'
const first: WhatsAppMessage = {
  id: '1',
  chat: '42',
  sender: '99',
  sequence: 1,
  timestamp: new Date(2026, 10, 4, 12).getTime(),
  fromMe: true,
  text: 'First',
}
it('groups consecutive account messages within five minutes', () => {
  expect(
    sameMessageGroup(first, { ...first, id: '2', timestamp: first.timestamp + 60_000 }),
  ).toBe(true)
  expect(
    sameMessageGroup(first, { ...first, timestamp: first.timestamp + 6 * 60_000 }),
  ).toBe(false)
})
it('keeps different operators, directions, days and deleted messages separate', () => {
  const operator = { id: 'a', name: 'Alex', username: null, image: null }
  expect(
    sameMessageGroup(
      { ...first, operator },
      { ...first, operator: { ...operator, id: 'b' } },
    ),
  ).toBe(false)
  expect(sameMessageGroup({ ...first, operator }, first)).toBe(false)
  expect(sameMessageGroup(first, { ...first, fromMe: false })).toBe(false)
  expect(sameMessageGroup(first, { ...first, deleted: true })).toBe(false)
  const midnight = new Date(2026, 10, 5).getTime()
  expect(
    sameMessageGroup(
      { ...first, timestamp: midnight - 1000 },
      { ...first, timestamp: midnight },
    ),
  ).toBe(false)
})
