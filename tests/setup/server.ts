import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ofetch } from 'ofetch'
import { expect } from 'vitest'

const DIR = fileURLToPath(new URL('.', import.meta.url))
const URL_FILE = resolve(DIR, '..', '.test-server-url')

let serverUrl: string | null = null

function getServerUrl(): string {
  if (!serverUrl) {
    serverUrl = readFileSync(URL_FILE, 'utf-8').trim()
  }
  return serverUrl
}

export function url(path: string): string {
  return `${getServerUrl()}${path}`
}

export const $fetch = ofetch.create({
  get baseURL() {
    return getServerUrl()
  }
})

/**
 * Assert that a $fetch promise rejects with the expected HTTP status code.
 * Replaces the `.catch(e => e)` + `expect(err.statusCode || err.status).toBe(code)` pattern.
 */
export async function expectError(promise: Promise<unknown>, statusCode: number): Promise<void> {
  const err = await promise.catch(e => e)
  expect(err.statusCode || err.status).toBe(statusCode)
}
