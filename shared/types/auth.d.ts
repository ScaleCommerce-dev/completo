declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    avatarUrl: string | null
    colorMode: string | null
    isAdmin: boolean
    /**
     * Whether this person may create and manage agents: an admin, or someone an
     * admin allowed. Not stored in the cookie; `server/plugins/session-capabilities.ts`
     * adds it on every session fetch, so it follows the permission as it changes.
     */
    canManageAgents?: boolean
  }
}

export {}
