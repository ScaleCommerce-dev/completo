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

/**
 * Tiptap is the same invariant as Vue above, arrived at from the other direction.
 *
 * `@tiptap/core` keeps the extension and node-type registries, so two copies in one
 * bundle fail the `instanceof` checks that cross between them — an extension built
 * against one copy is invisible to an editor built against the other. The editor
 * renders, and silently drops whatever the second copy contributed.
 *
 * The setup that makes this likely is specific and worth stating. Nuxt UI *bundles*
 * Tiptap: `UEditor` imports `@tiptap/core`, `@tiptap/markdown`, StarterKit and half a
 * dozen extensions, and `@nuxt/ui@4.10.0` declares them as `^3`. None of that is
 * hoisted to the top of `node_modules`, so a custom extension — the mention node —
 * forces `@tiptap/core` into *our* dependencies as well. Two independent constraints
 * on one stateful package is the whole problem: `^3` on their side floats on any
 * re-resolution, so a caret on ours lets the two land on different 3.x releases.
 *
 * Hence exact pins, and hence this guard. It deliberately does not name a version —
 * a test that restates the number in `package.json` only proves the number was copied
 * twice. What it checks is the shape that keeps the number correct: one resolved
 * version per package, and no range on our side that could drift off it.
 *
 * A failure means re-pinning ours to whatever `@nuxt/ui` now resolves, in the same
 * change as the bump. See CF-7.
 */
describe('tiptap resolves as one copy', () => {
  const locked = readLockedVersions()

  const tiptap = [...locked.entries()]
    .filter(([name]) => name.startsWith('@tiptap/'))
    .sort(([a], [b]) => a.localeCompare(b))

  it('finds the tiptap packages at all', () => {
    // Same reason as the parser guard above: if Nuxt UI ever stops bundling Tiptap,
    // or the editor is removed, every assertion below would pass on an empty list.
    expect(tiptap.length).toBeGreaterThan(20)
    expect(locked.get('@tiptap/core')).toBeDefined()
  })

  it('resolves every @tiptap/* package to a single version', () => {
    // Derived from the lockfile rather than a list, so a package pulled in by a
    // future Nuxt UI is covered the day it arrives instead of the day it breaks.
    const duplicated = tiptap
      .filter(([, versions]) => versions.size > 1)
      .map(([name, versions]) => `${name}: ${[...versions].sort().join(', ')}`)

    expect(duplicated, 'two copies of a tiptap package cannot see each other').toEqual([])
  })

  it('pins our own tiptap dependencies exactly', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    // Both halves: the runtime pins the mention extension needs, and the dev pins
    // `prose-markdown.test.ts` uses to rebuild Nuxt UI's half of the editor. A
    // floating dev pin is the same defect — the round-trip guard would then be
    // measuring a different Tiptap from the one the app ships.
    const ours = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
      .filter(([name]) => name.startsWith('@tiptap/'))

    // The pins only exist to be matched against Nuxt UI's own resolution, so having
    // none at all would make the exactness check vacuous.
    expect(ours.length, 'the mention extension needs @tiptap/core in dependencies').toBeGreaterThan(0)

    const ranged = ours.filter(([, range]) => !/^\d+\.\d+\.\d+/.test(range))
    expect(ranged, 'a caret here floats off the version @nuxt/ui bundles').toEqual([])
  })
})
