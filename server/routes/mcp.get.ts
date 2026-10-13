// The MCP endpoint is stateless and never opens a server-to-client stream, so
// a GET has nothing to attach to. 405 with Allow is what the Streamable HTTP
// transport tells clients to expect from such a server.
export default defineEventHandler((event) => {
  setResponseStatus(event, 405)
  setResponseHeader(event, 'allow', 'POST')
  return { error: 'Completo MCP speaks JSON-RPC over POST. See /mcp in the README.' }
})
