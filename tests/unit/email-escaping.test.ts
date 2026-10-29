import { describe, it, expect, vi, beforeEach } from 'vitest'

// The account and project emails send as they build, so the transport is
// captured to read back the HTML each one would have sent.
const sendMail = vi.fn()
vi.mock('nodemailer', () => ({ createTransport: () => ({ sendMail }) }))

const { sendProjectNotificationEmail, sendAccountInviteEmail, sendAccountSetupEmail } = await import('../../server/utils/email')

// Display names and project names are typed by users. Interpolated raw, this
// arrives as a live link inside a genuine Completo email.
const evil = '<a href="https://evil.example">Log in</a>'

describe('user-controlled names in account and project emails', () => {
  beforeEach(() => sendMail.mockClear())

  const sentHtml = () => sendMail.mock.calls[0]![0].html as string

  it.each([
    ['project notification', () => sendProjectNotificationEmail('to@example.com', evil, evil, 'slug')],
    ['account invite', () => sendAccountInviteEmail('to@example.com', evil, evil, 'https://completo.example/register')],
    ['account setup', () => sendAccountSetupEmail('to@example.com', evil, 'https://completo.example/setup')]
  ])('cannot inject markup or links into the %s email', async (_, send) => {
    await send()
    expect(sentHtml()).not.toContain('https://evil.example">')
    expect(sentHtml()).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;')
  })
})
