import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useApiTokens } from '../../app/composables/useApiTokens'

/**
 * The token list on an agent's page is the agent's own data, not a copy.
 *
 * The agent's tokens arrive with the agent (`GET /api/agents/:id`), and
 * suspending it revokes every one of them. While `useApiTokens` kept a list of
 * its own, filled only by its own fetch, a suspend refreshed the agent and left
 * the revoked tokens on screen, where revoking one answered 404; and the
 * composable's fetch on mount loaded the agent a second time.
 *
 * Nuxt auto-imports what the composable calls, so those are stubbed: `ref` as a
 * plain box is enough, since a caller's list is passed through rather than
 * copied, and what is asserted is which requests go out.
 */
describe('useApiTokens with a list the caller owns', () => {
  let mounted: Array<() => void>
  const fetch = vi.fn()

  beforeEach(() => {
    mounted = []
    fetch.mockReset()
    vi.stubGlobal('ref', <T>(value: T) => ({ value }))
    vi.stubGlobal('onMounted', (fn: () => void) => mounted.push(fn))
    vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
    vi.stubGlobal('useArmedDelete', () => ({ armedId: { value: null }, arm: vi.fn(), disarm: vi.fn() }))
    vi.stubGlobal('getErrorMessage', (_e: unknown, fallback: string) => fallback)
    vi.stubGlobal('$fetch', fetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const token = (id: string) => ({ id, name: id, tokenPrefix: 'dzo_abcd', expiresAt: null, lastUsedAt: null, createdAt: '2026-11-03', isExpired: false })

  it('fetches nothing on mount: the caller already has the list', async () => {
    const reload = vi.fn()
    useApiTokens({ endpoint: '/api/agents/a1/tokens', list: { tokens: { value: [token('t1')] }, reload } })
    for (const fn of mounted) fn()
    await Promise.resolve()
    expect(fetch).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('shows whatever the caller\'s data now holds, so a suspend that empties it empties the list', () => {
    const agent = { value: { tokens: [token('t1'), token('t2')] } }
    const source = {
      get value() {
        return agent.value.tokens
      }
    }
    const { tokens } = useApiTokens({ endpoint: '/api/agents/a1/tokens', list: { tokens: source, reload: vi.fn() } })
    expect(tokens.value.map(t => t.id)).toEqual(['t1', 't2'])

    agent.value = { tokens: [] }
    expect(tokens.value).toEqual([])
  })

  it('reloads the caller\'s data after a revoke, rather than fetching a list of its own', async () => {
    const reload = vi.fn()
    const { confirmDeleteToken } = useApiTokens({ endpoint: '/api/agents/a1/tokens', list: { tokens: { value: [token('t1')] }, reload } })
    await confirmDeleteToken('t1')
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/agents/a1/tokens/t1', { method: 'DELETE' })
    expect(reload).toHaveBeenCalledOnce()
  })

  it('still loads its own list for the profile', async () => {
    fetch.mockResolvedValue([token('mine')])
    const { tokens } = useApiTokens()
    for (const fn of mounted) fn()
    await vi.waitFor(() => expect(tokens.value.map(t => t.id)).toEqual(['mine']))
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/user/tokens')
  })
})
