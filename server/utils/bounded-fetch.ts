/**
 * Fetching a document from a URL someone else chose, with limits that hold for
 * the whole response, and a cache that cannot grow without bound.
 *
 * Written for OAuth client metadata documents (`oauth-server.ts`), which any
 * anonymous caller names by URL on `POST /oauth/token`. ofetch's `timeout` stops
 * at the response headers and its body read has no size limit, so one request
 * naming a server that answers `application/json` and never stops streaming was
 * buffered until the process ran out of memory.
 */

export class FetchLimitError extends Error {}

/** Read a response body as text, refusing more than `maxBytes`. */
export async function readTextCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new FetchLimitError(`Response declares ${declared} bytes, over ${maxBytes}`)
  }
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new FetchLimitError(`Response is over ${maxBytes} bytes`)
      chunks.push(value)
    }
  } catch (e) {
    // Stop the transfer rather than leave the connection draining.
    await reader.cancel().catch(() => {})
    throw e
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    bytes.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/**
 * GET a JSON document with one deadline for headers *and* body, a byte cap, and
 * no redirects followed (a public URL answering `302` to an internal address
 * would otherwise be fetched after all).
 */
export async function fetchJsonBounded(url: string, opts: { maxBytes: number, timeoutMs: number }): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs)
  try {
    const res = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
      headers: { accept: 'application/json' }
    })
    if (!res.ok) throw new FetchLimitError(`HTTP ${res.status}`)
    return JSON.parse(await readTextCapped(res, opts.maxBytes))
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

/**
 * A map with a size bound and an age limit. Insertion order is recency: a read
 * moves an entry to the end, and a write past the bound drops the oldest.
 */
export class BoundedCache<K, V> {
  private entries = new Map<K, { value: V, at: number }>()

  constructor(private readonly maxEntries: number, private readonly ttlMs: number) {}

  get(key: K): V | undefined {
    const hit = this.entries.get(key)
    if (!hit) return undefined
    this.entries.delete(key)
    if (Date.now() - hit.at >= this.ttlMs) return undefined
    this.entries.set(key, hit)
    return hit.value
  }

  set(key: K, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, { value, at: Date.now() })
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value as K)
    }
  }

  get size(): number {
    return this.entries.size
  }
}
