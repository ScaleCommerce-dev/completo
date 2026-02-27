declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    avatarUrl: string | null
    colorMode: string | null
    isAdmin: boolean
  }
}

export {}
