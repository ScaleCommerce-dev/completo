import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { BoundedCache, FetchLimitError, fetchJsonBounded, isInternalAddress } from '../../server/utils/bounded-fetch'

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

  // The server above is on the loopback, so these reach a live listener: a refusal
  // here is the address check, not a name that failed to resolve.
  it('refuses to connect to an internal address, by literal and by name', async () => {
    const opts = { maxBytes: 1024, timeoutMs: 2000, refuseAddress: isInternalAddress }
    await expect(fetchJsonBounded(`${base}/ok`, opts)).rejects.toBeInstanceOf(FetchLimitError)
    const byName = base.replace('127.0.0.1', 'localhost')
    await expect(fetchJsonBounded(`${byName}/ok`, opts)).rejects.toBeInstanceOf(FetchLimitError)
    // And the same request without the check gets through, so the refusal is the check's.
    expect(await fetchJsonBounded(`${byName}/ok`, { maxBytes: 1024, timeoutMs: 2000 })).toEqual({ client_id: 'x' })
  })
})

describe('isInternalAddress', () => {
  it.each([
    ['10.0.0.5', 4], ['127.0.0.1', 4], ['169.254.169.254', 4], ['100.64.0.1', 4],
    ['::1', 6], ['fd00::1', 6], ['::ffff:10.0.0.5', 6],
    // NAT64 and 6to4 embed an IPv4 address.
    ['64:ff9b::a00:5', 6], ['64:ff9b:1::1', 6], ['2002:a00:5::1', 6]
  ])('refuses %s', (address, family) => {
    expect(isInternalAddress(address, family)).toBe(true)
  })

  it.each([['93.184.215.14', 4], ['2606:4700::1111', 6]])('allows public %s', (address, family) => {
    expect(isInternalAddress(address, family)).toBe(false)
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
