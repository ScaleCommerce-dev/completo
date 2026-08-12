import { describe, it, expect } from 'vitest'
// Imports the real implementation. `db` / `schema` are Nitro auto-imports and are
// undefined here, but they're only touched inside the notify* function bodies, so
// pulling in this module to test the pure extractor is safe.
import { extractMentionedUserIds } from '../../server/utils/notifications'

describe('extractMentionedUserIds', () => {
  it('extracts a single mention', () => {
    expect(extractMentionedUserIds('hey @[Ada Lovelace](user-1) look')).toEqual(['user-1'])
  })

  it('extracts several mentions', () => {
    const text = '@[Ada](user-1) and @[Grace](user-2) should see this'
    expect(extractMentionedUserIds(text)).toEqual(['user-1', 'user-2'])
  })

  it('de-duplicates repeated mentions of the same user', () => {
    expect(extractMentionedUserIds('@[Ada](user-1) @[Ada](user-1)')).toEqual(['user-1'])
  })

  it('ignores legacy name-only mentions', () => {
    // The old format resolved by display name, which notified the wrong person
    // when names collided. It is deliberately no longer recognised.
    expect(extractMentionedUserIds('hello @[Ada Lovelace]')).toEqual([])
  })

  it('ignores ordinary markdown links, including card mentions', () => {
    const cardLink = '[Fix login (TK-42)](/projects/demo/cards/TK-42)'
    expect(extractMentionedUserIds(cardLink)).toEqual([])
  })

  it('handles names containing spaces and punctuation', () => {
    expect(extractMentionedUserIds('@[Jean-Luc Picard, Jr.](user-9)')).toEqual(['user-9'])
  })

  it('does not match across whitespace in the id', () => {
    expect(extractMentionedUserIds('@[Ada](user 1)')).toEqual([])
  })

  it('returns nothing for text without mentions', () => {
    expect(extractMentionedUserIds('just a normal comment')).toEqual([])
  })
})
