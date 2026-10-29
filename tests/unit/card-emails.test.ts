import { describe, it, expect } from 'vitest'
// Imports the real implementations. `db` / `schema` / the email senders are Nitro
// auto-imports and undefined here, but they are only touched inside the
// db-backed functions, so the pure planner, cooldown and builders are safe to test.
import { planCardEmails, createCardEmailCooldown, CARD_EMAIL_COOLDOWN_MS } from '../../server/utils/card-emails'
import { buildCardAssignedEmail, buildMentionEmail, escapeEmailHtml, mentionExcerpt } from '../../server/utils/email'

describe('planCardEmails', () => {
  it('emails a newly assigned person', () => {
    expect(planCardEmails({ actorId: 'ada', assignedUserId: 'bob' }))
      .toEqual([{ userId: 'bob', kind: 'assigned' }])
  })

  it('emails mentioned people', () => {
    expect(planCardEmails({ actorId: 'ada', mentionedUserIds: ['bob', 'cy'] }))
      .toEqual([{ userId: 'bob', kind: 'mentioned' }, { userId: 'cy', kind: 'mentioned' }])
  })

  it('never emails the actor about their own assignment', () => {
    expect(planCardEmails({ actorId: 'ada', assignedUserId: 'ada' })).toEqual([])
  })

  it('never emails the actor about mentioning themselves', () => {
    expect(planCardEmails({ actorId: 'ada', mentionedUserIds: ['ada'] })).toEqual([])
  })

  it('sends one email, the assignment, to someone assigned and mentioned in one action', () => {
    expect(planCardEmails({ actorId: 'ada', assignedUserId: 'bob', mentionedUserIds: ['bob'] }))
      .toEqual([{ userId: 'bob', kind: 'assigned' }])
  })

  it('emails each mentioned person once even if the list repeats them', () => {
    expect(planCardEmails({ actorId: 'ada', mentionedUserIds: ['bob', 'bob'] }))
      .toEqual([{ userId: 'bob', kind: 'mentioned' }])
  })

  it('sends nothing when nobody new is assigned or mentioned (e.g. re-saving)', () => {
    // Callers pass only *newly added* mentions and only a *changed* assignee, so an
    // unchanged re-save arrives here empty.
    expect(planCardEmails({ actorId: 'ada', assignedUserId: null, mentionedUserIds: new Set() })).toEqual([])
  })
})

describe('card email cooldown', () => {
  it('allows the first email and blocks a repeat of the same kind, card and person within the window', () => {
    const cooldown = createCardEmailCooldown()
    expect(cooldown.take('bob', 1, 'mentioned', 0)).toBe(true)
    expect(cooldown.take('bob', 1, 'mentioned', 60_000)).toBe(false)
  })

  it('allows it again once the window has passed', () => {
    const cooldown = createCardEmailCooldown()
    cooldown.take('bob', 1, 'mentioned', 0)
    expect(cooldown.take('bob', 1, 'mentioned', CARD_EMAIL_COOLDOWN_MS)).toBe(true)
  })

  it('keeps kinds, cards and people independent', () => {
    const cooldown = createCardEmailCooldown()
    cooldown.take('bob', 1, 'mentioned', 0)
    expect(cooldown.take('bob', 1, 'assigned', 0)).toBe(true)
    expect(cooldown.take('bob', 2, 'mentioned', 0)).toBe(true)
    expect(cooldown.take('cy', 1, 'mentioned', 0)).toBe(true)
  })
})

const card = {
  actorName: 'Ada Lovelace',
  projectName: 'Website Relaunch',
  ticketId: 'WEB-42',
  cardTitle: 'Startseite überarbeiten',
  cardUrl: 'https://completo.example/projects/website-relaunch/cards/WEB-42'
}

