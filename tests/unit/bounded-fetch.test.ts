import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { BoundedCache, FetchLimitError, fetchJsonBounded, readTextCapped } from '../../server/utils/bounded-fetch'

/**
 * `server/utils/bounded-fetch.ts`, which fetches OAuth client metadata documents
 * that an anonymous caller names by URL. ofetch's timeout ended at the headers and
 * its body read had no cap, so one endless response ran the server out of memory.
 * Each case below is a server behaving badly on purpose.
 */
describe('fetchJsonBounded', () => {
  let server: http.Server
  let base: string

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/ok') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ client_id: 'x' }))
      } else if (req.url === '/endless') {
        // Headers at once, then a body that never ends.
        res.writeHead(200, { 'content-type': 'application/json' })
        const chunk = Buffer.alloc(16 * 1024, 0x20)
        const pump = () => {
          if (res.destroyed) return
          if (res.write(chunk)) setImmediate(pump)
          else res.once('drain', pump)
        }
        pump()
      } else if (req.url === '/slow-body') {
        // Headers at once, body never: the deadline must cover the body too.
        res.writeHead(200, { 'content-type': 'application/json' })
        res.write('{')
      } else if (req.url === '/declared-huge') {
        res.writeHead(200, { 'content-type': 'application/json', 'content-length': String(1024 * 1024 * 1024) })
        res.write('{')
      } else if (req.url === '/redirect') {
        res.writeHead(302, { location: '/ok' })
        res.end()
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.closeAllConnections()
    server.close()
  })

  it('returns a small document', async () => {
    expect(await fetchJsonBounded(`${base}/ok`, { maxBytes: 1024, timeoutMs: 2000 })).toEqual({ client_id: 'x' })
  })

  it('stops an endless body at the byte cap', async () => {
    await expect(fetchJsonBounded(`${base}/endless`, { maxBytes: 32 * 1024, timeoutMs: 5000 }))
      .rejects.toBeInstanceOf(FetchLimitError)
  })

  it('refuses a declared length over the cap without reading it', async () => {
    await expect(fetchJsonBounded(`${base}/declared-huge`, { maxBytes: 32 * 1024, timeoutMs: 5000 }))
      .rejects.toBeInstanceOf(FetchLimitError)
  })

  it('times out on a body that never arrives, not only on headers', async () => {
    const started = Date.now()
    await expect(fetchJsonBounded(`${base}/slow-body`, { maxBytes: 1024, timeoutMs: 300 })).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('follows no redirect', async () => {
    await expect(fetchJsonBounded(`${base}/redirect`, { maxBytes: 1024, timeoutMs: 2000 })).rejects.toThrow()
  })
})

describe('readTextCapped', () => {
  it('reads a body within the cap', async () => {
    expect(await readTextCapped(new Response('hello'), 5)).toBe('hello')
  })

  it('refuses one byte over', async () => {
    await expect(readTextCapped(new Response('hello!'), 5)).rejects.toBeInstanceOf(FetchLimitError)
  })
})

describe('BoundedCache', () => {
  it('drops the least recently used entry past its bound', () => {
    const cache = new BoundedCache<string, number>(2, 60_000)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a')
    cache.set('c', 3)
    expect(cache.size).toBe(2)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(1)
    expect(cache.get('c')).toBe(3)
  })

  it('forgets an entry past its age', () => {
    const cache = new BoundedCache<string, number>(10, 0)
    cache.set('a', 1)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.size).toBe(0)
  })
})
