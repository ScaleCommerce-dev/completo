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

import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { BlockList, isIP, type LookupFunction } from 'node:net'

export class FetchLimitError extends Error {}

/**
 * GET a JSON document with one deadline for headers *and* body, a byte cap, and
 * no redirects followed (a public URL answering `302` to an internal address
 * would otherwise be fetched after all).
 *
 * `refuseAddress` is asked about the address the connection is actually opened
 * to, inside the socket's own DNS lookup. Checking the name with a separate
 * lookup first and then letting `fetch` resolve it again left a window a
 * rebinding resolver could use: public on the check, internal on the connect.
 * Node's `fetch` takes no lookup hook, hence `node:http(s)` here.
 */
export async function fetchJsonBounded(url: string, opts: {
  maxBytes: number
  timeoutMs: number
  refuseAddress?: (address: string, family: number) => boolean
}): Promise<unknown> {
  const u = new URL(url)
  const request = u.protocol === 'https:' ? httpsRequest : u.protocol === 'http:' ? httpRequest : null
  if (!request) throw new FetchLimitError(`Unsupported protocol ${u.protocol}`)
  const refuse = opts.refuseAddress

  // An IP literal never reaches `lookup`, so it is checked here.
  const literal = u.hostname.replace(/^\[|\]$/g, '')
  if (refuse && isIP(literal) && refuse(literal, isIP(literal))) {
    throw new FetchLimitError('Refused address')
  }

  const lookup: LookupFunction | undefined = refuse
    ? (hostname, options, callback) => {
        dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
          if (err) return callback(err, '', 0)
          const list = addresses as unknown as LookupAddress[]
          if (!list.length || list.some(a => refuse(a.address, a.family))) {
            return callback(new FetchLimitError('Refused address'), '', 0)
          }
          if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list)
          callback(null, list[0]!.address, list[0]!.family)
        })
      }
    : undefined

  return await new Promise<unknown>((resolve, reject) => {
    const req = request(u, { method: 'GET', headers: { accept: 'application/json' }, lookup }, (res) => {
      const status = res.statusCode ?? 0
      if (status < 200 || status >= 300) {
        res.resume()
        return req.destroy(new FetchLimitError(`HTTP ${status}`))
      }
      const declared = Number(res.headers['content-length'])
      if (Number.isFinite(declared) && declared > opts.maxBytes) {
        return req.destroy(new FetchLimitError(`Response declares ${declared} bytes, over ${opts.maxBytes}`))
      }
      const chunks: Buffer[] = []
      let total = 0
      res.on('data', (chunk: Buffer) => {
        total += chunk.byteLength
        if (total > opts.maxBytes) return req.destroy(new FetchLimitError(`Response is over ${opts.maxBytes} bytes`))
        chunks.push(chunk)
      })
      res.on('end', () => {
        clearTimeout(timer)
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (e) {
          reject(e)
        }
      })
      res.on('error', reject)
    })
    const timer = setTimeout(() => req.destroy(new FetchLimitError(`No complete response within ${opts.timeoutMs} ms`)), opts.timeoutMs)
    req.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    req.end()
  })
}

// Every range a metadata-document fetch has no business reaching: loopback, private,
// link-local (cloud metadata lives at 169.254.169.254), CGNAT, ULA, multicast, reserved.
const INTERNAL = new BlockList()
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) {
  INTERNAL.addSubnet(net, bits, 'ipv4')
}
// NAT64 (`64:ff9b::/96`, and the local-use `64:ff9b:1::/48`) and 6to4 (`2002::/16`)
// carry an IPv4 address inside an IPv6 one, so on a network that routes them,
// `64:ff9b::a00:5` is 10.0.0.5. Refused whole: no metadata document lives there.
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
  ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['2002::', 16]] as const) {
  INTERNAL.addSubnet(net, bits, 'ipv6')
}

/** True for an address a metadata-document fetch must not connect to. */
export function isInternalAddress(address: string, family: number): boolean {
  // An IPv4-mapped IPv6 address (`::ffff:10.0.0.5`) is the IPv4 address.
  const mapped = family === 6 && address.toLowerCase().startsWith('::ffff:') && address.includes('.')
  return mapped
    ? INTERNAL.check(address.slice(7), 'ipv4')
    : INTERNAL.check(address, family === 6 ? 'ipv6' : 'ipv4')
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
