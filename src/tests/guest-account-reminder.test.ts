import { render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import GuestAccountReminderTestWrapper from './GuestAccountReminderTestWrapper.svelte'

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('GuestAccountReminder', () => {
  it('keeps the reminder dismissed when the panel is reopened in the same session', () => {
    const firstRender = render(GuestAccountReminderTestWrapper)

    screen.getByRole('button', { name: 'Close' }).click()
    expect(screen.queryByText("You're using a guest account.")).not.toBeInTheDocument()

    firstRender.unmount()
    render(GuestAccountReminderTestWrapper)

    expect(screen.queryByText("You're using a guest account.")).not.toBeInTheDocument()
  })
})
