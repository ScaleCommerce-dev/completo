import type { H3Event } from 'h3'

/** RFC 8414: what the authorization server offers. One document, served at the root `.well-known`. */
export function authorizationServerMetadata(event: H3Event) {
  const origin = publicOrigin(event)
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    client_id_metadata_document_supported: true
  }
}

/** RFC 9728: the MCP endpoint names the server that protects it. Served at both the root and the path-aware location. */
export function protectedResourceMetadata(event: H3Event) {
  return {
    resource: mcpResource(event),
    authorization_servers: [publicOrigin(event)],
    bearer_methods_supported: ['header'],
    resource_name: 'Completo'
  }
}

/** Discovery and token endpoints are read cross-origin by browser-based MCP clients. */
export function allowCrossOrigin(event: H3Event) {
  setResponseHeader(event, 'access-control-allow-origin', '*')
}
