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
