import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync, unlinkSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(DIR, '..')
const URL_FILE = resolve(DIR, '.test-server-url')
const PORT = 43210
const TEST_DB = 'test.db'
const TEST_UPLOAD_DIR = resolve(ROOT, 'data/test-uploads')
const SERVER_ENTRYPOINT = '.output/server/index.mjs'

let server: ChildProcess | null = null

const aiEvalsEnabled = process.env.RUN_AI_EVALS === '1'

/**
 * Pass the ambient provider config through to the test server, mirroring each var
 * to its NUXT_ form so it wins over runtimeConfig. Only used when RUN_AI_EVALS=1.
 *
 * The per-provider MODEL vars matter as much as the keys: forwarding only the key
 * lets the server fall back to DEFAULT_MODELS, so the eval silently grades a
 * different model than the app uses. That happened — a weaker fallback translated a
 * German comment into English and two prompt assertions failed for the wrong reason.
 */
function aiProviderEnv(): Record<string, string> {
  const vars = [
    'AI_PROVIDER', 'AI_MODEL', 'AI_BASE_URL', 'AI_MAX_TOKENS',
    'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'ANTHROPIC_BASE_URL',
    'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL',
    'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENROUTER_BASE_URL'
  ]
  const env: Record<string, string> = {}
  for (const name of vars) {
    const value = process.env[name]
    if (!value) continue
    env[name] = value
    env[`NUXT_${name}`] = value
  }
  return env
}

// Free the test port before starting a new server.
//
// This used to be `lsof -ti:PORT | xargs kill -9`, which is a trap in the dev
// container: Alpine's `lsof` is a BusyBox symlink that silently ignores `-t`
// and `-i` and prints *every* open file as `PID<tab>path<tab>fd<tab>target`.
// `xargs kill -9` then received every token — killing PID 1 (zpinit) and the
// vitest process itself, so the suite died with SIGKILL (exit 137) before it
// ran a single integration test. BusyBox `fuser` is no help either: it resolves
// no owner for a listening TCP port in this image, with any argument form.
//
// So resolve the owner ourselves. On Linux we match our own server entrypoint
// via /proc, which is exact and structurally cannot hit PID 1 or the runner.
// Elsewhere (macOS) real `lsof -t -i` prints bare PIDs — accepted only when the
// output is purely numeric, which is what rules BusyBox back out.
function killStaleServer(port: number) {
  const pids = new Set<number>()

  try {
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      const pid = Number(entry)
      if (pid <= 1 || pid === process.pid) continue
      let cmdline: string
      try {
        cmdline = readFileSync(`/proc/${entry}/cmdline`, 'utf-8')
      } catch {
        continue // process exited, or not ours to read
      }
      if (cmdline.includes(SERVER_ENTRYPOINT)) pids.add(pid)
    }
  } catch { /* no /proc — not Linux */ }

  if (!pids.size) {
    try {
      const out = execSync(`lsof -t -i:${port}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      const tokens = out.trim().split(/\s+/).filter(Boolean)
      if (tokens.length && tokens.every(t => /^\d+$/.test(t))) {
        for (const token of tokens) {
          const pid = Number(token)
          if (pid > 1 && pid !== process.pid) pids.add(pid)
        }
      }
    } catch { /* nothing listening, or no usable lsof */ }
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch { /* already gone */ }
  }
}

export async function setup() {
  // Build Nuxt app (production)
  console.log('[global-setup] Building Nuxt app...')
  execSync('npx nuxt build', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  })

  // Remove stale test DB and push schema fresh
  const testDbPath = resolve(ROOT, TEST_DB)
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      unlinkSync(testDbPath + suffix)
    } catch { /* ignore */ }
  }
  console.log('[global-setup] Creating test database...')
  execSync(`DATABASE_URL=${TEST_DB} npx drizzle-kit push --force`, {
    cwd: ROOT,
    stdio: 'inherit'
  })

  // Kill any stale server from a previous crashed run
  killStaleServer(PORT)

  // Start the built server
  console.log('[global-setup] Starting server...')
  server = spawn('node', [SERVER_ENTRYPOINT], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      ALLOW_TEST_ENDPOINTS: '1',
      NUXT_SESSION_PASSWORD: 'at-least-32-characters-long-secret-key-for-testing',
      // Disable email sending in tests
      SMTP_HOST: '',
      // Disable AI in tests to avoid real API calls.
      // NUXT_ prefix overrides runtimeConfig at runtime.
      //
      // RUN_AI_EVALS=1 forwards the real provider config instead, for the prompt
      // evals in tests/integration/ai/*.eval.test.ts. Those cost money and are
      // non-deterministic, so they are skipped unless that variable is set — the
      // same gate that guards the tests themselves, applied to the server env.
      ...(aiEvalsEnabled
        ? aiProviderEnv()
        : {
            AI_PROVIDER: '',
            NUXT_AI_PROVIDER: '',
            ANTHROPIC_API_KEY: '',
            NUXT_ANTHROPIC_API_KEY: '',
            OPENAI_API_KEY: '',
            NUXT_OPENAI_API_KEY: '',
            OPENROUTER_API_KEY: '',
            NUXT_OPENROUTER_API_KEY: ''
          }),
      UPLOAD_DIR: TEST_UPLOAD_DIR
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  server.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.error('[server]', text)
  })

  // Wait for server to be ready
  const serverUrl = `http://localhost:${PORT}`
  const start = Date.now()
  const timeout = 30000
  while (Date.now() - start < timeout) {
    try {
      await fetch(serverUrl)
      break
    } catch {
      await new Promise(r => setTimeout(r, 200))
    }
  }
  if (Date.now() - start >= timeout) {
    throw new Error('Server did not start within 30s')
  }

  console.log(`[global-setup] Server ready at ${serverUrl}`)
  writeFileSync(URL_FILE, serverUrl, 'utf-8')
}

export async function teardown() {
  if (server) {
    server.kill('SIGTERM')
    await new Promise(r => setTimeout(r, 500))
    if (!server.killed) server.kill('SIGKILL')
  }
  try {
    unlinkSync(URL_FILE)
  } catch { /* ignore */ }
  try {
    rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true })
  } catch { /* ignore */ }
}
