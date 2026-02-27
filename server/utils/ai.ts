import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

const AI_LOG_FILE = resolve(process.cwd(), 'ai-debug.log')

function aiLog(label: string, data: string) {
  const timestamp = new Date().toISOString()
  const separator = '─'.repeat(60)
  appendFileSync(AI_LOG_FILE, `\n${separator}\n[${timestamp}] ${label}\n${separator}\n${data}\n`)
}

interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface AiStreamOptions {
  messages: AiMessage[]
  maxTokens?: number
  temperature?: number
}

interface AiProviderConfig {
  provider: string
  apiKey: string
  model: string
  baseUrl: string
}

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  openrouter: 'anthropic/claude-sonnet-4'
}

const DEFAULT_BASE_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  openrouter: 'https://openrouter.ai/api'
}

function getAiConfig(): AiProviderConfig | null {
  const config = useRuntimeConfig()
  const provider = config.aiProvider
  if (!provider) return null

  const providerConfigs: Record<string, { apiKey: string, model: string, baseUrl: string }> = {
    anthropic: { apiKey: config.anthropicApiKey, model: config.anthropicModel, baseUrl: config.anthropicBaseUrl },
    openai: { apiKey: config.openaiApiKey, model: config.openaiModel, baseUrl: config.openaiBaseUrl },
    openrouter: { apiKey: config.openrouterApiKey, model: config.openrouterModel, baseUrl: config.openrouterBaseUrl }
  }

  const pc = providerConfigs[provider]
  if (!pc?.apiKey) return null

  return {
    provider,
    apiKey: pc.apiKey,
    model: pc.model || config.aiModel || DEFAULT_MODELS[provider] || 'gpt-4o',
    baseUrl: pc.baseUrl || config.aiBaseUrl || DEFAULT_BASE_URLS[provider] || ''
  }
}

function isAiDebug(): boolean {
  return !!useRuntimeConfig().debugAiLog
}

export async function* streamAiResponse(options: AiStreamOptions): AsyncGenerator<string> {
  const config = getAiConfig()
  if (!config) {
    throw createError({ statusCode: 501, message: 'AI not configured. Set AI_PROVIDER and the corresponding API key.' })
  }

  const debug = isAiDebug()
  if (debug) {
    aiLog('REQUEST', JSON.stringify({
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      messages: options.messages
    }, null, 2))
  }

  const inner = config.provider === 'anthropic'
    ? streamAnthropic(config, options)
    : streamOpenAiCompatible(config, options)

  if (!debug) {
    yield* inner
    return
  }

  const chunks: string[] = []
  for await (const chunk of inner) {
    chunks.push(chunk)
    yield chunk
  }
  aiLog('RESPONSE', chunks.join(''))
}

async function* streamAnthropic(config: AiProviderConfig, options: AiStreamOptions): AsyncGenerator<string> {
  const systemMessage = options.messages.find(m => m.role === 'system')
  const userMessages = options.messages.filter(m => m.role !== 'system')

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: options.maxTokens || 2048,
    stream: true,
    messages: userMessages.map(m => ({ role: m.role, content: m.content }))
  }
  if (options.temperature !== undefined) {
    body.temperature = options.temperature
  }
  if (systemMessage) {
    body.system = systemMessage.content
  }

  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error(`Anthropic API error ${response.status}: ${text.slice(0, 200)}`)
    throw createError({ statusCode: 502, message: 'AI generation failed. Please try again later.' })
  }

  yield* parseSSE(response, (data) => {
    if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
      return data.delta.text || ''
    }
    return ''
  })
}

async function* streamOpenAiCompatible(config: AiProviderConfig, options: AiStreamOptions): AsyncGenerator<string> {
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: options.maxTokens || 2048,
    stream: true,
    messages: options.messages.map(m => ({ role: m.role, content: m.content }))
  }
  if (options.temperature !== undefined) {
    body.temperature = options.temperature
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`
  }
  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://completo.app'
    headers['X-Title'] = 'Completo'
  }

  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error(`${config.provider} API error ${response.status}: ${text.slice(0, 200)}`)
    throw createError({ statusCode: 502, message: 'AI generation failed. Please try again later.' })
  }

  yield* parseSSE(response, (data) => {
    const content = data.choices?.[0]?.delta?.content
    return content || ''
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function* parseSSE(response: Response, extractText: (data: Record<string, any>) => string): AsyncGenerator<string> {
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue
        if (trimmed === 'data: [DONE]') return

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6))
            const text = extractText(json)
            if (text) yield text
          } catch {
            // Skip unparseable lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
