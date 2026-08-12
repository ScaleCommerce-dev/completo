import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, url } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, createTestCard, createTestComment, getBoard } from '../../setup/fixtures'

/**
 * Prompt quality eval for the default comment skills — NOT part of CI.
 *
 * These call a real AI provider, so they cost money and are non-deterministic. The
 * rest of the suite deliberately never reaches `streamAiResponse` for that reason.
 * Run deliberately:
 *
 *   zdev exec app sh -c 'RUN_AI_EVALS=1 pnpm vitest run --project integration comment-skills'
 *
 * Treat a failure as "look at the prompt", not "the build is broken" — a model can
 * have an off run. Assertions check structural invariants (did the mention survive?
 * is it still German? did the vague reference get resolved?) rather than judging
 * prose, which no assertion does reliably.
 *
 * Both regressions these were written for were real, found by hand-testing:
 *  - "Do not add greetings" made the model delete `Hi @[Lola6](be2b12f3)` — taking
 *    the mention with it, silently un-notifying the person being addressed.
 *  - "Do not invent facts" was read as "never use the card", so a vague reference
 *    stayed vague even when the card spelled out exactly what it meant.
 *
 * RESULTS ARE MODEL-DEPENDENT, and that is part of what this measures. With the same
 * prompts and code:
 *   google/gemini-2.5-flash       8/8
 *   google/gemini-2.5-flash-lite  6/8  — translates short non-English drafts to
 *                                        English and skips resolving vague
 *                                        references, despite being told twice
 * So a failure here can mean "the configured model is too small for these skills"
 * rather than "the prompt is wrong". Check with a stronger model before editing
 * prompts: `OPENROUTER_MODEL=google/gemini-2.5-flash RUN_AI_EVALS=1 ...`
 */
const ENABLED = process.env.RUN_AI_EVALS === '1' && !!process.env.AI_PROVIDER

const MIGRATION = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../server/database/migrations/0003_default_ai_skills.sql'
)

/**
 * Pull the shipped prompts out of the migration.
 *
 * The eval must exercise the text real installations get. The test DB is built with
 * `drizzle-kit push`, so migration 0003 never runs here and the skills are absent —
 * and hardcoding copies of the prompts would let them drift from what ships.
 */
function shippedCommentSkills(): Array<{ name: string, prompt: string }> {
  const sql = readFileSync(MIGRATION, 'utf-8')
  // The migration also ships the two card skills, so filter by the scope literal.
  const skills: Array<{ name: string, prompt: string, scope: string }> = []

  for (const statement of sql.split('INSERT INTO').slice(1)) {
    // SQL string literals in order: id, name, prompt, scope
    const literals: string[] = []
    let i = statement.indexOf('(')
    while (literals.length < 4 && i < statement.length) {
      i = statement.indexOf('\'', i)
      if (i === -1) break
      let j = i + 1
      let value = ''
      while (j < statement.length) {
        if (statement[j] === '\'') {
          // '' is an escaped quote inside a SQL string literal
          if (statement[j + 1] !== '\'') break
          value += '\''
          j += 2
          continue
        }
        value += statement[j]
        j++
      }
      literals.push(value)
      i = j + 1
    }
    if (literals.length >= 4) {
      skills.push({ name: literals[1]!, prompt: literals[2]!, scope: literals[3]! })
    }
  }

  return skills.filter(s => s.scope === 'comment').map(({ name, prompt }) => ({ name, prompt }))
}

/** Drain the SSE stream the AI endpoints return into the final text. */
async function runSkill(user: TestUser, cardId: number, body: string, skillId: string): Promise<string> {
  const res = await fetch(url(`/api/cards/${cardId}/ai/comment`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...user.headers },
    body: JSON.stringify({ body, skillId })
  })
  if (!res.ok) throw new Error(`AI request failed: ${res.status} ${await res.text()}`)

  let out = ''
  for (const line of (await res.text()).split('\n')) {
    const payload = line.startsWith('data:') ? line.slice(5).trim() : line.trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const parsed = JSON.parse(payload)
      if (parsed.error) throw new Error(`AI error: ${parsed.error}`)
      if (typeof parsed.text === 'string') out += parsed.text
    } catch {
      // non-JSON keepalive lines
    }
  }

  const text = out.trim()
  // Fail loudly rather than letting every assertion pass vacuously against ''.
  // This caught a real problem: the harness disables AI on the test server, so the
  // first run produced empty output and the no-preamble assertion "passed".
  if (!text) {
    throw new Error('AI returned no text — is the provider configured on the test server? (RUN_AI_EVALS=1 forwards it)')
  }
  return text
}

