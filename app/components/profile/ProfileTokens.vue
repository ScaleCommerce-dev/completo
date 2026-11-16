<template>
  <ApiTokens
    class="mt-6"
    title="API Tokens"
  >
    Create personal access tokens to authenticate with the API, or to connect Claude through MCP at <code class="text-xs">/mcp</code>. Tokens have the same permissions as your account.
    <template #created="{ token }">
      <ProfileConnectClaude :token="token" />
    </template>
  </ApiTokens>
</template>
