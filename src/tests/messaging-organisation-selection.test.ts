import { expect, it } from 'vitest'
import {
  chooseMessagingOrganisation,
  isMessagingInboxPath,
} from '#lib/messaging/organisation-selection.js'

it('retains the first authorised pin instead of replacing it with a configured default', () => {
  const organisations = [{ id: 'a' }, { id: 'b', hasMessaging: true }]
  expect(chooseMessagingOrganisation(organisations, ['unavailable', 'a', 'b'])).toBe(
    'a',
  )
})

it('automatically selects a sole membership or sole accessible organisation', () => {
  expect(
    chooseMessagingOrganisation(
      [
        { id: 'a', isMember: true },
        { id: 'b', hasMessaging: true },
      ],
      [],
    ),
  ).toBe('a')
  expect(chooseMessagingOrganisation([{ id: 'a' }], [])).toBe('a')
})

it('uses the first configured membership when there are no valid pins', () => {
  expect(
    chooseMessagingOrganisation(
      [
        { id: 'admin-only', hasMessaging: true },
        { id: 'a', isMember: true },
        { id: 'b', isMember: true, hasMessaging: true },
        { id: 'c', isMember: true, hasMessaging: true },
      ],
      [],
    ),
  ).toBe('b')
  expect(
    chooseMessagingOrganisation([{ id: 'a' }, { id: 'b', hasMessaging: true }], []),
  ).toBe('b')
})

it('leaves an explicit choice when several organisations have no messaging configured', () => {
  expect(chooseMessagingOrganisation([{ id: 'a' }, { id: 'b' }], [])).toBeNull()
  expect(chooseMessagingOrganisation([], ['unavailable'])).toBeNull()
})

it('restricts exclusive prism behaviour to the inbox and its alias', () => {
  expect(isMessagingInboxPath('/admin/messaging')).toBe(true)
  expect(isMessagingInboxPath('/admin/whatsapp/')).toBe(true)
  expect(isMessagingInboxPath('/admin/organisations/hkfoodworks')).toBe(false)
  expect(isMessagingInboxPath('/admin/messaging-other')).toBe(false)
})
