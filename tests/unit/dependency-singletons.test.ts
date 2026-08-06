import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Some packages must resolve to exactly ONE version across the whole dependency
 * graph. Vue keeps module-level state (the current-instance pointer, the effect
 * scope stack, injection lookups), so two copies in one bundle break at runtime
 * with errors like "Cannot read properties of null (reading 'ce')" — the app
 * fails to mount while every API test still passes.
 *
 * That happened for real: upgrading nuxt 4.4.6 -> 4.5.1 moved nuxt to vue
 * 3.5.40 while @nuxt/test-utils held vue 3.5.34 (it declares vue as a hard
 * dependency, not a peer), and @vue/server-renderer@3.5.34 has an exact
 * `vue: 3.5.34` peer that anchored the older copy in place. Nothing in the
 * suite noticed, because the integration tests talk HTTP to a built server and
 * never mount the client.
 *
 * This test encodes that invariant so a lockfile change trips it immediately.
 * Fix a failure with `pnpm update vue <other-package>` (which usually collapses
 * a stale pin), or add a `pnpm.overrides` entry pinning the single version.
 */

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

// Runtime packages that carry module-level state.
const MUST_BE_SINGLETON = [
  'vue',
  '@vue/runtime-core',
  '@vue/runtime-dom',
  '@vue/reactivity',
  '@vue/server-renderer',
  'vue-router'
]

// Deliberately NOT listed above: @vue/compiler-core, @vue/compiler-dom and
// @vue/shared. Those are build-time only and legitimately appear twice, because
// vue-tsc's @vue/language-core pins an older compiler than the app uses.
// Duplicating them has no runtime effect.

/**
 * Collect `name -> versions` from the lockfile's top-level `packages:` block.
 * Keys look like `  vue@3.5.40:` or `  '@vue/runtime-core@3.5.40':`, and in
 * lockfile v9 that block carries no peer-suffixes (those live in `snapshots:`).
 */
function readLockedVersions(): Map<string, Set<string>> {
  const lockfile = readFileSync(resolve(ROOT, 'pnpm-lock.yaml'), 'utf-8')
  const versions = new Map<string, Set<string>>()
  let inPackages = false

  for (const line of lockfile.split('\n')) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true
      continue
    }
    if (/^\S/.test(line)) {
      inPackages = false // any other top-level key ends the block
      continue
    }
    if (!inPackages) continue

    const match = /^ {2}('?)(.+?)\1:\s*$/.exec(line)
    if (!match) continue

    const spec = match[2]!
    const at = spec.lastIndexOf('@')
    if (at <= 0) continue

    const name = spec.slice(0, at)
    const version = spec.slice(at + 1)
    if (!versions.has(name)) versions.set(name, new Set())
    versions.get(name)!.add(version)
  }

  return versions
}

describe('dependency singletons', () => {
  const locked = readLockedVersions()

  // Guard the parser itself: if the lockfile format changes and parsing yields
  // nothing, every assertion below would pass vacuously.
  it('parses the lockfile', () => {
    expect(locked.size).toBeGreaterThan(500)
    expect(locked.get('vue')).toBeDefined()
  })

  it.each(MUST_BE_SINGLETON)('resolves %s to a single version', (name) => {
    const found = [...(locked.get(name) ?? [])].sort()
    expect(found.length, `${name} is duplicated: ${found.join(', ')}`).toBeLessThanOrEqual(1)
  })
})