describe('buildCardAssignedEmail', () => {
  it('is English by default', () => {
    expect(buildCardAssignedEmail(card).subject)
      .toBe('[Completo] Ada Lovelace assigned you a card: Startseite überarbeiten')
  })

  it('is German with the de locale', () => {
    expect(buildCardAssignedEmail({ ...card, locale: 'de' }).subject)
      .toBe('[Completo] Ada Lovelace hat dir ein Ticket zugewiesen: Startseite überarbeiten')
  })

  for (const locale of ['en', 'de'] as const) {
    it(`names the project and the ticket, links to the card and to the opt-out (${locale})`, () => {
      const email = buildCardAssignedEmail({ ...card, locale })
      for (const part of [email.html, email.text]) {
        expect(part).toContain('Website Relaunch')
        expect(part).toContain('WEB-42')
        expect(part).toContain('Startseite überarbeiten')
        expect(part).toContain(card.cardUrl)
        expect(part).toMatch(/\/profile/)
      }
    })
  }
})

describe('buildMentionEmail', () => {
  const mention = { ...card, excerpt: 'Kannst du das bis Freitag prüfen?', source: 'comment' as const }

  it('is English by default', () => {
    const email = buildMentionEmail(mention)
    expect(email.subject).toBe('[Completo] Ada Lovelace mentioned you: Startseite überarbeiten')
    expect(email.text).toContain('in a comment on')
  })

  it('is German with the de locale', () => {
    const email = buildMentionEmail({ ...mention, locale: 'de' })
    expect(email.subject).toBe('[Completo] Ada Lovelace hat dich erwähnt: Startseite überarbeiten')
    expect(email.text).toContain('in einem Kommentar')
    expect(buildMentionEmail({ ...mention, locale: 'de', source: 'description' }).text).toContain('in der Beschreibung')
  })

  it('includes the excerpt, the project and a link to the card', () => {
    const email = buildMentionEmail(mention)
    for (const part of [email.html, email.text]) {
      expect(part).toContain('Kannst du das bis Freitag prüfen?')
      expect(part).toContain('Website Relaunch')
      expect(part).toContain(card.cardUrl)
    }
  })
})

describe('user-controlled text in emails', () => {
  const evil = '<a href="https://evil.example">Log in here</a>'

  for (const locale of ['en', 'de'] as const) {
    it(`cannot inject markup or links into the HTML body (${locale})`, () => {
      const assigned = buildCardAssignedEmail({ ...card, locale, cardTitle: evil, actorName: evil, projectName: evil })
      const mention = buildMentionEmail({ ...card, locale, cardTitle: evil, actorName: evil, projectName: evil, excerpt: evil, source: 'comment' })
      for (const html of [assigned.html, mention.html]) {
        expect(html).not.toContain('https://evil.example">')
        expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;')
      }
    })
  }

  it('cannot break the subject onto a second header line', () => {
    const email = buildCardAssignedEmail({ ...card, cardTitle: 'Title\r\nBcc: someone@evil.example' })
    expect(email.subject).not.toMatch(/[\r\n]/)
  })

  it('escapes every HTML-significant character', () => {
    expect(escapeEmailHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })
})

describe('mentionExcerpt', () => {
  it('turns stored mentions into readable @Names', () => {
    expect(mentionExcerpt('Hi @[Bob Builder](1a2b3c4d), please check')).toBe('Hi @Bob Builder, please check')
  })

  it('flattens light markdown', () => {
    expect(mentionExcerpt('## Title\n- **bold** and [link](https://x.example)')).toBe('Title bold and link')
  })

  it('shortens long text', () => {
    const excerpt = mentionExcerpt('a'.repeat(500), { max: 200 })
    expect(excerpt).toHaveLength(201)
    expect(excerpt.endsWith('…')).toBe(true)
  })

  it('centres on the recipient when the mention is far into the text', () => {
    const filler = 'Lorem ipsum dolor sit amet. '.repeat(30) // ~840 chars before the mention
    const text = `${filler}@[Bob Builder](1a2b3c4d) please review the checkout copy.`
    const excerpt = mentionExcerpt(text, { aroundUserId: '1a2b3c4d-0000-4000-8000-000000000000' })
    expect(excerpt).toContain('@Bob Builder please review the checkout copy.')
    expect(excerpt.startsWith('…')).toBe(true)
  })

  it('picks the recipient\'s own mention when several people are mentioned', () => {
    const text = `@[Ada](aaaaaaaa) intro. ${'x '.repeat(200)}@[Bob](bbbbbbbb) this part is for Bob.`
    expect(mentionExcerpt(text, { aroundUserId: 'bbbbbbbb-1111' })).toContain('@Bob this part is for Bob.')
  })
})
