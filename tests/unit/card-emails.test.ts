import { describe, it, expect } from 'vitest'
// Imports the real implementations. `db` / `schema` / the email senders are Nitro
// auto-imports and undefined here, but they are only touched inside
// sendCardActivityEmails, so the pure planner and builders are safe to test.
import { planCardEmails } from '../../server/utils/card-emails'
import { buildCardAssignedEmail, buildMentionEmail, escapeHtml, mentionExcerpt } from '../../server/utils/email'

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

const card = {
  actorName: 'Ada Lovelace',
  projectName: 'Website Relaunch',
  ticketId: 'WEB-42',
  cardTitle: 'Startseite überarbeiten',
  cardUrl: 'https://completo.example/projects/website-relaunch/cards/WEB-42'
}

describe('buildCardAssignedEmail', () => {
  const email = buildCardAssignedEmail(card)

  it('uses the German subject', () => {
    expect(email.subject).toBe('[Completo] Ada Lovelace hat dir ein Ticket zugewiesen: Startseite überarbeiten')
  })

  it('names the project and the ticket and links straight to the card', () => {
    for (const part of [email.html, email.text]) {
      expect(part).toContain('Website Relaunch')
      expect(part).toContain('WEB-42')
      expect(part).toContain('Startseite überarbeiten')
      expect(part).toContain(card.cardUrl)
    }
    expect(email.html).toContain('Ticket öffnen')
  })
})

describe('buildMentionEmail', () => {
  const email = buildMentionEmail({ ...card, excerpt: 'Kannst du das bis Freitag prüfen?', source: 'comment' })

  it('uses the German subject', () => {
    expect(email.subject).toBe('[Completo] Ada Lovelace hat dich erwähnt: Startseite überarbeiten')
  })

  it('includes the excerpt, the project and a link to the card', () => {
    for (const part of [email.html, email.text]) {
      expect(part).toContain('Kannst du das bis Freitag prüfen?')
      expect(part).toContain('Website Relaunch')
      expect(part).toContain(card.cardUrl)
    }
  })

  it('says where the mention was', () => {
    expect(email.text).toContain('in einem Kommentar')
    expect(buildMentionEmail({ ...card, excerpt: '', source: 'description' }).text).toContain('in der Beschreibung')
  })
})

describe('user-controlled text in emails', () => {
  const evil = '<a href="https://evil.example">Hier einloggen</a>'
  const assigned = buildCardAssignedEmail({ ...card, cardTitle: evil, actorName: evil, projectName: evil })
  const mention = buildMentionEmail({ ...card, cardTitle: evil, actorName: evil, projectName: evil, excerpt: evil, source: 'comment' })

  it('cannot inject markup or links into the HTML body', () => {
    for (const html of [assigned.html, mention.html]) {
      expect(html).not.toContain('https://evil.example">')
      expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;')
    }
  })

  it('cannot break the subject onto a second header line', () => {
    const email = buildCardAssignedEmail({ ...card, cardTitle: 'Titel\r\nBcc: someone@evil.example' })
    expect(email.subject).not.toMatch(/[\r\n]/)
  })

  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })
})

describe('mentionExcerpt', () => {
  it('turns stored mentions into readable @Names', () => {
    expect(mentionExcerpt('Hi @[Bob Builder](1a2b3c4d), bitte prüfen')).toBe('Hi @Bob Builder, bitte prüfen')
  })

  it('flattens light markdown', () => {
    expect(mentionExcerpt('## Titel\n- **fett** und [Link](https://x.example)')).toBe('Titel fett und Link')
  })

  it('shortens long text', () => {
    const excerpt = mentionExcerpt('a'.repeat(500), 200)
    expect(excerpt).toHaveLength(201)
    expect(excerpt.endsWith('…')).toBe(true)
  })
})
