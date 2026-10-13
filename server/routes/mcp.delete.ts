// No session id is ever issued (see mcp.post.ts), so there is no session to
// end. 405 with Allow is what the Streamable HTTP
// transport tells clients to expect from such a server.
export default defineEventHandler((event) => {
  setResponseStatus(event, 405)
  setResponseHeader(event, 'allow', 'POST')
  return { error: 'Completo MCP speaks JSON-RPC over POST. See /mcp in the README.' }
})
