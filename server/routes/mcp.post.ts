/**
 * The MCP endpoint: Completo for Claude (claude.ai, Claude Desktop, Claude
 * Code) and any other MCP client, with no CLI and no code session.
 *
 * Streamable HTTP transport, stateless: every POST carries one JSON-RPC
 * message (or a batch), is answered with JSON, and nothing is remembered
 * between requests. There is no server-to-client stream, so GET answers 405
 * and no session id is issued. That is the simplest shape the specification
 * allows, and it is all a tool server needs.
 *
 * Authentication is the API's own: `Authorization: Bearer dzo_...` from the
 * profile page, which claude.ai sends as a fixed request header on a custom
 * connector. A signed-in browser session works too. There is no OAuth.
 *
 * The tools live in `server/mcp/tools.ts`; this file only speaks the protocol.
 */
import { ToolError, findTool, toolContext, toolDefinitions } from '../mcp/tools'
import type { JsonObject } from '../mcp/tools'

/** Newest first. A client asking for one of these gets it back; anything else gets the newest. */
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const INSTRUCTIONS = `Completo is a kanban app. Cards live in a project and have a status; a card is named by its ticket id, e.g. TK-42 (project key, dash, number). Boards and lists are views over the same cards: you move cards between statuses, never between boards. Statuses and tags are per project; when a name is uncertain, call get_project first rather than guess, and prefer the exact name it returns. A card's workflow is typically Backlog, To Do, In Progress, Review, Done. Done cards older than the project's retention window disappear from lists; that is expected. Descriptions are Markdown; checklist items are "- [ ]" lines.`

interface RpcRequest { jsonrpc?: string, id?: string | number | null, method?: string, params?: JsonObject }
interface RpcResponse { jsonrpc: '2.0', id: string | number | null, result?: unknown, error?: { code: number, message: string, data?: unknown } }

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603

function reply(id: RpcRequest['id'], result: unknown): RpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result }
}

function fail(id: RpcRequest['id'], code: number, message: string, data?: unknown): RpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } }
}

export default defineEventHandler(async (event) => {
  let userId: string
  try {
    userId = (await resolveAuth(event)).user.id
  } catch (err) {
    const e = err as { statusCode?: number, message?: string }
    setResponseStatus(event, e.statusCode === 403 ? 403 : 401)
    setResponseHeader(event, 'www-authenticate', 'Bearer realm="completo"')
    return fail(null, INVALID_REQUEST, e.statusCode === 403 ? (e.message || 'Forbidden') : 'Unauthorized: send an API token as "Authorization: Bearer <token>"')
  }

  let parsed: unknown
  try {
    const raw = await readRawBody(event, 'utf8')
    parsed = raw ? JSON.parse(raw) : undefined
  } catch {
    setResponseStatus(event, 400)
    return fail(null, PARSE_ERROR, 'Parse error: body is not JSON')
  }

  const batch = Array.isArray(parsed)
  const messages = (batch ? parsed : [parsed]) as unknown[]
  if (!messages.length) {
    setResponseStatus(event, 400)
    return fail(null, INVALID_REQUEST, 'Invalid request: empty batch')
  }

  const ctx = toolContext(event, userId)
  const responses: RpcResponse[] = []
  for (const message of messages) {
    const response = await handle(message, ctx)
    if (response) responses.push(response)
  }

  // Notifications only: accepted, nothing to say back.
  if (!responses.length) {
    setResponseStatus(event, 202)
    return null
  }
  return batch ? responses : responses[0]
})

async function handle(message: unknown, ctx: ReturnType<typeof toolContext>): Promise<RpcResponse | null> {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return fail(null, INVALID_REQUEST, 'Invalid request: expected a JSON-RPC object')
  }
  const req = message as RpcRequest
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return fail(req.id, INVALID_REQUEST, 'Invalid request: needs jsonrpc "2.0" and a method')
  }
  const isNotification = req.id === undefined || req.id === null

  // A response to something we never sent, or a notification: nothing to answer.
  if (req.method.startsWith('notifications/')) return null

  switch (req.method) {
    case 'initialize': {
      const asked = typeof req.params?.protocolVersion === 'string' ? req.params.protocolVersion : ''
      return reply(req.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'completo', version: useRuntimeConfig().public.appVersion || '0.0.0' },
        instructions: INSTRUCTIONS
      })
    }
    case 'ping':
      return reply(req.id, {})
    case 'tools/list':
      return reply(req.id, { tools: toolDefinitions })
    case 'tools/call': {
      const name = typeof req.params?.name === 'string' ? req.params.name : ''
      const tool = findTool(name)
      if (!tool) return fail(req.id, INVALID_PARAMS, `Unknown tool: ${name || '(none)'}`)
      const args = (req.params?.arguments && typeof req.params.arguments === 'object' ? req.params.arguments : {}) as JsonObject
      try {
        const result = await tool.run(ctx, args)
        return reply(req.id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: Array.isArray(result) ? { items: result } : result,
          isError: false
        })
      } catch (err) {
        if (err instanceof ToolError) {
          return reply(req.id, { content: [{ type: 'text', text: err.message }], isError: true })
        }
        console.error(`[mcp] ${name} failed`, err)
        return fail(req.id, INTERNAL_ERROR, 'Internal error')
      }
    }
    default:
      return isNotification ? null : fail(req.id, METHOD_NOT_FOUND, `Method not found: ${req.method}`)
  }
}
