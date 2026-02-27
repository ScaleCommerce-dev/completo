interface AiDescriptionContext {
  title: string
  description?: string
  tags?: string[]
  priority?: string
  projectSlug: string
}

interface AiGeneratePayload {
  skillId?: string
  userPrompt?: string
}

export function useAiDescription(descriptionRef: Ref<string>) {
  const toast = useToast()
  const isGenerating = ref(false)
  const error = ref<string | null>(null)
  const pendingReview = ref(false)
  const previousDescription = ref('')
  let abortController: AbortController | null = null

  async function generate(context: AiDescriptionContext, payload?: AiGeneratePayload | 'generate' | 'improve') {
    if (isGenerating.value) return
    isGenerating.value = true
    error.value = null
    pendingReview.value = false

    abortController = new AbortController()

    // Support legacy mode string for backward compat
    let mode: string | undefined
    let skillId: string | undefined
    let userPrompt: string | undefined
    if (typeof payload === 'string') {
      mode = payload
    } else if (payload) {
      skillId = payload.skillId
      userPrompt = payload.userPrompt
    }

    // Save original before any changes
    previousDescription.value = descriptionRef.value

    try {
      const response = await fetch(`/api/projects/${context.projectSlug}/ai/generate-description`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: context.title,
          description: context.description,
          tags: context.tags,
          priority: context.priority,
          mode: mode || (!skillId && !userPrompt ? (context.description?.trim() ? 'improve' : 'generate') : undefined),
          skillId,
          userPrompt,
          pageUrl: window.location.pathname
        }),
        signal: abortController.signal
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || `AI request failed (${response.status})`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''

      // Clear for streaming
      descriptionRef.value = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6))
              if (data.error) {
                throw new Error(data.error)
              }
              if (data.text) {
                descriptionRef.value += data.text
              }
            } catch (e: unknown) {
              if (e instanceof Error && !e.message.includes('JSON')) {
                throw e
              }
            }
          }
        }
      }
      // Detect off-topic refusal and restore original description
      const result = descriptionRef.value.trim()
      if (result.toLowerCase().includes('please provide a prompt related to')) {
        descriptionRef.value = previousDescription.value
        error.value = 'Please provide a prompt related to this card'
        toast.add({ title: 'Please provide a prompt related to this card', color: 'warning' })
      } else {
        // Successful generation — enter review state
        pendingReview.value = true
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      const msg = e instanceof Error ? e.message : 'AI generation failed'
      error.value = msg
      toast.add({ title: msg, color: 'error' })
    } finally {
      isGenerating.value = false
      abortController = null
    }
  }

  function cancel() {
    abortController?.abort()
    isGenerating.value = false
    descriptionRef.value = previousDescription.value
  }

  function accept() {
    pendingReview.value = false
  }

  function decline() {
    descriptionRef.value = previousDescription.value
    pendingReview.value = false
  }

  return {
    isGenerating: readonly(isGenerating),
    error: readonly(error),
    pendingReview: readonly(pendingReview),
    generate,
    cancel,
    accept,
    decline
  }
}
