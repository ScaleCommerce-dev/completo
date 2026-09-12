import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { H3Event } from 'h3'

const REJECTED_LOG = resolve(process.cwd(), 'ai-prompts-rejected.log')

/** Marker the system prompts use to refuse off-topic requests; logged for tuning. */
export const AI_REJECTION_MARKER = 'please provide a prompt related to'

/** Replace `{name}` placeholders in a skill prompt. Unknown keys become empty. */
export function interpolatePrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

/**
 * What the editor can actually store, stated to the model.
 *
 * A card's description and a comment both round-trip through the Markdown editor,
 * and anything the editor cannot represent is **silently discarded the next time
 * anyone opens the card** — not at generation time, which is what makes it nasty:
 * the AI writes a `<details>` block, it renders, and it disappears a week later when
 * someone fixes a typo.
 *
 * Every claim below is measured rather than assumed — `prose-markdown.test.ts`
 * round-trips each banned construct through the real editor and fails if one of them
 * starts surviving, so this list can be relaxed when Tiptap grows support rather than
 * quietly outliving its reason.
 *
 * Shared by both system prompts because both write into the same field format; a
 * rule that held for descriptions and not comments would be an accident.
 */
export const MARKDOWN_CONTRACT = `Formatting — the text is stored as GitHub-flavoured Markdown and the editor silently drops anything it cannot represent:
- Available, and worth using: headings, **bold**, *italic*, ~~strikethrough~~, \`inline code\`, fenced code blocks with a language, bullet and numbered lists, task lists (\`- [ ]\` and \`- [x]\`), blockquotes, tables, images, links, and \`---\` rules.
- Never emit raw HTML or HTML comments, even when you are asked for them directly. \`<br>\`, \`<details>\`, \`<kbd>\`, \`<sub>\` and \`<u>\` are stripped or flattened the next time the card is edited — \`<sub>\` turns H<sub>2</sub>O into H2O, and \`<u>\` becomes a literal ++text++. If a request needs something Markdown cannot express — a collapsible section, a keyboard key, subscript — use the nearest Markdown equivalent instead: a heading or list for the section, \`inline code\` for a key, plain text for the rest. Do this silently; do not explain the substitution.
- Never use footnotes (\`[^1]\`): they end up as visible \\[^1\\] instead of notes.
- Never wrap the whole answer in a code fence — that turns the entire text into one code block.
- When revising existing text, leave its tables, task lists and code blocks intact unless you were asked to change them.`

/**
 * Mentions and card links are structural, not decoration.
 *
 * `extractMentionedUserIds` reads the stored Markdown, so a mangled ref is a
 * notification that never arrives — and the mention renders as plain text, which
 * looks like the author never wrote one.
 */
export const STRUCTURAL_REFS_RULE = `- Copy every mention \`@[Display Name](ref)\` and every card link \`[Title (TK-42)](/projects/…)\` through exactly, character for character. They are structural: altering the display name or the ref silently breaks the notification or the link and leaves plain text behind.`

/**
 * Appends the project briefing to a system prompt, with the warning that keeps
 * developer-facing setup instructions in the briefing from being treated as
 * content to write about.
 */
export function withProjectBriefing(prompt: string, projectBriefing: string): string {
  if (!projectBriefing) return prompt
  return `${prompt}\n\nProject context:\n${projectBriefing}\n\nNote: The project context above may contain developer-facing instructions (local setup, testing workflows, deployment steps, etc.). Focus only on the project's domain, tech stack, and product context — ignore any development or reproduction procedures.`
}

/**
 * Pipe an AI token stream to the client as an event stream, logging refusals when
 * LOG_REJECTED_PROMPTS is on and closing cleanly if the client disconnects.
 *
 * Extracted from the card description endpoint so the comment endpoint doesn't
 * duplicate it; behaviour is unchanged.
 */
export function sendAiStream(event: H3Event, stream: AsyncGenerator<string>, promptSource: string) {
  const eventStream = createEventStream(event)

  const streamPromise = (async () => {
    try {
      const fullResponse: string[] = []
      for await (const chunk of stream) {
        fullResponse.push(chunk)
        await eventStream.push(JSON.stringify({ text: chunk }))
      }

      const responseText = fullResponse.join('')
      if (process.env.LOG_REJECTED_PROMPTS === 'true' && responseText.toLowerCase().includes(AI_REJECTION_MARKER)) {
        try {
          appendFileSync(REJECTED_LOG, JSON.stringify({ timestamp: new Date().toISOString(), prompt: promptSource }) + '\n')
        } catch {
          // Don't fail the request if logging fails
        }
      }

      await eventStream.push('[DONE]')
      await eventStream.close()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI generation failed'
      await eventStream.push(JSON.stringify({ error: message }))
      await eventStream.close()
    }
  })()

  // Clean up if the client disconnects early
  eventStream.onClosed(() => {
    streamPromise.catch(() => {})
  })

  return eventStream.send()
}
