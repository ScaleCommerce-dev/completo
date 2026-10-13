import { describe, it, expect, beforeAll } from 'vitest'
import { url } from '../setup/server'
import { registerTestUser, createTestToken, type TestUser } from '../setup/auth'
import { createTestProject } from '../setup/fixtures'

/**
 * The MCP endpoint, driven the way a client drives it: raw JSON-RPC over POST.
 * Tools are exercised by name, the way Claude would call them, so what is
 * asserted is the contract the model sees, not the REST shapes underneath.
 */

type Rpc = { jsonrpc: '2.0', id: number | null, result?: Record<string, unknown>, error?: { code: number, message: string } }

let nextId = 1

async function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(url('/mcp'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

async function rpc(headers: Record<string, string>, method: string, params?: unknown): Promise<Rpc> {
  const res = await post({ jsonrpc: '2.0', id: nextId++, method, params }, headers)
  expect(res.status).toBe(200)
  return await res.json() as Rpc
}

async function call(headers: Record<string, string>, name: string, args: Record<string, unknown> = {}) {
  const res = await rpc(headers, 'tools/call', { name, arguments: args })
  expect(res.error).toBeUndefined()
  const result = res.result as { content: Array<{ type: string, text: string }>, structuredContent?: unknown, isError: boolean }
  return { ...result, data: result.isError ? null : JSON.parse(result.content[0]!.text) }
}

describe('POST /mcp', () => {
  let user: TestUser
  let headers: Record<string, string>

  beforeAll(async () => {
    user = await registerTestUser()
    headers = (await createTestToken(user)).headers
  })

  it('refuses without a token, pointing at the header to send', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('Bearer')
    const body = await res.json() as Rpc
    expect(body.error?.message).toContain('Authorization: Bearer')
  })

  it('accepts a session cookie as well as a token', async () => {
    const res = await rpc(user.headers, 'ping')
    expect(res.result).toEqual({})
  })

  it('answers initialize with the version asked for and the tools capability', async () => {
    const res = await rpc(headers, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' }
    })
    expect(res.result?.protocolVersion).toBe('2025-03-26')
    expect(res.result?.capabilities).toEqual({ tools: { listChanged: false } })
    expect((res.result?.serverInfo as { name: string }).name).toBe('completo')
    expect(typeof res.result?.instructions).toBe('string')
  })

  it('falls back to its newest protocol version for one it does not know', async () => {
    const res = await rpc(headers, 'initialize', { protocolVersion: '1999-01-01' })
    expect(res.result?.protocolVersion).toBe('2025-11-25')
  })

  it('takes a notification with 202 and no body', async () => {
    const res = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, headers)
    expect(res.status).toBe(202)
    expect(await res.text()).toBe('')
  })

  it('rejects a body that is not JSON with a parse error', async () => {
    const res = await post('{not json', headers)
    expect(res.status).toBe(400)
    expect((await res.json() as Rpc).error?.code).toBe(-32700)
  })

  it('rejects an unknown method and an unknown tool with JSON-RPC errors', async () => {
    expect((await rpc(headers, 'resources/list')).error?.code).toBe(-32601)
    expect((await rpc(headers, 'tools/call', { name: 'nope', arguments: {} })).error?.code).toBe(-32602)
  })

  it('refuses the DELETE and GET halves of the transport', async () => {
    const get = await fetch(url('/mcp'))
    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST')
    const del = await fetch(url('/mcp'), { method: 'DELETE', headers })
    expect(del.status).toBe(405)
  })

  it('lists tools with JSON Schema inputs', async () => {
    const res = await rpc(headers, 'tools/list')
    const tools = res.result?.tools as Array<{ name: string, inputSchema: { type: string, required?: string[] } }>
    const names = tools.map(t => t.name)
    for (const expected of ['list_projects', 'get_project', 'list_cards', 'search_cards', 'get_card', 'create_card', 'update_card', 'move_card', 'assign_card', 'tag_card', 'list_comments', 'add_comment', 'my_tasks', 'create_project']) {
      expect(names).toContain(expected)
    }
    const move = tools.find(t => t.name === 'move_card')!
    expect(move.inputSchema.type).toBe('object')
    expect(move.inputSchema.required).toEqual(['card', 'status'])
  })

  it('answers a batch with a batch', async () => {
    const res = await post([
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'ping' }
    ], headers)
    expect(res.status).toBe(200)
    const body = await res.json() as Rpc[]
    expect(body.map(r => r.id)).toEqual([1, 2])
  })

  describe('tools', () => {
    let project: { id: string, slug: string, key: string, name: string }

    beforeAll(async () => {
      project = await createTestProject(user, { name: `MCP ${Date.now()}` })
    })

    it('walks a card through the board by names, not ids', async () => {
      const created = await call(headers, 'create_card', {
        project: project.key,
        title: 'Ship the connector',
        description: '- [ ] write it\n- [ ] test it',
        status: 'to do',
        priority: 'high',
        assignee: 'me',
        tags: ['Bug', 'MCP']
      })
      expect(created.isError).toBe(false)
      expect(created.data.ticket).toBe(`${project.key}-${created.data.ticket.split('-')[1]}`)
      expect(created.data.status).toBe('To Do')
      expect(created.data.priority).toBe('high')
      expect(created.data.assignee).toBe(user.name)
      expect(created.data.tags.sort()).toEqual(['Bug', 'MCP'])
      expect(created.data.url).toMatch(new RegExp(`^https?://.+/projects/${project.slug}/cards/${created.data.ticket}$`))

      const ticket = created.data.ticket as string

      const moved = await call(headers, 'move_card', { card: ticket.toLowerCase(), status: 'In Progress' })
      expect(moved.data.status).toBe('In Progress')

      const fetched = await call(headers, 'get_card', { card: ticket })
      expect(fetched.data.status).toBe('In Progress')
      expect(fetched.data.description).toContain('- [ ] write it')

      const tagged = await call(headers, 'tag_card', { card: ticket, add: ['feature'], remove: ['Bug', 'never-there'] })
      expect(tagged.data.tags.sort()).toEqual(['Feature', 'MCP'])

      const updated = await call(headers, 'update_card', { card: ticket, title: 'Ship it', dueDate: '2030-01-02' })
      expect(updated.data.title).toBe('Ship it')
      expect(updated.data.dueDate).toBe('2030-01-02')

      const unassigned = await call(headers, 'assign_card', { card: ticket, assignee: '' })
      expect(unassigned.data.assignee).toBeNull()

      const comment = await call(headers, 'add_comment', { card: ticket, body: 'Looks good' })
      expect(comment.data.author).toBe(user.name)
      const comments = await call(headers, 'list_comments', { card: ticket })
      expect(comments.data.map((c: { body: string }) => c.body)).toEqual(['Looks good'])
    })

    it('lists and searches, scoped by what the caller can see', async () => {
      const mine = await call(headers, 'create_card', { project: project.slug, title: 'Needle in MCP', assignee: 'me' })
      const listed = await call(headers, 'list_cards', { project: project.slug, assignee: 'me' })
      expect(listed.data.map((c: { ticket: string }) => c.ticket)).toContain(mine.data.ticket)

      const found = await call(headers, 'search_cards', { query: 'Needle in MCP' })
      expect(found.data.map((c: { ticket: string }) => c.ticket)).toContain(mine.data.ticket)

      const tasks = await call(headers, 'my_tasks')
      const group = tasks.data.find((g: { project: string }) => g.project === project.name)
      expect(group.cards.map((c: { ticket: string }) => c.ticket)).toContain(mine.data.ticket)

      const projects = await call(headers, 'list_projects')
      expect(projects.data.map((p: { key: string }) => p.key)).toContain(project.key)

      const detail = await call(headers, 'get_project', { project: project.slug })
      expect(detail.data.statuses.map((s: { name: string }) => s.name)).toEqual(['Backlog', 'To Do', 'In Progress', 'Review', 'Done'])
      expect(detail.data.statuses.find((s: { name: string }) => s.name === 'Done').done).toBe(true)
    })

    it('turns an unknown status into a correction the model can act on', async () => {
      const card = await call(headers, 'create_card', { project: project.slug, title: 'Wrong turn' })
      const res = await call(headers, 'move_card', { card: card.data.ticket, status: 'Doing' })
      expect(res.isError).toBe(true)
      expect(res.content[0]!.text).toContain('Unknown status "Doing"')
      expect(res.content[0]!.text).toContain('"In Progress"')
    })

    it('hides another member\'s project behind not-found', async () => {
      const stranger = (await createTestToken(await registerTestUser())).headers
      const res = await call(stranger, 'get_card', { card: (await call(headers, 'create_card', { project: project.slug, title: 'Private' })).data.ticket })
      expect(res.isError).toBe(true)
      expect(res.content[0]!.text).toContain('not found')
      const list = await call(stranger, 'list_cards', { project: project.slug })
      expect(list.isError).toBe(true)
    })
  })
})