describe.skipIf(!ENABLED)('AI comment skill evals', () => {
  let user: TestUser
  let projectId: string
  let statusId: string
  let cardId: number
  let grammarSkillId: string
  let claritySkillId: string

  beforeAll(async () => {
    user = await registerTestUser()
    const admin = await createAdminUser()

    const project = await createTestProject(user)
    projectId = project.id
    const board = await createTestBoard(user, projectId)
    statusId = (await getBoard(user, board.id)).columns[0]!.id

    // Card whose description makes "the thing with the name" resolvable
    const card = await createTestCard(user, projectId, statusId, {
      title: 'Add the Creator of a ticket',
      description: [
        '## Add Creator Field to Tickets',
        '',
        '- [ ] A `creatorId` field is added to the `tickets` table.',
        '- [ ] The creator\'s name is displayed on the ticket view.'
      ].join('\n')
    })
    cardId = card.id

    const shipped = shippedCommentSkills()
    expect(shipped, 'could not parse prompts out of migration 0003').toHaveLength(2)

    for (const skill of shipped) {
      const created = await $fetch('/api/admin/skills', {
        method: 'POST',
        body: { name: skill.name, prompt: skill.prompt, scope: 'comment' },
        headers: admin.headers
      }) as { id: string }
      if (/spelling/i.test(skill.name)) grammarSkillId = created.id
      else claritySkillId = created.id
    }
  })

  describe('Improve Clarity', () => {
    it('preserves a mention that sits inside an opening greeting', async () => {
      const draft = 'Hi @[Lola6](be2b12f3) ich glb dass muss nochmal überarbeitet werdne. die sache mit dem namen klappt nicht'
      const out = await runSkill(user, cardId, draft, claritySkillId)

      expect(out).toContain('@[Lola6](be2b12f3)')
    })

    it('keeps the comment in its original language', async () => {
      const draft = 'Hi @[Lola6](be2b12f3) die sache mit dem namen klappt nicht, bitte nochmal anschauen'
      const out = await runSkill(user, cardId, draft, claritySkillId)

      expect(out).toMatch(/\b(nicht|muss|werden|bitte|das|die)\b/i)
    })

    it('resolves a vague reference the card explains', async () => {
      const draft = 'Hi @[Lola6](be2b12f3) die sache mit dem namen klappt nicht'
      const out = await runSkill(user, cardId, draft, claritySkillId)

      // The card says the creator's name is displayed — say that
      expect(out).toMatch(/ersteller|creator/i)
      expect(out.toLowerCase()).not.toContain('sache mit dem namen')
    })

    it('uses prior comments as context', async () => {
      const card = await createTestCard(user, projectId, statusId, { title: 'Rate limiting' })
      await createTestComment(user, card.id, 'The rate limiter rejects requests above 100/min.')

      const out = await runSkill(user, card.id, 'the limit thing is too strict imo', claritySkillId)

      expect(out).toMatch(/rate.?limit|100|min/i)
    })

    it('leaves a vague reference alone when nothing explains it', async () => {
      // The opposite failure: inventing a referent in order to look helpful
      const card = await createTestCard(user, projectId, statusId, { title: 'Unrelated card' })
      const draft = 'that other thing we discussed is still broken, can you look at it'
      const out = await runSkill(user, card.id, draft, claritySkillId)

      expect(out).toMatch(/thing|it\b|discussed|broken/i)
      expect(out.length).toBeLessThan(draft.length * 3)
    })
  })

  describe('Fix Spelling & Grammar', () => {
    it('fixes typos without restructuring, and keeps the greeting', async () => {
      const draft = 'Hi @[Lola6](be2b12f3) this shoud be fixxed becuase the tests is failing'
      const out = await runSkill(user, cardId, draft, grammarSkillId)

      expect(out).toContain('@[Lola6](be2b12f3)')
      expect(out).toMatch(/should/i)
      expect(out).toMatch(/fixed/i)
      expect(out).toMatch(/because/i)
      // Conservative: a correction, not a rewrite
      expect(out.length).toBeLessThan(draft.length * 1.5)
    })

    it('never edits inside code blocks', async () => {
      const draft = 'Hi @[Lola6](be2b12f3) teh call fails:\n\n```js\nconst recieve = geTData()\n```'
      const out = await runSkill(user, cardId, draft, grammarSkillId)

      expect(out).toContain('const recieve = geTData()')
    })

    it('returns only the comment text, with no preamble', async () => {
      const out = await runSkill(user, cardId, 'this shoud be fixxed', grammarSkillId)

      expect(out).not.toMatch(/^(here'?s|revised|corrected|sure|certainly)\b/i)
      expect(out).not.toMatch(/^["'`]/)
    })
  })
})
