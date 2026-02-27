import { createHash, randomBytes } from 'node:crypto'

const TOKEN_PREFIX = 'dzo_'

export function generateApiToken(): { rawToken: string, tokenHash: string, tokenPrefix: string } {
  const bytes = randomBytes(32)
  const rawToken = TOKEN_PREFIX + bytes.toString('base64url')
  return {
    rawToken,
    tokenHash: hashApiToken(rawToken),
    tokenPrefix: rawToken.slice(0, 8)
  }
}

export function hashApiToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}
