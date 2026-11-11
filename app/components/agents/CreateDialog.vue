<script setup lang="ts">
import type { AgentDetail } from '~/types/agent'

/**
 * Create an agent. Creating commits once, so this is a dialog with Create and
 * Cancel; everything after it (tokens, projects, edits) happens on the agent's
 * own page, which is where this lands, with the token name ready to type into:
 * an agent with no token can do nothing yet.
 *
 * No manager field and no email field. The creator is the manager, which the one
 * line under the form says, and the address is generated: an agent never receives
 * mail, and its address is shown nowhere but its own page.
 */
const open = defineModel<boolean>('open', { required: true })

const { user } = useUserSession()
const toast = useToast()

const name = ref('')
const description = ref('')
const color = ref(COLOR_PALETTE[1]!)
const error = ref('')
const creating = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = ''
  description.value = ''
  // A different colour each time, so a batch of new agents does not start out
  // as one tint. The creator can change it here or later.
  color.value = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]!
  error.value = ''
})

async function create() {
  if (!name.value.trim() || creating.value) return
  creating.value = true
  error.value = ''
  try {
    const agent = await $fetch<AgentDetail>('/api/agents', {
      method: 'POST',
      body: { name: name.value.trim(), description: description.value.trim() || null, color: color.value }
    })
    open.value = false
    toast.add({ title: `${agent.name} created`, description: 'Generate a token so it can start working.', color: 'success' })
    await navigateTo({ path: `/agents/${agent.id}`, query: { new: '1' } })
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to create agent')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <UiModal
    v-model:open="open"
    icon="i-lucide-bot"
    tone="secondary"
    title="Create agent"
    description="An account for an AI tool. It acts through API tokens and can never sign in."
  >
    <template #body>
      <form
        class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6"
        @submit.prevent="create"
      >
        <div class="flex flex-col gap-3 min-w-0">
          <UFormField label="Name">
            <UInput
              v-model="name"
              placeholder="e.g. Claude"
              maxlength="100"
              autofocus
              required
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Description"
            help="Project owners see this when they add an agent."
          >
            <UTextarea
              v-model="description"
              placeholder="What it does, e.g. Implements backlog cards in Claude Code"
              :rows="2"
              maxlength="500"
              autoresize
              class="w-full"
            />
          </UFormField>

          <div class="mt-auto flex items-center gap-2 rounded-lg border border-default bg-muted px-3 py-2">
            <UiAvatar
              :src="user?.avatarUrl"
              :alt="user?.name"
              size="2xs"
            />
            <span class="text-sm text-muted">You'll be responsible for this agent.</span>
          </div>

          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            icon="i-lucide-alert-circle"
            :description="error"
          />
        </div>

        <div class="flex flex-col gap-4 sm:w-32">
          <div>
            <span class="block text-xs font-semibold uppercase tracking-label text-dimmed mb-1.5">Colour</span>
            <ColorPicker
              v-model="color"
              size="md"
            />
          </div>
          <div>
            <span class="block text-xs font-semibold uppercase tracking-label text-dimmed mb-1.5">Preview</span>
            <div class="flex items-center gap-1.5">
              <UiAvatar
                :alt="name || 'Agent'"
                kind="agent"
                :color="color"
                size="md"
              />
              <UiAvatar
                :alt="name || 'Agent'"
                kind="agent"
                :color="color"
                size="xs"
              />
              <UiAvatar
                :alt="name || 'Agent'"
                kind="agent"
                :color="color"
                size="3xs"
              />
            </div>
          </div>
        </div>
      </form>
    </template>

    <template #footer>
      <UiSaveBar
        submit-label="Create agent"
        submit-icon="i-lucide-plus"
        :loading="creating"
        :disabled="!name.trim()"
        :shortcut="false"
        @submit="create"
        @cancel="open = false"
      />
    </template>
  </UiModal>
</template>
