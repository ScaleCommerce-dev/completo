import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync, unlinkSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(DIR, '..')
const URL_FILE = resolve(DIR, '.test-server-url')
const PORT = 43210
const TEST_DB = 'test.db'
const TEST_UPLOAD_DIR = resolve(ROOT, 'data/test-uploads')

let server: ChildProcess | null = null

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
  try {
    execSync(`lsof -ti:${PORT} | xargs kill -9`, { stdio: 'ignore' })
  } catch { /* ignore */ }

  // Start the built server
  console.log('[global-setup] Starting server...')
  server = spawn('node', ['.output/server/index.mjs'], {
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
      AI_PROVIDER: '',
      NUXT_AI_PROVIDER: '',
      ANTHROPIC_API_KEY: '',
      NUXT_ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      NUXT_OPENAI_API_KEY: '',
      OPENROUTER_API_KEY: '',
      NUXT_OPENROUTER_API_KEY: '',
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
